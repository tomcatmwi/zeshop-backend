//  ------------------------[ LOGIN ] ------------------------

app.post('/login', (req, res) => {

    general.getpostdata(req, (postdata) => {
        general.log('Login attempt. Username: ' + postdata.username, req);

        let login = new Promise((resolve, reject) => {

            //  verify captcha
            if (settings.recaptcha.active) {
                recaptcha.checkrecaptcha(postdata.captcha, req)
                    .then((result) => {
                        resolve();
                    }).catch((error) => {
                        reject('Invalid captcha: ' + error['error-codes'][0]);
                    });
            } else resolve();

        }).then(result => {

            general.MongoDB_connect(settings.mongoDB, db => {

                if (postdata.nomd5)
                    postdata.password = md5.md5(postdata.password);

                //  verify the login

                db.collection('users').aggregate([
                    {
                        $match:
                            {
                                $and: [
                                    { username: postdata.username },
                                    { password: postdata.password },
                                    { level: { $gte: 1 } }
                                ]
                            }
                    },

                    {
                        $project: {
                            '_id': 1,
                            'email': 1,
                            'level': 1,
                            'registered': 1,
                            'name': {
                                $cond: {
                                    if: { $eq: ['$middlename', ''] },
                                    then: { $concat: ['$title', ' ', '$firstname', ' ', '$lastname'] },
                                    else: { $concat: ['$title', ' ', '$firstname', ' ', '$middlename', ' ', '$lastname'] }
                                }
                            }
                        },
                    }

                ],

                    { collation: settings.mongoDB.collation },
                    (err, docs) => {
                        db.close();

                        if (!err && docs.length > 0) {

                            //  if user is unconfirmed, no login
                            if (docs[0].level == 0) {
                                general.log('Unconfirmed user attempted to log in: ' + docs[0].name, req);
                                res.json({ result: 'error', message: 'Your registration has not been confirmed yet. Please click the confirmation link in the e-mail we sent.' });
                                return false;
                            }

                            //  save user to session
                            req.session.user = docs[0]._id;
                            req.session.name = docs[0].name;
                            req.session.email = docs[0].email;
                            req.session.level = docs[0].level;

                            general.log('Successful login: ' + docs[0].name, req);
                            res.json({ result: 'success', message: 'Login successful.', data: docs[0] });
                        } else {
                            general.log('Unsuccessful login: ' + postdata.username, req);
                            res.json({ result: 'error', message: 'Invalid credentials.' });
                        }

                    });
            });

        }).catch(error => {
            general.log('Invalid login: Captcha error!');
            res.json({ result: 'error', message: error });
        });

    });
});

//  ------------------------[ LOGOUT ] ------------------------

app.get('/logout', (req, res) => {
    general.log('User ' + req.session.name + ' logged out.');
    req.session.destroy();
    res.json({ result: 'success', message: 'Logout successful.', login: false });
});

//  ------------------------[ GET USERS ] ------------------------

