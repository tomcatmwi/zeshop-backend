//  load modules

express = require('express');
os = require("os");
fs = require('fs');
https = require('https');
http = require('http');
querystring = require('querystring');
md5 = require('js-md5');
router = express.Router()
app = express();
session = require('client-sessions');
url = require('url');
methodOverride = require('method-override');
_ = require('lodash');
moment = require('moment');
mongodb = require('mongodb');
ObjectId = require('mongodb').ObjectId;
nodemailer = require('nodemailer');
requestIp = require('request-ip');
sanitizeHTML = require('sanitize-html');

//  load custom modules

general = require('./modules/general.js');
recaptcha = require('./modules/recaptcha.js');
iplocation = require('./modules/iplocation.js');
addresser = require('./modules/addresser.js');

dbClient = null;    //  global database client

//  --------------------------------------[ LOAD SETTINGS ]--------------------------------------

try {
  global.settings = JSON.parse(fs.readFileSync('./assets/json/settings.json', 'utf8'));
} catch (err) {
  general.log('Can\'t load settings.json: ' + err.message);
  process.exit();
}

process.env.TZ = settings.general.timezone;

try {
  //  global.values = JSON.parse(fs.readFileSync('./assets/json/values.json', 'utf8'));
  global.values = JSON.parse(fs.readFileSync('./values3.json', 'utf8'));
} catch (err) {
  general.log('Can\'t load values.json: ' + err.message);
  process.exit();
}

try {
  global.addressformats = JSON.parse(fs.readFileSync('./assets/json/addressformats.json', 'utf8'));
} catch (err) {
  general.log('Can\'t load addressforms.json: ' + err.message);
  process.exit();
}

//  --------------------------------------[ NODEMAILER SETUP ]--------------------------------------

//  load html e-mail templates

global.email_html_template = '';

fs.readFile('./assets/email/email.template.html', (err, data) => {
  if (err)
    general.log('Unable to load general HTML e-mail template!');
  else
    email_html_template = data.toString();
});

//  load plain text e-mail templates

global.email_text_template = '';
fs.readFile('./assets/email/email.template.txt', (err, data) => {
  if (err)
    general.log('Unable to load general plain text e-mail template!');
  else
    email_text_template = data.toString();
});

//  ------------------------[ APP INIT ] ------------------------

app.disable('x-powered-by')
app.set('view engine', 'pug')
app.set('views', __dirname + '/views')

app.use(methodOverride('X-HTTP-Method-Override'));    // allows the use of PUT and DELETE

app.use(express.static('./public'))

app.use((req, res, next) => {
  res.header('Content-Type', 'application/json; charset=utf-8');
  res.header('charset', 'utf-8');

  if (typeof req.headers.origin === 'undefined')
    req.headers.origin = null;

  if (settings.cors.indexOf(req.headers.origin) != -1)
    res.header('Access-Control-Allow-Origin', req.headers.origin);

  res.header('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS,PUT,PATCH,DELETE');
  res.header('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type');
  res.header('Access-Control-Allow-Credentials', true);
  next();
});

//  ------------------------[ SESSION INIT ] ------------------------

app.use(session({
  cookieName: settings.session.name,
  secret: general.randomString(32),                 // random encryption key string
  duration: settings.session.duration,
  activeDuration: settings.session.activeDuration
}));

//  ------------------------[ MONGODB INIT ] ------------------------

var url = 'mongodb://' + settings.mongoDB.username + ':' + settings.mongoDB.password + '@' + settings.mongoDB.url + ':' + String(settings.mongoDB.port) + '/' + settings.mongoDB.db;
mongodb.connect(url, (err, client) => {

  if (err) {
    self.log('MongoDB connection error ' + err.code + ': ' + err.message);
    process.exit();
  }

  dbClient = client;
  general.log(`MongoDB client connected to ${dbClient.s.url}`);

  //  ------------------------[ LISTENING STARTS ]-------------------

  ssl = require(__dirname + '/ssl/ssl.js');
  myssl = ssl.create({
    ssl: {
      key: __dirname + settings.ssl.key,
      certificate: __dirname + settings.ssl.certificate,
      active: settings.ssl.active
    },
    port: settings.ssl.port
  },
    app);

});

//  ------------------------[ ROOT ] ------------------------

app.get('/', (req, res) => {
  res.json({ result: 'success', data: { 'about': settings.general.about, 'ssl': settings.ssl.active } });
});


//  ------------------------[ CLEANUP ROUTINE ON EXIT ] ------------------------


const exitHandler = (err = null) => {
  if (dbClient && typeof dbClient.close == 'function') {
    dbClient.close();
    general.log('MongoDB connection terminated.');
  }

  if (err)
    general.log('UNHANDLED EXCEPTION: '+err); 

  process.removeAllListeners('exit');
  let appStarted = new Date();
  appStarted.setTime(new Date().getTime() - Math.floor(process.uptime()));
  general.log(`Application terminated after ${ general.since(appStarted) } of uptime.`);

  process.exit();
}

process.stdin.resume();
//process.on('exit', exitHandler.bind());

process.on('exit', () => exitHandler());
process.on('SIGTERM', () => exitHandler());
process.on('SIGINT', () => exitHandler());
process.on('SIGUSR1', () => exitHandler());
process.on('SIGUSR2', () => exitHandler());
process.on('uncaughtException', err => { exitHandler(err) });


//  ------------------------[ REQUIRE MODULES ] ------------------------

require('./inc.interfaces');
require('./inc.settings');
require('./inc.users');
require('./inc.address');
require('./inc.messages');
require('./inc.development');
