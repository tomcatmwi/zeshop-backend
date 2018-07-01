//  ------------------------[ INITIALIZE DATABASE ] ------------------------

app.get("/initialize", (req, res) => {

    if (!global.settings.general.developer_mode) {
        general.log('Attempted to invoke developer command: /initialize', req);
        res.json({ result: "error", message: 'Developer commands are not enabled.' });
        return false;
    }

    general.log('Initializing database', req);
    if (req.query.wipe)
        general.log('Full database wipe requested. Hope you know what you\'re doing...', req);

    //  list of collections

    let collections = [
        'autoreplies',
        'messageFolders',
        'messages',
        'settingGroups',
        'settings',
        'users'
    ];

    let options = settings.mongoDB.collectionOptions;

    if (!options.collation)
        options.collation = settings.mongoDB.collation;

    //  check if collections exist, create which doesn't
    //  delete and force creation if wipe was requested

    const createCollection = (count) => {
        general.log('Creating collection: ' + collections[count]);

        dbClient.db(settings.mongoDB.db).createCollection(collections[count], options, (err) => {
            if (err) {
                general.log('Error creating collection "' + collections[count] + '": ' + err.message, res);
                res.json({ result: 'error', data: { collection: collections[count], message: err.message } });
                count = collections.length;
                return false;
            } else

                new Promise((resolve, reject) => {

                    if (req.query.wipe) {
                        dbClient.db(settings.mongoDB.db).collection(collections[count]).remove({}, {}, err => {
                            if (err)
                                reject(err)
                            else
                                resolve(true);
                        });
                    } else resolve(false);

                }).then((wipe) => {
                    if (wipe)
                        general.log('Collection "' + collections[count] + '" successfully wiped.');
                    
                    if (count < collections.length - 1)
                        createCollection(count + 1)
                    else if (count == collections.length - 1) {
                        general.log('Initialization completed.', res);
                        res.json({ result: 'success' });
                        return false;
                    }

                }).catch(err => {
                    general.log('Error wiping collection "' + collections[count] + '": ' + err.message, res);
                    res.json({ result: 'error', data: { collection: collections[count], message: err.message } });
                    count = collections.length;
                    return false;
                });
        });
    }

    createCollection(0);

});

//  ------------------------[ ADD DEFAULT ADMIN ] ------------------------

app.get("/defaultadmin", (req, res) => {

    if (!global.settings.general.developer_mode) {
        general.log('Attempted to invoke developer command: /defaultadmin', req);
        res.json({ result: "error", message: 'Developer commands are not enabled.' });
        return false;
    }

    var password = general.randomString(12, false, false).toLowerCase();
    if (req.query.password && _.trim(req.query.password.length) >= 5) password = _.trim(req.query.password);

    var user = Object.assign(templates.user);

    user._id = new ObjectId();
    user.lastname = "Administrator";
    user.username = "admin";
    user.level = 2;
    user.password = md5(password);
    user.registered = general.getUTCDate(new Date());

    //  add admin to user db

    dbClient.db(settings.mongoDB.db).collection('users').deleteMany(
        { level: 2 },
        { collation: settings.mongoDB.collation },
        err => {
            if (!err)
                general.log('All administrators deleted.', req)
            else
                general.log('No administrators found.', req);

            dbClient.db(settings.mongoDB.db).collection('users').insert(
                user,
                { upsert: true },
                err => {
                    if (!err) {
                        general.log('Default administrator added. Username: "admin". Password: "' + password + '"', req);
                        res.json({ result: "success" });

                    } else {
                        general.log("Failed to add default administrator to database.", req);
                        res.json({ result: "error", message: err.message });
                    }
                });
        }
    );

});

//  ------------------------[ ADD SYSTEM VALUES FROM VALUES.JSON ] ------------------------
//  Resets all system settings, constants, values etc.
//  Call only when deploying backend!