app.get('/users/:id?', (req, res) => {

    if (!general.checklogin(res, req)) return false;

    if (typeof req.query.sortMode == 'undefined') req.query.sortMode = '1';
    if (typeof req.query.sortField == 'undefined') req.query.sortField = '1';
    if (typeof req.query.searchField == 'undefined') req.query.searchField = '1';
    if (typeof req.query.searchMode == 'undefined') req.query.searchMode = '1';
    if (typeof req.query.searchText == 'undefined') req.query.searchText = '';

    //  if a single id is specified...

    if (req.params.id) {
        finder = general.makeFinder(res, req.params.id, true);
        if (!finder) return false;
        finder = { _id: finder };

        //  reject request if user is not >lvl1 or id = current user
        if (req.params.id != req.session.user && req.session.level <= 1) {
            res.json({ result: 'error', message: 'You don\'t have the necessary privileges to access this user record.' });
            return false;
        }

    } else {

        //  reject request if user is not >lvl1
        if (req.session.level <= 1) {
            res.json({ result: 'error', message: 'You don\'t have the necessary privileges to access user records.' });
            return false;
        }

        //  search & filter

        if (req.session && req.session.level && req.session.level > 1)
            finder = {}
        else
            finder = { 'id': new ObjectId(req.session.level) }

        if (req.query.searchText.length > 3) {

            //  configure search string regex

            searchValue = '';
            switch (req.query.searchMode) {
                //  %like%
                case '1': searchValue = { $regex: new RegExp(req.query.searchText, 'gi') }; break;
                //  like%
                case '2': searchValue = { $regex: new RegExp('^' + req.query.searchText, 'gi'), }; break;
                //  like
                case '3': searchValue = req.query.searchText; break;
            }

            //  set search field
            switch (req.query.searchField) {
                case '0': finder = { '_id': searchValue }; break;
                case '1': finder = { $or: [{ propername: searchValue }, { email: searchValue }, { address_1: searchValue }, { address_2: searchValue }, { address_instructions: searchValue }, { username: searchValue }] }; break;
                case '2': finder = { $or: [{ propername: searchValue }, { name: searchValue }] }; break;
                case '3': finder = { 'address_city': searchValue }; break;
                case '4': finder = { $or: [{ address_1: searchValue, address_2: searchValue }] }; break;
                case '5': finder = { 'email': searchValue }; break;
                case '6': finder = { 'username': searchValue }; break;
            }
        }
    }

    //  sorting

    var sorter = {};
    switch (req.query.sortField) {
        case '1': sorter = { lastname: Number(req.query.sortMode), firstname: Number(req.query.sortMode) }; break;
        case '2': sorter = { registered: Number(req.query.sortMode) }; break;
        case '3': sorter = { address_city: Number(req.query.sortMode) }; break;
        case '4': sorter = { level: Number(req.query.sortMode) }; break;
    }

    //  projection

    general.MongoDB_connect(settings.mongoDB, db => {

        db.collection('users').aggregate([
            {
                $project: {
                    '_id': 1,
                    'title': 1,
                    'firstname': 1,
                    'middlename': 1,
                    'lastname': 1,
                    'email': 1,
                    'phone_country': 1,
                    'phone_district': 1,
                    'phone_number': 1,
                    'address_country': 1,
                    'address_state': 1,
                    'address_city': 1,
                    'address_zip': 1,
                    'address_1': 1,
                    'address_2': 1,
                    'address_apt': 1,
                    'address_instructions': 1,
                    'promotions': 1,
                    'level': 1,
                    'username': 1,
                    'password': 1,
                    'registered': 1,

                    'levelName': {
                        $switch: {
                            branches: [
                                { case: { "$eq": ["$level", -1] }, then: 'Banned' },
                                { case: { "$eq": ["$level", 0] }, then: 'Pending' },
                                { case: { "$eq": ["$level", 1] }, then: 'Regular' },
                                { case: { "$eq": ["$level", 2] }, then: 'Administrator' },
                                { case: { "$eq": ["$level", 3] }, then: 'God Emperor' }
                            ],
                            default: 'Unknown'
                        }
                    },

                    'name': {
                        $cond: {
                            if: { $eq: ['$middlename', ''] },
                            then: { $concat: ['$lastname', ', ', '$firstname', ', ', '$title'] },
                            else: { $concat: ['$lastname', ', ', '$middlename', ' ', '$firstname', ', ', '$title'] }
                        }
                    },

                    'propername': {
                        $cond: {
                            if: { $eq: ['$middlename', ''] },
                            then: { $concat: ['$title', ' ', '$firstname', ' ', '$lastname'] },
                            else: { $concat: ['$title', ' ', '$firstname', ' ', '$middlename', ' ', '$lastname'] }
                        }
                    }
                }
            },

            { $match: finder },
            { $sort: sorter }

        ],
            { collation: settings.mongoDB.collation },
            (err, docs) => {
                db.close();
                if (!err) {
                    if (docs.length > 0)
                        res.json({ result: 'success', data: docs })
                    else if (req.params.id)
                        res.json({ result: 'error', message: 'This user doesn\'t exist.' })
                    else
                        res.json({ result: 'error', message: 'No users found.' })
                } else {
                    res.json({ result: 'error', message: err.message });
                }
            });
    });
});

