//  ------------------------[ RECEIVE MESSAGE ] ------------------------

app.post('/message', (req, res) => {

    general.getpostdata(req, (postdata) => {

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
            if (isNaN(postdata.phone_country) || postdata.phone_country < 1 || postdata.phone_country.length > 4) { res.json({ result: 'error', message: 'Invalid phone number country code.' }); return false; }
            if (isNaN(postdata.phone_district) || postdata.phone_district < 1 || postdata.phone_district.length > 4) { res.json({ result: 'error', message: 'Invalid phone number district code.' }); return false; }
            if (isNaN(postdata.phone_number) || postdata.phone_number < 1 || postdata.phone_number.length < 6 || postdata.phone_number.length > 8) { res.json({ result: 'error', message: 'Invalid phone number.' }); return false; }

            if (postdata.order_id && postdata.order_id != '') {
                let rx = RegExp(/[a-z|A-Z]{4}-[0-9]{4}/ig);
                if (!rx.test(postdata.order_id)) { res.json({ result: 'error', message: 'Invalid order code.' }); return false; }
            }

            postdata._id = new ObjectId();
            delete postdata.captcha;

            postdata.date = general.getUTCDate();
            postdata.replied = false;
            postdata.folder_id = null;

            if (typeof req.session.user != 'undefined')
                postdata.user_id = new ObjectId(req.session.user)
            else
                postdata.user_id = null;

            iplocation.locate(general.getIP(req))
                .then(res => {
                    if (res)
                        postdata.ip = res
                    else
                        postdata.ip = {};
                })
                .catch(err => {
                    general.log('Unable to locate IP address ' + general.getIP(req) + ': ' + err);
                    postdata.ip = {};
                })
                .finally(() => {
                    postdata.ip.ip = general.getIP(req);
                    postdata.ip.useragent = req.headers['user-agent'];

                    dbClient.db(settings.mongoDB.db).collection('messages').insert(
                        postdata,
                        {
                            upsert: true,
                            collation: settings.mongoDB.collation
                        },
                        err => {
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
        finder.$and.push({ '_id': general.makeObjectId(res, req.params.id, true) })
    else {

        // filter by folder -------------------------------------------------------
        if (req.query.f)
            finder.$and.push({ 'folder_id': general.makeObjectId(res, req.query.f, true) });

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
    if (finder['$and'].length == 0) {
        res.json({ result: 'error', message: 'No filter conditions were specified.' });
        return false;
    }

    //  do search & filter

    dbClient.db(settings.mongoDB.db).collection('messages').aggregate([
        { $match: finder },
        {
            $lookup: {
                from: 'users',
                localField: 'user_id',
                foreignField: '_id',
                as: 'user'
            }
        },
        { $unwind: '$user' },

        {
            $lookup: {
                from: 'values',
                localField: 'user_id',
                foreignField: '_id',
                as: 'user'
            }
        },
        { $unwind: '$user' },
        {

            $project: {
                'user._id': 1,

                'user.fullname': {
                    $cond: {
                        if: { $eq: ['$user.middlename', ''] },
                        then: { $concat: ['$user.lastname', ', ', '$user.firstname', ', ', '$user.title'] },
                        else: { $concat: ['$user.lastname', ', ', '$user.middlename', ' ', '$user.firstname', ', ', '$user.title'] }
                    }
                },

                'user.address_state': 1,

                'user.address': {
                    $cond: {
                        if: { $eq: ['$user.address_state', ''] },
                        then: {
                            $cond: {
                                if: { eq: ['user.address_2', ''] },
                                then: { $concat: ['$user.address_1', os.EOL, '$user.address_zip', ' ', '$user.address_city', os.EOL, '$user.address_country'] },
                                else: { $concat: ['$user.address_1', os.EOL, '$user.address_2', os.EOL, '$user.address_zip', ' ', '$user.address_city', os.EOL, '$user.address_country'] },
                            }
                        },
                        else: {
                            $cond: {
                                if: { eq: ['user.address_2', ''] },
                                then: { $concat: ['$user.address_1', os.EOL, '$user.address_city', ', ', '$user.address_state', ' ', '$user.address_zip', os.EOL, '$user.address_country'] },
                                else: { $concat: ['$user.address_1', os.EOL, '$user.address_2', os.EOL, '$user.address_city', ', ', '$user.address_zip', ' ', '$user.address_state', os.EOL, '$user.address_country'] },
                            }
                        }
                    }
                },

                'user.phone': { $concat: ['+', '$user.phone_country', ' (', '$user.phone_district', ') ', '$user.phone_number'] },

                'user.email': 1,
                'user.registered': 1,
                'date': 1,
                'order_id': 1,
                'folder_id': 1,
                'user_id': 1,
                'name': 1,
                'email': 1,
                'iplocation': 1,
                'ip': 1,
                'subject': 1,
                'body': 1
            }
        },
        { $sort: { date: -1 } }
    ],
        { collation: settings.mongoDB.collation },
        { cursor: { batchSize: 1 } })
        .toArray((err, docs) => {
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

//  ------------------------[ GET MESSAGE FOLDERS ] ------------------------

app.get('/messagefolders/:id?', (req, res) => {

    if (!general.checklogin(res, req)) return false;

    if (req.params.id) {
        finder = general.makeObjectId(res, req.params.id, true);
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

    dbClient.db(settings.mongoDB.db).collection('messageFolders').aggregate([
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
        { cursor: { batchSize: 1 } }).toArray(
            (err, docs) => {
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

//  ------------------------[ ADD/MODIFY MESSAGE FOLDERS ] ------------------------

app.post('/messagefolders', (req, res) => {

    if (!general.checklogin(res, req, 2)) return false;
    general.getpostdata(req, (postdata) => {

        var update = postdata._id != 0;

        finder = general.makeObjectId(res, postdata._id, false);
        postdata.protected = postdata.prot;
        delete postdata._id;
        delete postdata.prot;

        if (postdata.name.length < 3) { res.json({ result: 'error', message: 'Folder name is too short.' }); return false; }
        if (postdata.protected != true) { postdata.protected = false; }

        //  add new record

        var updateFolder = new Promise((resolve, reject) => {

            if (!update) {
                dbClient.db(settings.mongoDB.db).collection('messageFolders').find({ name: 'postdata.name' }, (err, docs) => {
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

                dbClient.db(settings.mongoDB.db).collection('messageFolders').findOne(finder, (err, docs) => {
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

            dbClient.db(settings.mongoDB.db).collection('messageFolders').update(
                { _id: finder },
                postdata,
                {
                    upsert: true,
                    collation: settings.mongoDB.collation
                },
                err => {
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

//  ------------------------[ DELETE MESSAGE FOLDER ] ------------------------

app.delete('/messagefolders/:id?', (req, res) => {

    if (!general.checklogin(res, req, 2)) return false;

    finder = general.makeObjectId(res, req.params.id, true);
    if (!finder) return false;

    //  check if folder exists & not protected

    let deleteFolders = new Promise((resolve, reject) => {

        dbClient.db(settings.mongoDB.db).collection('messageFolders').findOne(finder, (err, docs) => {
            if (err) reject('Message folder not found.')
            else if (docs.protected) reject('Protected folders can\'t be deleted.')
            else resolve(docs);
        });

    }).then((result) => {

        //  delete messages

        dbClient.db(settings.mongoDB.db).collection('messages').remove(
            { folder: finder },
            { collation: settings.mongoDB.collation },
            (err, docs) => {
                //  to be implemented!
            });

        //  delete folder

        dbClient.db(settings.mongoDB.db).collection('messageFolders').findOneAndDelete(
            { _id: finder },
            { collation: settings.mongoDB.collation },
            (err, docs) => {
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

//  ------------------------[ GET AUTOREPLIES ] ------------------------

app.get('/autoreplies/:id?', (req, res) => {

    if (!general.checklogin(res, req)) return false;

    if (req.params.id) {
        finder = general.makeObjectId(res, req.params.id, true);
        if (!finder) return false;
        finder = { _id: finder };
    } else
        finder = {};

    dbClient.db(settings.mongoDB.db).collection('autoreplies').aggregate([
        { $match: finder },
        { $sort: { priority: 1 } }
    ],
        { collation: settings.mongoDB.collation },
        { cursor: { batchSize: 1 } }).toArray(
            (err, docs) => {
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

//  ------------------------[ DELETE AUTOREPLY ] ------------------------

app.delete('/autoreplies/:id?', (req, res) => {

    if (!general.checklogin(res, req, 2)) return false;

    finder = general.makeObjectId(res, req.params.id, true);
    if (!finder) return false;

    dbClient.db(settings.mongoDB.db).collection('autoreplies').findOneAndDelete(
        { _id: finder },
        { collation: settings.mongoDB.collation },
        (err, docs) => {
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

//  ------------------------[ ADD AUTOREPLY ] ------------------------

app.post('/autoreplies', (req, res) => {

    if (!general.checklogin(res, req, 2)) return false;
    general.getpostdata(req, (postdata) => {

        var update = postdata._id != 0;

        finder = general.makeObjectId(res, postdata._id, false);
        delete postdata._id;

        if (!postdata.content || postdata.content.length < 5) { res.json({ result: 'error', message: 'Contents are not specified or too short.' }); return false; }
        if (!postdata.token || postdata.token.length < 3 || !(new RegExp(/^[a-zA-Z0-9_-]+$/i)).test(postdata.token)) { res.json({ result: 'error', message: 'Invalid token.' }); return false; }
        if (!postdata.subject || postdata.subject.length < 5) { res.json({ result: 'error', message: 'Subject line is too short.' }); return false; }
        if (!postdata.body || postdata.body.length < 15) { res.json({ result: 'error', message: 'Message body is too short.' }); return false; }
        if (!postdata.priority || isNaN(postdata.priority) || Number(postdata.priority) < 0) { res.json({ result: 'error', message: 'Invalid priority value.' }); return false; }

        //  add new record

        new Promise((resolve, reject) => {

            if (!update) {
                dbClient.db(settings.mongoDB.db).collection('autoreplies').find({ token: 'postdata.token' }, (err, docs) => {
                    if (err)
                        reject('Unable to add new autoreply.', req);
                    else if (docs.length > 0)
                        reject(`Token "${postdata.token}" already exists.`)
                    else
                        resolve(null);
                });
            }

            //  modify existing record

            else {

                dbClient.db(settings.mongoDB.db).collection('autoreplies').findOne(finder, (err, docs) => {
                    if (err)
                        reject('Error modifying autoreply.')
                    else if (!docs)
                        reject('This autoreply doesn\'t exist.')
                    else
                        resolve(docs);
                });
            }

        }).then((result) => {

            if (update)
                postdata = { $set: postdata }

            dbClient.db(settings.mongoDB.db).collection('autoreplies').update(
                { _id: finder },
                postdata,
                {
                    upsert: true,
                    collation: settings.mongoDB.collation
                },
                err => {
                    if (!err) {
                        if (!update)
                            general.log('New autoreply added. Token: ' + postdata.token, req);
                        else
                            general.log('Autoreply modified: ' + result.token, req);
                        res.json({ result: 'success' });
                    } else {
                        general.log('Unable to create/modify token: ' + postdata.token, req);
                        res.json({ result: 'error', message: err.message });
                    }
                });

        }).catch((error) => {
            general.log('Unable to add/modify autoreply: ' + postdata.token, req);
            res.json({ result: 'error', message: error });
        });

    });

});