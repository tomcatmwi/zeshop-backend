//  ------------------------[ GET ADDRESS FORMATS ] ------------------------

app.get('/getaddressformat/:id?', (req, res) => {

    var id = req.params.id;
    if (!id || id.length != 2) id = 'generic';

    var format = addressformats[id];
    if (!format) {
        res.json({ result: 'success', data: addressformats.generic });
        return false;
    }

    while (format.redirect)
        format = addressformats[format.redirect];

    res.json({ result: 'success', data: format });

});

//  ------------------------[ FORMAT A USER'S ADDRESS FOR PRINTING ] ------------------------

app.get('/formataddress/:user?', (req, res) => {

});