//  ------------------------[ ADD/MODIFY USER ] ------------------------

app.post('/users', (req, res) => {

    if (!general.checklogin(res, req)) return false;
    general.getpostdata(req, (postdata) => {

        if (postdata.level != 0 && !general.checklogin(res, req, 2)) return false;

        finder = general.makeFinder(res, postdata._id, false);

        var update = postdata._id != 0;
        delete postdata._id;

        //  check input

        var check = ['firstname', 'lastname', 'email', 'phone_country', 'phone_district', 'phone_number', 'address_country',
            'address_state', 'address_city', 'address_zip', 'address_1', 'address_2', 'address_apt',
            'address_instructions', 'username', 'password1', 'password2', 'promotions', 'levels'];
        for (var t in check)
            if (postdata[check[t]] == 'undefined') { res.json({ result: 'error', message: 'Field ' + check[t] + ' is missing.' }); return false; }

        if (postdata.firstname == '' || postdata.firstname.length < 2) { res.json({ result: 'error', message: 'Invalid first name.' }); return false; }
        if (postdata.lastname == '' || postdata.lastname.length < 2) { res.json({ result: 'error', message: 'Invalid first name.' }); return false; }

        if (postdata.email == '' || !general.checkEmail(postdata.email)) { res.json({ result: 'error', message: 'Invalid e-mail address.' }); return false; }

        if (postdata.phone_country.length <= 1 || postdata.phone_country.length > 4) { res.json({ result: 'error', message: 'Invalid phone number country code.' }); return false; }
        if (isNaN(postdata.phone_district) || postdata.phone_district.length > 4) { res.json({ result: 'error', message: 'Invalid phone number district code.' }); return false; }
        if (isNaN(postdata.phone_number) || postdata.phone_number.length < 6 || postdata.phone_number.length > 8) { res.json({ result: 'error', message: 'Invalid phone number.' }); return false; }

        if (postdata.address_country.length <= 1 || postdata.address_country.length > 4) { res.json({ result: 'error', message: 'Invalid country code.' }); return false; }
        if (postdata.address_city == '' || postdata.address_city.length > 50) { res.json({ result: 'error', message: 'Invalid city.' }); return false; }
        if (postdata.address_zip.length <= 3 || postdata.address_zip.length > 12) { res.json({ result: 'error', message: 'Invalid postal code.' }); return false; }
        if (postdata.address_1 == '' || postdata.address_1.length < 4 || postdata.address_1.length > 50) { res.json({ result: 'error', message: 'Invalid address line 1.' }); return false; }
        if (postdata.address_2.length > 1 && (postdata.address_1.length < 4 || postdata.address_2.length > 50)) { res.json({ result: 'error', message: 'Invalid address line 2.' }); return false; }
        if (postdata.address_apt.length > 10) { res.json({ result: 'error', message: 'Invalid apartment / suite.' }); return false; }

        if (postdata.password_1 != postdata.password_2) { res.json({ result: 'error', message: 'Invalid password.' }); return false; }
        if (postdata.password_1.length < 6) { res.json({ result: 'error', message: 'The password must be at least 6 characters long.' }); return false; }
        if (postdata.username.length < 5) { res.json({ result: 'error', message: 'The username must be at least 5 characters long.' }); return false; }
        if (isNaN(postdata.level) || postdata.level < 0 || postdata.level > 5) { res.json({ result: 'error', message: 'Invalid user level.' }); return false; }
        postdata.level = Number(postdata.level);

        //  do actual stuff!

        general.MongoDB_connect(settings.mongoDB, db => {

            let updateUser = new Promise((resolve, reject) => {

                if (update) {

                    //  get user to be modified
                    //  if it doesn't exist, exit
                    //  check if current user has the right to modify this user
                    //  user should be level > 1 or it should be his own record

                    if (postdata._id != req.session.user && req.session.userLevel <= 1) {
                        reject('You can\'t modify this user.');
                    }

                    if (postdata.passwordChanged)
                        postdata.password = postdata.password_1;

                    delete postdata.passwordChanged;
                    delete postdata.password_1;
                    delete postdata.password_2;

                    db.collection('users').findOne(
                        { _id: finder },
                        { collation: settings.mongoDB.collation },
                        (err, docs) => {
                            if (err || !docs) {
                                if (err)
                                    reject(err.message)
                                else
                                    reject('This user doesn\'t exist.');
                            } else
                                resolve(docs);
                        });

                } else {

                    //  if it's a new user...
                    //  generate new ObjectID and set registration date to UTC

                    finder = new ObjectId();
                    postdata.registered = general.getUTCDate();
                    postdata.level = 0;
                    postdata.password = postdata.password_1;

                    delete postdata.passwordChanged;
                    delete postdata.password_1;
                    delete postdata.password_2;

                    //  check if the e-mail is already in use

                    db.collection('users').findOne(
                        { email: postdata.email },
                        { collation: settings.mongoDB.collation },
                        (err, docs) => {
                            if (err)
                                reject(err.message);
                            else if (!docs)
                                resolve(null)
                            else
                                reject('This e-mail address is already in use.');
                        });
                }

            }).then((user) => {

                //  do actual update / add record

                if (update)
                    postdata = { $set: postdata }

                db.collection('users').update(
                    { _id: finder },
                    postdata,
                    {
                        upsert: true,
                        collation: settings.mongoDB.collation
                    },
                    err => {
                        db.close();
                        if (!err) {
                            res.json({ result: 'success', data: { id: finder } });
                            if (update)
                                general.log('User modified: ' + user._id + ' ' + user.title + ' ' + user.firstname + ' ' + user.lastname, req);
                            else
                                general.log('New user added: ' + finder + ' ' + postdata.title + ' ' + postdata.firstname + ' ' + postdata.lastname, req);

                            //  send confirmation e-mail

                            if (user == null) {
                                var html = '';
                                var text = '';

                                fs.readFile('./assets/email/email.registration.html', (err, data) => {
                                    if (err) {
                                        general.log('Unable to load registration confirmation e-mail HTML template!', req);
                                        return false;
                                    } else {
                                        html = data.toString();
                                        html = html.replace(/{{ url }}/g, settings.general.siteURL + '/confirmreg/' + finder);
                                        html = html.replace(/{{ confirmCode }}/g, finder);
                                        html = html.replace(/{{ name }}/g, postdata.title + ' ' + postdata.firstname + ' ' + postdata.lastname);
                                        html = html.replace(/{{ email }}/g, postdata.email);
                                        html = email_html_template.replace('{{ body }}', html);

                                        fs.readFile('./assets/email/email.registration.txt', (err, data) => {
                                            if (err) {
                                                general.log('Unable to load registration confirmation plain text template!', req);
                                                return false;
                                            } else {
                                                text = data.toString();
                                                text = text.replace(/{{ url }}/g, settings.general.siteURL + '/confirmreg/' + finder);
                                                text = text.replace(/{{ confirmCode }}/g, finder);
                                                text = text.replace(/{{ name }}/g, postdata.title + ' ' + postdata.firstname + ' ' + postdata.lastname);
                                                text = text.replace(/{{ email }}/g, postdata.email);
                                                text = email_text_template.replace('{{ body }}', text);

                                                general.sendMail(postdata.email, 'Please confirm your registration', text, html);
                                            }
                                        });
                                    }
                                });
                            }

                        } else {
                            general.log('Create/modify user failed: ' + err.message, req);
                            res.json({ result: 'error', message: err.message });
                        }
                    });

            }).catch((error) => {
                general.log('Create/modify user failed: ' + error, req);
                res.json({ result: 'error', message: error });
            });


        });
    });
});

