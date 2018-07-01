//  This module performs an IP address lookup on ipstack.com
//  Requires registration and API key.

http = require('http');

const self = module.exports = {

    //  You can specify multiple IP addresses separated with commas!
    locate: (ip = '127.0.0.1') => {
        return new Promise((resolve, reject) => {
            
            if (!settings.general.allow_iplocation) resolve(null);

            const req = http.get(
                {
                    hostname: 'ip-api.com',
                    path: '/json/' + ip,
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000
                },
                res => {
                    res.setEncoding('utf8');
                    if (res.statusCode != 200) reject('HTTP error '+res.statusCode);
                    response = '';
                    res.on('data', (chunk) => {
                        response += chunk;
                    });
                    res.on('end', () => {
                        let result = JSON.parse(response);
                        if (result.status == 'fail') reject(result.message);
                        resolve(result);
                    });
                });

            req.on('error', error => {
                reject(error);
            });

        });
    }

}