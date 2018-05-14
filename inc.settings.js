//  ------------------------[ GET SETTINGS ] ------------------------

app.get('/settings/:id?', (req, res) => {

    if (!general.checklogin(res, req, 2)) return false;

    if (req.params.id) {
        finder = general.makeFinder(res, req.params.id, false);
        if (!finder)
            finder = { token: req.params.id }
        else
            finder = { _id: finder }

        //  if id is specified, get that one setting

        general.MongoDB_connect(settings.mongoDB, db => {

            db.collection('settings').aggregate([
                { $match: finder }
            ],
                { collation: settings.mongoDB.collation },
                (err, docs) => {
                    db.close();
                    if (!err) {
                        if (docs.length > 0)
                            res.json({ result: 'success', data: docs })
                        else
                            res.json({ result: 'error', message: 'This setting doesn\'t exist.' });
                    } else {
                        res.json({ result: 'error', message: err.message });
                    }
                });
        });

        //  if id is not specified, get all settings by group

    } else

        general.MongoDB_connect(settings.mongoDB, db => {

            db.collection('settingGroups').aggregate([
                {
                    $lookup: {
                        from: 'settings',
                        localField: '_id',
                        foreignField: 'group',
                        as: 'settings'
                    }
                },
                { $match: { 'settings': { $ne: [] } } },
                { $sort: { priority: -1, 'settings.token': 1 } },
                {
                    $project: {
                        'settings._id': 1,
                        'settings.token': 1,
                        'settings.value': 1,
                        'settings.description': 1,
                        'settings.level': 1,
                        'name': 1,
                        'priority': 1
                    }
                }
            ],
                { collation: settings.mongoDB.collation },
                (err, docs) => {
                    db.close();
                    if (!err) {
                        res.json({ result: 'success', data: docs });
                    } else {
                        res.json({ result: 'error', message: err.message });
                    }
                });
        });
});

//  ------------------------[ ADD/MODIFY SETTINGS ] ------------------------

app.post('/settings', (req, res) => {

    if (!general.checklogin(res, req, 2)) return false;
    general.getpostdata(req, (postdata) => {

        finder = general.makeFinder(res, postdata._id, false);
        postdata.group = general.makeFinder(res, postdata.group, true);
        if (!postdata.group) return false;
        delete postdata._id;

        general.MongoDB_connect(settings.mongoDB, db => {

            db.collection('settings').update(
                { _id: finder },
                postdata,
                {
                    upsert: true,
                    collation: settings.mongoDB.collation
                },
                err => {
                    db.close();
                    if (!err) {
                        if (postdata.id == 0)
                            general.log('New setting added: ' + postdata.token, req)
                        else
                            general.log('Setting added modified: ' + postdata.token, req)
                        res.json({ result: 'success' });
                    } else {
                        res.json({ result: 'error', message: err.message });
                    }
                });
        });
    });
});

//  ------------------------[ DELETE SETTINGS ] ------------------------

app.delete('/settings/:id?', (req, res) => {

    if (!general.checklogin(res, req)) return false;
    finder = general.makeFinder(res, req.params.id, true);
    if (!finder) return false;

    general.MongoDB_connect(settings.mongoDB, db => {

        //  check if group is empty

        db.collection('settings').findOne({ _id: finder },
            (err, docs) => {
                if (docs == null) {
                    db.close();
                    res.json({ result: 'error', message: 'Invalid setting.' })
                } else
                    doDelete(docs);
            });

        let doDelete = (docs) => {
            db.collection('settings').deleteOne(
                { _id: finder },
                { collation: settings.mongoDB.collation },
                err => {
                    db.close();
                    if (!err) {
                        general.log('Setting ' + docs.token + ' deleted.', req);
                        res.json({ result: 'success', data: docs });
                    } else {
                        res.json({ result: 'error', message: err.message });
                    }
                });
        }
    });
});

//  ------------------------[ GET SETTING GROUP ] ------------------------

app.get('/settinggroups/:id?', (req, res) => {

    if (!general.checklogin(res, req)) return false;

    if (req.params.id) {
        finder = general.makeFinder(res, req.params.id, true);
        if (!finder) return false;
        finder = { _id: finder };
    } else
        finder = {};

    general.MongoDB_connect(settings.mongoDB, db => {

        db.collection('settingGroups').aggregate([
            { $match: finder },
            { $sort: { priority: 1 } }
        ],
            { collation: settings.mongoDB.collation },
            (err, docs) => {
                db.close();
                if (!err) {
                    if (docs.length > 0)
                        res.json({ result: 'success', data: docs })
                    else if (req.params.id)
                        res.json({ result: 'error', message: 'This setting group doesn\'t exist.' })
                    else
                        res.json({ result: 'error', message: 'There aren\'t any setting groups.' })
                } else {
                    res.json({ result: 'error', message: err.message });
                }
            });
    });
});

//  ------------------------[ ADD/MODIFY SETTING GROUPS ] ------------------------

app.post('/settinggroups', (req, res) => {

    if (!general.checklogin(res, req, 2)) return false;
    general.getpostdata(req, (postdata) => {

        finder = general.makeFinder(res, postdata._id, false);
        delete postdata._id;

        general.MongoDB_connect(settings.mongoDB, db => {

            db.collection('settingGroups').update(
                { _id: finder },
                postdata,
                {
                    upsert: true,
                    collation: settings.mongoDB.collation
                },
                err => {
                    db.close();
                    if (!err) {
                        if (postdata._id == 0)
                            general.log('New setting group added: ' + postdata.name, req)
                        else
                            general.log('Setting group modified: ' + postdata.name, req)
                        res.json({ result: 'success' });
                    } else {
                        res.json({ result: 'error', message: err.message });
                    }
                });
        });
    });
});

//  ------------------------[ DELETE SETTING GROUPS ] ------------------------

app.delete('/settinggroups/:id?', (req, res) => {

    if (!general.checklogin(res, req, 2)) return false;
    finder = general.makeFinder(res, req.params.id, true);
    if (!finder) return false;

    general.MongoDB_connect(settings.mongoDB, db => {

        //  check if group is empty

        db.collection('settings').find({ group: finder },
            (err, docs) => {
                if (docs.length > 0) {
                    db.close();
                    res.json({ result: 'error', message: 'This group has ' + docs.length + ' settings. Delete all settings before removing it.', data: docs })
                } else {

                    db.collection('settingGroups').deleteOne(
                        { _id: finder },
                        { collation: settings.mongoDB.collation },
                        err => {
                            db.close();
                            if (!err) {
                                general.log('Setting group deleted: ' + docs.name, req);
                                res.json({ result: 'success' });
                            } else {
                                res.json({ result: 'error', message: err.message });
                            }
                        });
                }

            });
    });
});

//  ------------------------[ GET RECAPTCHA SETTINGS ] ------------------------

app.get('/recaptcha', (req, res) => {

    data = {
        "active": settings.recaptcha.active,
        "site_key": settings.recaptcha.site_key,
        "language": settings.recaptcha.language,
        "type": settings.recaptcha.type,
        "theme": settings.recaptcha.theme,
        "size": settings.recaptcha.size,
        "tabindex": settings.recaptcha.tabindex
    }

    res.json({ result: 'success', data: data });
});
