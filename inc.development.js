//  ------------------------[ ADD DEFAULT ADMIN ] ------------------------

app.get("/defaultadmin", (req, res) => {

    if (!global.settings.general.developer_mode) {
        general.log('Attempted to invoke developer command: /defaultadmin', req);
        res.json({ result: "error", message: 'Developer commands are not enabled.' });
        return false;
    }

    general.MongoDB_connect(settings.mongoDB, db => {

        var password = (Math.random().toString(36) + "00000000000000000").slice(2, 12);

        var user = Object.assign(templates.user);

        user._id = new ObjectId();
        user.firstname = "Default";
        user.lastname = "Administrator";
        user.username = "admin";
        user.level = 2;
        user.password = md5(password);

        //  add admin to user db

        db.collection('users').deleteMany(
            { username: "admin" },
            { collation: settings.mongoDB.collation },
            err => {
                if (!err)
                    general.log('Default administrator deleted.', req)
                else
                    general.log('No default administrator found.', req)
            }
        );

        db.collection('users').insert(
            user,
            {
                upsert: true,
                collation: settings.mongoDB.collation
            },
            err => {
                db.close();
                if (!err) {
                    general.log('Default administrator added. Password: "' + password + '"', req);
                    res.json({ result: "success" });

                } else {
                    general.log("Failed to add default administrator to database.", req);
                    res.json({ result: "error", message: err.message });
                }
            });


    });
});

//  ------------------------[ ADD CLUTTER DATA ] ------------------------

app.get("/dataclutter/:counter", (req, res) => {

    if (!global.settings.general.developer_mode) {
        general.log('Attempted to invoke developer command: /dataclutter', req);
        res.json({ result: "error", message: 'Developer commands are not enabled.' });
        return false;
    }

    general.MongoDB_connect(settings.mongoDB, db => {

        var counter = 200;
        var added = 0;
        if (!isNaN(req.params.counter)) counter = Number(req.params.counter);

        for (let t = 0; t <= counter; t++) {

            var password = (Math.random().toString(36) + "00000000000000000").slice(2, 12);
            var user = Object.assign(templates.user);

            user._id = new ObjectId();
            user.firstname = "Clutter " + String(t);
            user.lastname = (Math.random().toString(36) + "00000000000000000").slice(7, 20);
            user.username = "clutter";
            user.level = -2;
            user.password = md5((Math.random().toString(36) + "00000000000000000").slice(2, 12));

            db.collection('users').insert(
                user,
                {
                    upsert: true,
                    collation: settings.mongoDB.collation
                },
                err => {
                    if (err) {
                        db.close();
                        t = counter;
                        general.log("Data clutter operation failed.", req);
                        res.json({ result: "error", message: err.message });
                    } else added++;
                });

        }

        db.close();
        general.log('Data clutter finished.', req);
        res.json({ result: "success", message: String(counter) });

    });

});

//  ------------------------[ DELETE CLUTTER DATA ] ------------------------

app.get("/deleteclutter", (req, res) => {

    if (!global.settings.general.developer_mode) {
        general.log('Attempted to invoke developer command: /deleteclutter', req);
        res.json({ result: "error", message: 'Developer commands are not enabled.' });
        return false;
    }

    general.MongoDB_connect(settings.mongoDB, db => {

        db.collection('users').deleteMany(
            { level: -2 },
            { collation: settings.mongoDB.collation },
            err => {
                db.close();
                if (!err) {
                    general.log("Data clutter rows purged.", req);
                    res.json({ result: "success", message: 'Data clutter rows purged.' });
                } else {
                    general.log("Data clutter operation failed.", req);
                    res.json({ result: "error", message: err.message });
                }
            });

    });

});