//  ------------------------[ VERIFY REGISTRATION ] ------------------------

app.get('/confirmuser/:id?', (req, res) => {

    var id = req.params.id;
    if (!id) {
        res.json({ result: 'error', message: 'Invalid identifier.' });
        return false;
    }

    finder = general.makeFinder(res, id, true);
    if (!finder) return false;

    general.MongoDB_connect(settings.mongoDB, db => {

        db.collection('users').findOne(
            { _id: finder },
            { collation: settings.mongoDB.collation },
            (err, docs) => {
                if (!err) {
                    if (!docs)
                        res.json({ result: 'error', message: 'This user is not registered.' })
                    else if (docs.level > 0)
                        res.json({ result: 'error', message: 'This user is already confirmed.' })
                    else
                        doUpdate(docs);
                } else {
                    res.json({ result: 'error', message: 'Invalid confirmation code.' });
                }
            });

        doUpdate = (user) => {
            db.collection('users').findOneAndUpdate(
                { _id: finder, level: 0 },
                { $set: { level: 1 } },
                {
                    upsert: false,
                    collation: settings.mongoDB.collation
                },
                (err, docs) => {
                    db.close();
                    if (!err) {
                        general.log('User confirmed: ' + user.name, req);
                        res.json({ result: 'success' });
                    } else {
                        general.log('User update failed: ' + user.name, req);
                        res.json({ result: 'error', message: err.message });
                    }
                });
        }

    });

});

