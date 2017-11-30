/**
 * An express server to serve as an API for the web app
 */

"use strict";

var path = require("path");
var express = require("express");
var app = express();
var bodyParser = require("body-parser");
var mongo = require("./database_client/mongoDriver.js");
var port = process.env.PORT || 8080;
var router = express.Router();
var neo4j = require("./database_client/neo4jDriver.js");
var utils = require("./utils");

// get data from the database
// don't really need this endpoint...
router.get('/get_data/:list_name', function(req, res) {
    var lname = req.params.list_name; // query db for this list

    mongo.findDocument({"name": lname}, function(resp) {
        if (resp.length > 0) {
            console.log(resp[0]);
            res.json(resp);
        } else {
            res.json({"Error": `No list found with name: ${lname}`})
        }
    });
});

// post data to the database
// don't really need this endpoint...
router.post('/post_data/', function(req, res) {
    var data = req.body;
    console.log(req.body);

    // error handle
    if (data.name === undefined) {
        res.json({"Error": "invalid data format"});
    }
    else {
        // add to db
        mongo.insertDocument(data, function(resp) {
            res.json(resp);
        });
    }
})

// add user
router.post("/add_user/", function(req, res) {
    var data = req.body;
    if (data.username === undefined && data.password === undefined) {
        res.json({"Error": "invalid data format"});
    } else {

        // construct userdoc
        var userdoc = {
            username: data.username
        }
        
        // check for existing user
        mongo.findDocument(userdoc, function(resp) {
            if (resp.length > 0) {
                res.json( {"Error": "This username already exists"} );
            } else {
                // encrypt password
                utils.hashPassword(data.password, 5, function(hashed) {
                    userdoc.password = hashed;
                    mongo.insertDocument(userdoc, function(resp) {
                        res.json(resp)
                    }) 
                })
            }
        })
    }
});

// get user
router.post("/get_user/", function(req, res) {
    var data = req.body;
    if (data.username === undefined || data.password === undefined) {
        res.json( {"Error": "invalid data format"} );
    } else {

       // construct query doc 
       var userdoc = {
           username: data.username
       }

       mongo.findDocument(userdoc, function(resp) {
            if (resp.length > 0) {
                utils.hashPassword(data.password, 5, function(hashed) {
                    utils.compareHash(data.password, resp[0].password, function(resp1) {
                        if (resp1 == true) {
                            res.json(resp[0]);
                        } else {
                            res.json({ "Invalid Password": "User found, but the password is invalid"});
                        }
                    })
                })
             } else {
                 res.json({"Error": "No such user"})
             }
        })
    }
})

// query neo4j
router.post("/neo4j/", function(req, res) {
    var data = req.body;
    var statement = data.statement;
    var params = {}

    // construct params object
    Object.keys(data).forEach(function(element, key, _array) {
        params[element] = data[element]
        console.log(`elem: ${element}, key: ${key}\n, data ${element}: ${data[element]}`);
    })

    console.log(`params: ${JSON.stringify(params, null, 2)}`);
    console.log(`data: ${JSON.stringify(data, null, 2)}`);
    var record = {}
    neo4j.query(statement, params, record)
        .then(function(resp) {
            console.log(`record: ${JSON.stringify(resp, null, 2)}`);
            res.json(resp)
        });
})

// get neo4j session
router.get("/neo4j/", function(req, res) {
    // get a neo4j session
    var session = neo4j.getSession();
    var r = {session: "Failure"}
    if (session) {
        r.session = "Success"
    }

    res.json(r);
})

// super insecure, probably want to use some sort of library for this...
router.post("/login/", function(req, res) {

    // verify user
    var data = req.body;
    console.log(`data ${JSON.stringify(data, 2)}`);
    mongo.findDocument({"username": data.username}, function(resp) {

        if ( resp.length > 0) {
            console.log("found login doc");
            // vet the user 
        } else {
            res.json({"Error": "could not find user"})
        }
    });
});

// use bodyParser
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// all endpoints are prepended with '/api'
app.use('/api', router);

// add directories with the files we need
app.use(express.static("public"));
app.use(express.static("style"));
app.use(express.static("scripts"));

app.get('*', function(req, res) {
    res.sendFile("public/index.html", { root: '.' });
});

// Start the server instance
app.listen(port);

console.log(`Server is listening on port ${port}`);
