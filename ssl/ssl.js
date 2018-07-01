const fs = require('fs');
const general = require('./../modules/general.js');

module.exports = {

    setup: (ssl) => {
        if (ssl && ssl.active) {
            return {
                key: fs.readFileSync(ssl.key),
                cert: fs.readFileSync(ssl.certificate)
            };
        }
    },

    start: (app, options, port) => {
        var date = new Date();
        if (options) {
            general.log('HTTPS server listening on port ' + port + '...');
            return require('https').createServer(options, app)
        } else {
            general.log('HTTP server listening on port ' + port + '...');
            return require('http').createServer(app);
        }
    },

    create: (settings, app, cb) => {
        var options = module.exports.setup(settings.ssl);
        return module.exports.start(app, options, settings.port).listen(settings.port, cb);
    }

};
