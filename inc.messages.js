//  ------------------------[ RECEIVE MESSAGE ] ------------------------

app.post('/message', (req, res) => {

    general.getpostdata(req, (postdata) => {

        if (postdata.sender_id != 0)
            postdata.sender_id = general.makeFinder(res, postdata.sender_id, false);

        //  =====================================================================================

        //  check reCaptcha

        new Promise((resolve, reject) => {

            if (settings.recaptcha.active) {

                recaptcha.checkrecaptcha(postdata.captcha, req)
                    .then((result) => {
                        resolve();
                    }).catch((error) => {
                        reject({ message: 'Invalid captcha: ' + error['error-codes'][0] });
                    });

            } else
                resolve();

        }).then(() => {

            //  ====================================================================================
            //  check input

            let check = ['name', 'email', 'phone_country', 'phone_district', 'phone_number', 'subject', 'body'];
            for (let t in check)
                if (postdata[check[t]] == 'undefined') { res.json({ result: 'error', message: 'Field ' + check[t] + ' is missing.' }); return false; }

            if (!postdata.name || postdata.name.length < 5 || postdata.name.length > 128) { res.json({ result: 'error', message: 'Invalid name.' }); }
            if (!postdata.email || !general.checkEmail(postdata.email)) { res.json({ result: 'error', message: 'Invalid e-mail address.' }); }
            if (postdata.phone_country.length <= 1 || postdata.phone_country.length > 4) { res.json({ result: 'error', message: 'Invalid phone number country code.' }); return false; }
            if (isNaN(postdata.phone_district) || postdata.phone_district.length > 4) { res.json({ result: 'error', message: 'Invalid phone number district code.' }); return false; }
            if (isNaN(postdata.phone_number) || postdata.phone_number.length < 6 || postdata.phone_number.length > 8) { res.json({ result: 'error', message: 'Invalid phone number.' }); return false; }

            if (postdata.order_id && postdata.order_id != '') {
                let rx = RegExp(/[a-z|A-Z]{4}-[0-9]{4}/ig);
                if (!rx.test(postdata.order_id)) { res.json({ result: 'error', message: 'Invalid order code.' }); return false; }
            }

            postdata._id = new ObjectId();
            delete postdata.captcha;
            postdata.date = general.getUTCDate();
            postdata.ip = general.getIP(req);
            postdata.replied = false;
            postdata.folder_id = null;

            general.MongoDB_connect(settings.mongoDB, db => {
                db.collection('messages').insert(
                    postdata,
                    {
                        upsert: true,
                        collation: settings.mongoDB.collation
                    },
                    err => {
                        db.close();
                        if (!err) {
                            general.log('Message from ' + postdata.name + ' (' + postdata.email + ')', res);
                            res.json({ result: 'success' });
                        } else {
                            general.log('Invalid message from ' + postdata.name + ' (' + postdata.email + ')', res);
                            res.json({ result: 'error', message: 'Unable to deliver message. Please try again later.' });
                        }
                    });
            });

        }).catch(error => {
            general.log('Message form: Captcha error!');
            res.json({ result: 'error', message: error.message });
            return false;
        });

    });
});

//  ------------------------[ GET MESSAGES ] ------------------------

