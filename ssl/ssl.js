var fs = require('fs');
var general = require('./../modules/general.js');

function setup (ssl) {
   if (ssl && ssl.active) {
      return {
         key  : fs.readFileSync(ssl.key),
         cert : fs.readFileSync(ssl.certificate)
      };
   }
}

function start (app, options, port) {
   var date = new Date();
   if (options) {
      general.log('HTTPS server listening on port '+port+'...');
      return require('https').createServer(options, app)
   } else {
      general.log('HTTP server listening on port '+port+'...');
      return require('http').createServer(app);
   }
}

module.exports = {
   create: function(settings, app, cb) {
      var options = setup(settings.ssl);
      return start(app, options, settings.port).listen(settings.port, cb);
   }
};
