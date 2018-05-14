//  ------------------------[ GET MESSAGE FOLDERS ] ------------------------

app.get('/messagefolders/:id?', (req, res) => {

    if (!general.checklogin(res, req)) return false;

    if (req.session.level <= 1) {
        res.json({ result: 'error', message: 'You don\'t have the necessary privileges to access message folders.' });
        return false;
    }

    if (req.params.id) {
        finder = general.makeFinder(res, req.params.id, true);
        if (!finder) return false;
        finder = { _id: finder };
    } else
        finder = {};

    if (typeof req.query.sortMode == 'undefined') req.query.sortMode = '1';
    if (typeof req.query.sortField == 'undefined') req.query.sortField = '1';
    if (typeof req.query.searchField == 'undefined') req.query.searchField = '1';
    if (typeof req.query.searchMode == 'undefined') req.query.searchMode = '1';
    if (typeof req.query.searchText == 'undefined') req.query.searchText = '';

    //  search

    if (req.query.searchText.length >= 3) {
        var searchValue = '';
        switch (req.query.searchMode) {
            //  %like%
            case '1': searchValue = { $regex: new RegExp(req.query.searchText, 'gi') }; break;
            //  like%
            case '2': searchValue = { $regex: new RegExp('^' + req.query.searchText, 'gi'), }; break;
            //  like
            case '3': searchValue = req.query.searchText; break;
        }
        finder = { 'name': searchValue };
    }

    //  sorting

    var sorter = {};
    switch (req.query.sortField) {
        case '1': sorter = { name: Number(req.query.sortMode) }; break;
        case '2': sorter = { created: Number(req.query.sortMode) }; break;
    }

    general.MongoDB_connect(settings.mongoDB, db => {

        db.collection('messageFolders').aggregate([
            { $match: finder },
            { $sort: sorter },
            {
                $lookup: {
                    from: 'messages',
                    localField: '_id',
                    foreignField: 'folder',
                    as: 'messages'
                }
            },
            {
                $unwind: {
                    path: '$messages',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $group: {
                    '_id': '$_id',
                    'name': { $first: '$name' },
                    'userName': { $first: '$userName' },
                    'user': { $first: '$user' },
                    'created': { $first: '$created' },
                    'protected': { $first: '$protected' },
                    'messages': { $push: '$messages' }
                }
            },
            {
                $project: {
                    '_id': 1,
                    'name': 1,
                    'userName': 1,
                    'user': 1,
                    'created': 1,
                    'protected': 1,
                    'messages': { $size: '$messages' }
                }
            }],
            { collation: settings.mongoDB.collation },
            (err, docs) => {
                db.close();
                if (!err) {
                    if (docs.length > 0)
                        res.json({ result: 'success', data: docs })
                    else if (req.params.id)
                        res.json({ result: 'error', message: 'This message folder doesn\'t exist.' })
                    else
                        res.json({ result: 'error', message: 'There aren\'t any message folders.' })
                } else {
                    res.json({ result: 'error', message: err.message });
                }
            });
    });
});

//  ------------------------[ ADD/MODIFY MESSAGE FOLDERS ] ------------------------

app.post('/messagefolders', (req, res) => {

    if (!general.checklogin(res, req)) return false;
    general.getpostdata(req, (postdata) => {

        var update = postdata._id != 0;

        finder = general.makeFinder(res, postdata._id, false);
        postdata.protected = postdata.prot;
        delete postdata._id;
        delete postdata.prot;

        if (postdata.name.length < 3) { res.json({ result: 'error', message: 'Folder name is too short.' }); return false; }
        if (postdata.protected != true) { postdata.protected = false; }

        general.MongoDB_connect(settings.mongoDB, db => {

            //  add new record

            var updateFolder = new Promise((resolve, reject) => {

                if (!update) {
                    db.collection('messageFolders').find({ name: 'postdata.name' }, (err, docs) => {
                        if (err)
                            reject('Unable to add new message folder: ' + postdata.name, req);
                        else if (docs.length > 0)
                            reject(`Message folder "${postdata.name}" already exists.`)
                        else
                            resolve(null);
                    });
                }

                //  modify existing record

                else {

                    db.collection('messageFolders').findOne(finder, (err, docs) => {
                        if (err)
                            reject('Error reading message folder.')
                        else if (!docs)
                            reject('This message folder doesn\'t exist.')
                        else
                            resolve(docs);
                    });
                }

            }).then((result) => {

                if (update)
                    postdata = { $set: postdata }
                else
                    postdata.created = new Date().getTime();

                db.collection('messageFolders').update(
                    { _id: finder },
                    postdata,
                    {
                        upsert: true,
                        collation: settings.mongoDB.collation
                    },
                    err => {
                        db.close();
                        if (!err) {
                            if (!update)
                                general.log('New message folder added: ' + postdata.name, req);
                            else
                                general.log('Message folder modified: ' + result.name, req);
                            res.json({ result: 'success' });
                        } else {
                            general.log('Unable to create/modify message folder: ' + postdata.name, req);
                            res.json({ result: 'error', message: err.message });
                        }
                    });

            }).catch((error) => {
                general.log('Unable to add/modify message folder: ' + postdata.name, req);
                res.json({ result: 'error', message: error });
            });

        });
    });
});

//  ------------------------[ DELETE MESSAGE FOLDER ] ------------------------

app.delete('/messagefolders/:id?', (req, res) => {

    if (!general.checklogin(res, req, 2)) return false;

    finder = general.makeFinder(res, req.params.id, true);
    if (!finder) return false;

    general.MongoDB_connect(settings.mongoDB, db => {

        //  check if folder exists & not protected

        let deleteFolders = new Promise((resolve, reject) => {

            db.collection('messageFolders').findOne(finder, (err, docs) => {
                if (err) reject('Message folder not found.')
                else if (docs.protected) reject('Protected folders can\'t be deleted.')
                else resolve(docs);
            });

        }).then((result) => {

            //  delete messages

            db.collection('messages').remove(
                { folder: finder },
                { collation: settings.mongoDB.collation },
                (err, docs) => {
                    db.close();
                });

            //  delete folder

            db.collection('messageFolders').findOneAndDelete(
                { _id: finder },
                { collation: settings.mongoDB.collation },
                (err, docs) => {
                    db.close();
                    if (!err) {
                        if (docs.value) {
                            general.log('Message folder deleted: ' + result.name, req)
                            res.json({ result: 'success' });
                        } else
                            res.json({ result: 'error', message: 'Message folder not found.' });
                    } else {
                        res.json({ result: 'error', message: err.message });
                    }
                });
        }).catch((error) => {
            general.log('Unable to delete message folder', req);
            res.json({ result: 'error', message: error });
        });
    });
});