app.get('/resetvalues', (req, res) => {

    if (!global.settings.general.developer_mode) {
        general.log('Attempted to invoke developer command: /resetvalues', req);
        res.json({ result: "error", message: 'Developer commands are not enabled.' });
        return false;
    }

    general.log('System value reset called.', req)
    var values = {};
    try {
        values = JSON.parse(fs.readFileSync('./assets/json/values.json', 'utf8'));
    } catch (err) {
        res.json({ result: 'error', message: 'Can\'t load values.json.' });
        general.log('Can\'t load values.json.', req);
        return false;
    }


    var collections = [];
    _.each(values, (value, key) => { collections.push(key); });

    const doStuff = (x) => {

        dbClient.db(settings.mongoDB.db).collection('values_' + collections[x]).drop(err => {

            if (err && err.code != 26) {
                general.log('Can\'t drop \'values_' + collections[x] + '\' collection: ', err.message, req);
                if (x < collections.length - 1) doStuff(x + 1)
                else {
                    general.log('Value reset completed.', req);
                    return false;
                }
            } else {

                general.log('Inserting default values into \'values_' + collections[x] + '\'...', req);

                dbClient.db(settings.mongoDB.db).collection.collection('values_' + collections[x]).insertMany(
                    values[collections[x]],
                    {
                        upsert: true,
                        collation: settings.mongoDB.collation
                    },
                    err => {
                        if (!err)
                            general.log('\'values_' + collections[x] + '\' updated.', req)
                        else
                            general.log('Unable to update \'values_' + collections[x] + '\'.', req);
                        if (x < collections.length - 1) doStuff(x + 1)
                        else {
                            general.log('Value reset completed.', req);
                            return false;
                        }
                    });
            }
        });

    }

    doStuff(0);

    res.json({ result: 'success', message: 'Value reset completed, see log for details.' })

});

//  ------------------------[ EXPORT VALUES TO VALUES.JSON ] ------------------------

app.get('/exportvalues', (req, res) => {

    if (!global.settings.general.developer_mode) {
        general.log('Attempted to invoke developer command: /exportvalues', req);
        res.json({ result: "error", message: 'Developer commands are not enabled.' });
        return false;
    }

    var collections = [];
    var values = {};

    const getStuff = (x) => {

        dbClient.db(settings.mongoDB.db).collection(collections[x]).aggregate(
            [],
            { cursor: {} },
            { collation: settings.mongoDB.collation },
            (err, docs) => {
                let temp = {};
                temp[collections[x]] = docs;
                if (!err) Object.assign(values, temp);
                if (x < collections.length - 1) getStuff(x + 1)
                else {

                    // remove "values_" prefixes
                    _.forEach(values, (value, key) => {
                        if (key.substr(0, 7) == 'values_') {
                            values[key.substr(7, key.length)] = value;
                            delete values[key];
                        }
                    });

                    if (req.query.file) {

                        //  set filename
                        let file = req.query.file;
                        if (file == '.') file = './values.exported.json';

                        if (req.query.minimize) values = JSON.stringify(values)
                        else values = JSON.stringify(values, null, 3);

                        fs.writeFile(file, values, err => {
                            if (err) {
                                general.log('Values export failed File ' + file + ' can\'t be written: ' + err.message, req);
                                res.json({ result: 'error', message: 'Unable to write file: ' + err.message });
                            } else {
                                general.log('Values exported from db to ' + file, req);
                                res.json({ result: 'success' });
                            }
                        });

                    } else {
                        general.log('Values exported from db', req);
                        res.json({ result: 'success', data: values });
                    }
                }
            });

    }

    dbClient.db(settings.mongoDB.db).listCollections().toArray((err, colls) => {
        if (!err) {
            colls.forEach(collection => {
                if (collection.name.substr(0, 7) === 'values_')
                    collections.push(collection.name);
            });
        }
        else {
            general.log('Unable to return system values!', req);
            res.json({ result: 'error', message: 'Unable to return system values!' });
        }
        if (collections.length == 0) {
            general.log('Unable to return system values!', req);
            res.json({ result: 'error', message: 'Unable to return system values!' });
        } else
            getStuff(0);
    });

});
