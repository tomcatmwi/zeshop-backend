const self = module.exports = {

  //  ---------------------------------------------------------------------------------------------------------------------------------------
  //  convert a js timestamp into a date/time for the logs

  ts2log: (timestamp) => {

    var ts = timestamp.getFullYear() + '/';

    var temp = timestamp.getMonth() + 1;
    if (Number(temp) < 10) temp = '0' + temp;
    ts += temp + '/';

    var temp = timestamp.getDate();
    if (Number(temp) < 10) temp = '0' + temp;
    ts += temp + ' ';

    var temp = timestamp.getHours();
    if (Number(temp) < 10) temp = '0' + temp;
    ts += temp + ':';

    var temp = timestamp.getMinutes();
    if (Number(temp) < 10) temp = '0' + temp;
    ts += temp + ':';

    var temp = timestamp.getSeconds();
    if (Number(temp) < 10) temp = '0' + temp;
    ts += temp + ' ';

    return ts;
  },

  //  ---------------------------------------------------------------------------------------------------------------------------------------
  //  convert a js timestamp into a 8 char string

  ts2filename: (timestamp) => {

    var ts = timestamp.getFullYear();

    var temp = timestamp.getMonth() + 1;
    if (Number(temp) < 10) temp = '0' + temp;
    ts += temp;

    var temp = timestamp.getDate();
    if (Number(temp) < 10) temp = '0' + temp;
    ts += temp;

    return ts;
  },

  //  ---------------------------------------------------------------------------------------------------------------------------------------
  //  logs events to the console and/or file

  log: (msg, req = null) => {
    var date = new Date();

    if (global.settings.logging.console)
      console.log(module.exports.ts2log(date) + '| ' + msg);

    if (global.settings.logging.enabled) {

      let line = module.exports.ts2log(date) + '| ';
      line += _.padEnd(String(module.exports.getIP(req)), 15, ' ') + ' | ';
      line += _.truncate(_.padEnd(module.exports.getUser(req), 20, ' '), { 'length': 20, 'omission': '' }) + ' | ' + msg;

      let logpath = global.settings.logging.location;
      if (logpath.substr(logpath.length - 1, 1) != '/')
        logpath += '/';

      if (global.settings.logging.daily)
        logpath += module.exports.ts2filename(date) + '.log';
      else
        logpath += 'zeshop.log';

      fs.appendFile(logpath, line + os.EOL, null, 'utf8', (err) => {
        if (err)
          console.log(ts2log(date) + '| Unable to write file ' + logpath);
      });
    }
  },

  //  ---------------------------------------------------------------------------------------------------------------------------------------
  //  returns HTTP POST data from HTTP request

  getpostdata: (req, callback) => {
    var postdata = [];
    req.on('data', chunk => {
      postdata.push(chunk);
    }).on('end', () => {
      try {
        stuff = JSON.parse(decodeURIComponent(Buffer.concat(postdata).toString()));
      } catch (error) {
        stuff = { error: error };
      } finally {
        callback(stuff);
      }
    });
  },

  //  ---------------------------------------------------------------------------------------------------------------------------------------
  //  checks if user is logged in and has the specified level

  checklogin: (res, req, level = 1) => {

    //    self.log('WARNING: Login session checking DISABLED !!!');
    //    return true;

    if (typeof req.session === 'undefined' || typeof req.session.user === 'undefined') {
      res.json({ result: 'error', message: 'You are not logged in.', login: false });
      return false;
    }

    if (req.session.level < level) return false;
    return true;
  },

  //  ---------------------------------------------------------------------------------------------------------------------------------------
  //  extracts IP address from request

  getIP: (req = null) => {
    if (req == null) return ('0.0.0.0');
    ip = requestIp.getClientIp(req);
    if (ip == '::1' || ip == '::ffff:127.0.0.1') ip = '127.0.0.1';
    return ip;
  },

  //  ---------------------------------------------------------------------------------------------------------------------------------------
  //  extracts user's name address from request

  getUser: (req = null) => {
    if (!req) return ('SYSTEM');
    if (!req.session || !req.session.name) return ('NO LOGIN');
    return req.session.name;
  },

  //  ---------------------------------------------------------------------------------------------------------------------------------------
  //  a random string generator for ids and stuff

  randomString: (chars = 12, numbers = true, onlynumbers = false) => {
    let str = '';

    if (!numbers)
      var charray = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    else
      var charray = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    if (onlynumbers)
      var charray = '0123456789';

    for (let t = 0; t <= chars; t++)
      str += charray.charAt(Math.floor(Math.random() * charray.length));

    return str;
  },

  //  ---------------------------------------------------------------------------------------------------------------------------------------
  //  MongoDB connector
  //  If you need the old method, replace this with the MongoDB_connect_old method!

  MongoDB_connect: (mongoData, callback) => {

    var url = 'mongodb://' +
      mongoData.username + ':' +
      mongoData.password + '@' +
      mongoData.url + ':' +
      String(mongoData.port) + '/' +
      mongoData.db;

    mongodb.connect(url, (err, db) => {

      if (err) {
        self.log('MongoDB error ' + err.code + ': ' + err.message);
        process.exit();
      }
      return callback(db);

    });
  },

  //  ---------------------------------------------------------------------------------------------------------------------------------------  
  //  makeFinder() creates an ObjectID of a given value,
  //  a new one if it's empty or 0,
  //  or an error message otherwise

  makeFinder: (res, id, allowFail = true) => {

    if (id && id != '0') {
      try {
        var finder = new ObjectId(id);
        return finder;
      } catch (err) {
        if (allowFail) res.json({ result: 'error', message: 'Invalid object ID.' });
        return false;
      }
    } else if (!allowFail) return new ObjectId()
    else {
      res.json({ result: 'error', message: 'Invalid object ID.' });
      return false;
    }
  },

  //  ---------------------------------------------------------------------------------------------------------------------------------------  
  //  getUTCDate() converts a Date object to UTC time

  getUTCDate: (input, zeroTime = false, endTime = false) => {

    if (!(input instanceof Date))
      var input = new Date(input);

    if (typeof input == 'undefined' || input.toString() == 'Invalid Date')
      var input = new Date()

    var returnDate = new Date(
      input.getUTCFullYear(),
      input.getUTCMonth(),
      input.getUTCDate(),
      input.getUTCHours(),
      input.getUTCMinutes(),
      input.getUTCSeconds(),
      input.getUTCMilliseconds()
    );

    if (zeroTime) {
      returnDate.setUTCHours(0);
      returnDate.setUTCMinutes(0);
      returnDate.setUTCSeconds(0);
      returnDate.setUTCMilliseconds(0);
    }

    if (endTime) {
      returnDate.setUTCHours(23);
      returnDate.setUTCMinutes(59);
      returnDate.setUTCSeconds(59);
      returnDate.setUTCMilliseconds(999);
    }

    return returnDate;

  },

  //  ---------------------------------------------------------------------------------------------------------------------------------------  
  //  sendMail() sends an e-mail (wow)

  sendMail(to, subject, text, html) {

    const transporter = nodemailer.createTransport(settings.nodemailer);

    var mail = {
      from: settings.nodemailer.email_from, // sender address
      to: to, // list of receivers
      subject: subject, // Subject line
      text: text, // plain text body
      html: html // html body
    };

    transporter.sendMail(mail, (error, info) => {
      if (error)
        self.log('SMTP error attempting to send to "' + to + '": ' + error)
      else
        self.log('E-mail was sent to ' + to);
    });

  },

  //  ---------------------------------------------------------------------------------------------------------------------------------------  
  //  validateObject() validates whether an object conforms to the specified schema
  //  (like interfaces)

  validateObject(input, template, typeCheck = false) {

    if (typeof input !== 'object') return false;
    if (typeof template !== 'object') return false;

    for (var template_key in template) {
      var found = false;
      for (var key in input) {
        if (typeCheck && key == template_key && typeof input[key] == typeof template[template_key]) found = true;
        if (!typeCheck && key == template_key) found = true;
      }
      if (!found) return false;
    }

    return true;
  },

  //  ---------------------------------------------------------------------------------------------------------------------------------------  
  //  checkEmail() checks whether a string is a valid e-mail

  checkEmail(input) {
    var regex = /^[A-Z0-9_'%=+!`#~$*?^{}&|-]+([\.][A-Z0-9_'%=+!`#~$*?^{}&|-]+)*@[A-Z0-9-]+(\.[A-Z0-9-]+)+$/i;
    return input.match(regex) != null;
  }

  //  ---------------------------------------------------------------------------------------------------------------------------------------  
}