//  ------------------------[ FORGOT PASSWORD ] ------------------------

app.post('/forgotpsw', (req, res) => {

    general.getpostdata(req, (postdata) => {

        var regex = /^[A-Z0-9_'%=+!`#~$*?^{}&|-]+([\.][A-Z0-9_'%=+!`#~$*?^{}&|-]+)*@[A-Z0-9-]+(\.[A-Z0-9-]+)+$/i;
        if (!postdata.email || !regex.test(postdata.email)) { res.json({ result: 'error', message: 'Invalid e-mail address.' }); return false; }

        general.MongoDB_connect(settings.mongoDB, db => {

            db.collection('users').findOne(
                { email: postdata.email },
                { collation: settings.mongoDB.collation },
                (err, docs) => {
                    if (!err) {
                        if (!docs)
                            res.json({ result: 'error', message: 'This e-mail address is not in our database.' })
                        else
                            sendReminder(docs);
                    } else {
                        res.json({ result: 'error', message: 'Invalid e-mail address.' });
                    }
                });

            sendReminder = (user) => {

                //  set reset code

                var resetcode = general.randomString();

                db.collection('users').update(
                    { email: user.email },
                    { $set: { resetcode: resetcode } },
                    { collation: settings.mongoDB.collation },
                    (err, docs) => {
                        if (!err) {

                            //  ----------------------------------------------------------------------------------------                                
                            // send password reset e-mail

                            var html = '';
                            var text = '';

                            fs.readFile('./assets/email/email.forgotpsw.html', (err, data) => {
                                if (err) {
                                    general.log('Unable to load registration confirmation e-mail HTML template!', req);
                                    return false;
                                } else {
                                    html = data.toString();
                                    html = html.replace(/{{ url }}/g, settings.general.siteURL + '/resetpsw/' + resetcode);
                                    html = html.replace(/{{ resetcode }}/g, resetcode);
                                    html = html.replace(/{{ name }}/g, user.name);
                                    html = html.replace(/{{ username }}/g, user.username);
                                    html = html.replace(/{{ email }}/g, user.email);
                                    html = email_html_template.replace('{{ body }}', html);

                                    fs.readFile('./assets/email/email.forgotpsw.txt', (err, data) => {
                                        if (err) {
                                            general.log('Unable to load registration confirmation plain text template!', req);
                                            return false;
                                        } else {
                                            text = data.toString();
                                            text = text.replace(/{{ url }}/g, settings.general.siteURL + '/resetpsw/' + resetcode);
                                            text = text.replace(/{{ resetcode }}/g, resetcode);
                                            text = text.replace(/{{ name }}/g, user.name);
                                            text = text.replace(/{{ username }}/g, user.username);
                                            text = text.replace(/{{ email }}/g, user.email);
                                            text = email_text_template.replace('{{ body }}', text);

                                            general.sendMail(user.email, 'Please reset your password', text, html);
                                            res.json({ result: 'success' });
                                        }
                                    });
                                }
                            });

                            //  ----------------------------------------------------------------------------------------

                        } else {
                            res.json({ result: 'error', message: 'Couldn\'t reset password.' });
                        }
                    });


            }

        });

    });
});

//  ------------------------[ RESET PASSWORD ] ------------------------

app.post('/resetpsw', (req, res) => {

    general.getpostdata(req, (postdata) => {

        if (!postdata.resetcode || !postdata.password_1 || !postdata.password_2) { res.json({ result: 'error', message: 'Invalid password.' }); return false; }
        if (postdata.password_1 != postdata.password_2) { res.json({ result: 'error', message: 'The passwords don\'t match.' }); return false; }
        if (postdata.password_1.length < 8) { res.json({ result: 'error', message: 'The password must be at least 8 characters long.' }); return false; }

        general.MongoDB_connect(settings.mongoDB, db => {

            //  set the new password
            db.collection('users').findOneAndUpdate(
                { resetcode: postdata.resetcode },
                { $set: { password: postdata.password_1 } },
                { collation: settings.mongoDB.collation },
                (err, docs) => {
                    if (!err) {
                        if (docs.value == null)
                            res.json({ result: 'error', message: 'This password reset code is not in our database.' })
                        else
                            unset(docs.value);
                    } else {
                        res.json({ result: 'error', message: 'Invalid password reset code.' });
                    }
                });

            //  $set and $unset can't happen in the same query, so here we go
            unset = (user) => {

                db.collection('users').update(
                    { resetcode: postdata.resetcode },
                    { $unset: { resetcode: null } },
                    { collation: settings.mongoDB.collation },
                    err => {
                        if (!err) {
                            general.log('Password reset for user ' + user.name, req)
                            res.json({ result: 'success' });
                        } else
                            res.json({ result: 'error', message: 'Invalid password reset code.' });
                    });

            }
        });
    });
});

//  ------------------------[ DELETE USER ] ------------------------

app.delete('/users/:id?', (req, res) => {

    if (!general.checklogin(res, req)) return false;
    finder = general.makeFinder(res, req.params.id, true);
    if (!finder) return false;

    if (req.session.level <= 1) {
        res.json({ result: 'error', message: 'You can\'t delete users.' });
        return false;
    }

    if (req.params.id == req.session.user) {
        res.json({ result: 'error', message: 'You can\'t delete yourself.' });
        return false;
    }

    general.MongoDB_connect(settings.mongoDB, db => {

        //  delete the user's records

        db.collection('records').remove(
            { user: finder },
            { collation: settings.mongoDB.collation },
            (err, docs) => {
                db.close();
            });

        //  delete user

        db.collection('users').findOneAndDelete(
            { _id: finder },
            { collation: settings.mongoDB.collation },

            (err, docs) => {
                db.close();
                if (!err) {
                    if (docs.value) {
                        general.log('User deleted: ' + docs.value._id + ' ' + docs.value.title + ' ' + docs.value.firstname + ' ' + docs.value.lastname, req)
                        res.json({ result: 'success' });
                    } else
                        res.json({ result: 'error', message: 'User not found.' });
                } else {
                    res.json({ result: 'error', message: err.message });
                }
            });
    });
});
