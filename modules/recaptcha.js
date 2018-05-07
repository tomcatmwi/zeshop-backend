const self = module.exports = {

    checkrecaptcha: (captcha = 'INVALID', req) => {

        let post_data = querystring.stringify({
            secret: settings.recaptcha.secret_key,
            response: captcha,
            remoteip: general.getIP(req),
        });

        let post_options = {
            host: settings.recaptcha.host,
            path: settings.recaptcha.path,
            method: settings.recaptcha.method,
            port: settings.recaptcha.port,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(post_data)
            }
        };

        return new Promise((resolve, reject) => {

            let recaptcha_check = https.request(post_options, (result) => {
                result.on('data', (data) => {
                    response = JSON.parse(data.toString('utf8'));
                    if (response.success)
                        resolve(response)
                    else {
                        general.log('Invalid captcha! Error code: ' + JSON.stringify(response['error-codes']), req);
                        reject(response);
                    }
                });
            });

            recaptcha_check.on('error', (error) => {
                general.log('ReCaptcha verification HTTPS request error: ', error.code);
                reject(false);
            });

            recaptcha_check.write(post_data);
            recaptcha_check.end();
        });

    }

}