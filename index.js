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

//  --------------------------------------[ LOAD SETTINGS ]--------------------------------------

try {
  global.settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
} catch (err) {
  general.log('Can\'t load settings.json.');
  process.exit();
}

//  --------------------------------------[ NODEMAILER SETUP ]--------------------------------------

//  load e-mail html template

global.email_html_template = '';

fs.readFile('./assets/email/email.template.html', (err, data) => {
  if (err)
    general.log('Unable to load general HTML e-mail template!');
  else
    email_html_template = data.toString();
});

//  load e-mail plain text template

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

//  --------------------------------------[ SSL INIT ]--------------------------------------

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

//  ------------------------[ MONGODB INIT ] ------------------------

general.MongoDB_connect(settings.mongoDB, db => {
  general.log('Connected to MongoDB.');
  db.close();
});

//  ------------------------[ SESSION INIT ] ------------------------

app.use(session({
  cookieName: settings.session.name,
  secret: general.randomString(32),                 // random encryption key string
  duration: settings.session.duration,
  activeDuration: settings.session.activeDuration
}));

//  ------------------------[ ROOT ] ------------------------

app.get('/', (req, res) => {
  res.json({
    result: 'success', data: {
      'about': settings.about,
      'ssl': settings.ssl.active
    }
  });
});

//  ------------------------[ REQUIRE MODULES ] ------------------------

require('./inc.interfaces');
require('./inc.settings');
require('./inc.users');
require('./inc.messages');
require('./inc.development');