app.get('/message/:id?', (req, res) => {

    if (!general.checklogin(res, req)) return false;

    let finder = { $and: [] }

    if (req.query.s && req.query.s.length < 3) {
        res.json({ result: 'error', message: 'Search string must be at least 3 characters long.' });
        return false;
    }

    if (req.query.sf && (isNaN(req.query.sf) || Number(req.query.sf < 0) || Number(req.query.sf > 6))) {
        res.json({ result: 'error', message: 'Invalid search field.' });
        return false;
    }

    if (req.params.id)
        finder.$and.push({ '_id': general.makeFinder(res, req.params.id, true) })
    else {

        // filter by folder -------------------------------------------------------
        if (req.query.f)
            finder.$and.push({ 'folder_id': general.makeFinder(res, req.query.f, true) });

        // filter by date -------------------------------------------------------
        if (req.query.d) {

            startDate = general.checkDateParam(req.query.d);
            if (!startDate) { res.json({ result: 'error', message: 'Invalid start date: ' + req.query.sd }); return false; }

            finder.$and.push({
                date: {
                    $gte: general.getUTCDate(startDate, true, false),
                    $lte: general.getUTCDate(startDate, false, true)
                }
            });
        }

        // filter by search --------------------------------------------------------
        if (req.query.s) {

            switch (req.query.sm) {
                //  like%
                case '1': var value = { $regex: new RegExp('^' + req.query.s, 'gi'), }; break;
                //  like
                case '2': var value = req.query.s; break;
                //  %like%
                default: var value = { $regex: new RegExp(req.query.s, 'gi') }; break;
            }
            if (!req.query.sf || req.query.sf == '*' || req.query.sf == '0') {
                finder.$and.push({
                    $or: [
                        { 'name': value },
                        { 'email': value },
                        { 'phone': value },
                        { 'ip': value },
                        { 'order_id': value },
                        { 'subject': value },
                        { 'body': { $regex: general.getHTMLSearchRegExp(req.query.s) } }
                    ]
                });
            } else if (req.query.sf != '2') {
                let sf = '';
                switch (req.query.sf) {
                    case '1': sf = 'subject'; break;
                    case '3': sf = 'name'; break;
                    case '4': sf = 'order_id'; break;
                    case '5': sf = 'email'; break;
                    case '6': sf = 'ip'; break;
                }
                let temp = {};
                temp[sf] = value;
                finder.$and.push(temp);
            } else
                finder.$and.push({ 'body': { $regex: general.getHTMLSearchRegExp(req.query.s) } });
        }
    }

    //  if search parameters are inadequate ---------------------------------------------------------
    if (finder['$and'].length == 0)
        res.json({ result: 'error', message: 'No filter conditions were specified.' })

    //  do search & filter

    general.MongoDB_connect(settings.mongoDB, db => {

        db.collection('messages').aggregate([
            { $match: finder },
            { $sort: { date: 1 } }
        ],
            { collation: settings.mongoDB.collation },
            (err, docs) => {
                db.close();
                if (!err) {
                    if (docs.length > 0)
                        res.json({ result: 'success', data: docs })
                    else
                        res.json({ result: 'error', message: 'No messages found.' })
                } else {
                    general.log('Message retrieval error: ' + err.message, res);
                    res.json({ result: 'error', message: err.message });
                }
            });
    });
});

//  ------------------------[ GET MESSAGE FOLDERS ] ------------------------

app.get('/messagefolders/:id?', (req, res) => {

    if (!general.checklogin(res, req)) return false;

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

    if (!general.checklogin(res, req, 2)) return false;
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

//  ------------------------[ GET AUTOREPLIES ] ------------------------

app.get('/autoreplies/:id?', (req, res) => {

    if (!general.checklogin(res, req)) return false;

    if (req.params.id) {
        finder = general.makeFinder(res, req.params.id, true);
        if (!finder) return false;
        finder = { _id: finder };
    } else
        finder = {};

    general.MongoDB_connect(settings.mongoDB, db => {

        db.collection('autoreplies').aggregate([
            { $match: finder },
            { $sort: { priority: 1 } }
        ],
            { collation: settings.mongoDB.collation },
            (err, docs) => {
                db.close();
                if (!err) {
                    if (req.params.id && docs.length == 0)
                        res.json({ result: 'error', message: 'This message doesn\'t exist.' })
                    else
                        res.json({ result: 'success', data: docs })
                } else {
                    res.json({ result: 'error', message: err.message });
                }
            });
    });
});

//  ------------------------[ DELETE AUTOREPLY ] ------------------------

app.delete('/autoreplies/:id?', (req, res) => {

    if (!general.checklogin(res, req, 2)) return false;

    finder = general.makeFinder(res, req.params.id, true);
    if (!finder) return false;

    general.MongoDB_connect(settings.mongoDB, db => {

        db.collection('autoreplies').findOneAndDelete(
            { _id: finder },
            { collation: settings.mongoDB.collation },
            (err, docs) => {
                db.close();
                if (!err) {
                    if (docs.value) {
                        general.log('Autoreply deleted: ' + docs.value.token, req)
                        res.json({ result: 'success' });
                    } else
                        res.json({ result: 'error', message: 'Autoreply not found.' });
                } else
                    res.json({ result: 'error', message: err.message });
            });
    });
});
