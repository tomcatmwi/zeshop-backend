module.exports = {

    formatAddress: (user, html=false) => {

        var address = '';
        var eol = html ? '' : os.EOL;

        let format = addressformats[user.country];
        if (format && format.redirect) { format = addressformats[format.redirect]; }
        if (!format) format = addressformats.generic;

        let country = _.find(values.countries, { id: user.country });

        //  format name

        user.name = '';
        format.nameOrder.forEach(element => {
            if (user.name != '' && user.name.substr(user.name.length - 1, 1) != ' ') user.name += ' ';
            if (user[element]) user.name += user[element];
        });

        //  assemble fields

        var lastField = null;

        format.fields.forEach(field => {

            if (!user[field.fieldname] && field.type == 'string' && field.mandatory) {
                address = '';
                general.log('ERROR: field `' + field.fieldname + '` is not specified for user `' + user.name + '`!', req);
                return false;
            }

            let element = '';
            if (html && (!lastField || lastField.trail == '\n')) element = '<p>';

            //  find region and apply name or id respectively
            if (field.fieldname.substr(0, 6) == 'region' && country.regions) {

                let region = country.regions[_.findIndex(country.regions, { id: user.region })];
                if (region)
                    element += (field.fieldname == 'region' || field.fieldname == 'region.name') ? region.name : region.id;
            }

            //  find country name
            if (field.fieldname.substr(0, 8) == 'country.')
                element += country[field.fieldname.substr(8)];

            if (field.fieldname == 'country')
                element += country.nameeng;

            //  if no special fields, just add the data
            if (user[field.fieldname]) element += user[field.fieldname];

            //  capitalization, trailing character
            if (field.capitalize) element = element.toUpperCase();

            if (field.trail && element != '')
                element += field.trail == '\n' ? eol : field.trail;

            lastField = field;
            address += element;
        });

        if (html)
            address = '<div class="address">'+address+'</p></div>';

        console.log(address);

        return address;

    }
}