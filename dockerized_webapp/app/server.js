 /**
  *
  * An express server to serve as an API for the web app
  *
  */

"use strict";

var path = require("path");
var express = require("express");
var bcrypt = require("bcrypt");
var bodyParser = require("body-parser");
var json2csv = require("json2csv").Parser;
var mongo = require("./utils/mongoDriver.js");
var neo4j = require("./utils/neo4jDriver.js");
var qstrings = require("./utils/querystrings.js");
var ObjectId = require("mongodb").ObjectId;

var port = 80;
var app = express();
var router = express.Router();

/**
 * request format:
 * 
 * {
 *      "username": <string>,
 *      "password": <string>  
 * }
 * 
 */
router.post("/add_user/", function (req, res) {
    var data = req.body;
    

    if (data.username === undefined || data.password === undefined) {
        var err = { "Error": "invalid data format. Users must have both a username and password" };
        
        res.json(err);
    } else {

        // construct userdoc
        var userdoc = {
            username: data.username
        };

        // check for existing user
        mongo.findDocument(userdoc, function (resp) {
            if (resp.length > 0) {
                var err = { "Error": "This username already exists" };
                res.json(err);
            } else {
                // encrypt password
                bcrypt.hash(data.password, 5)
                    .then(function (hashed) {
                        userdoc.password = hashed;
                        //userdoc.recent =
                        mongo.insertDocument(userdoc, function (resp) {
                            res.json(resp);
                        });
                    })
                    .catch(function(err) {
                        res.json(err);
                    });
            }
        });
    }
});

/**
 * request format:
 * 
 * {
 *      "username": <string>,
 *      "password": <string>  
 * }
 * 
 */
router.post("/get_user/", function (req, res) {
    
    var data = req.body;
    var userErr = { "Error": "Password or user is incorrect" };

    if (data.username === undefined || data.password === undefined) {
        var err = { "Error": "invalid data format" };
        res.json(err);
    } else { 
    // add another conditional here to limit password/username length

        // construct query doc
        var userdoc = {
            username: data.username
        };
        
        // look for the user
        mongo.findDocument(userdoc, function (resp) {
            if (resp.length > 0) {
                bcrypt.hash(data.password, 5)
                    .then(function (hashed) {
                        bcrypt.compare(data.password, resp[0].password)
                            .then(function (resp1) {
                                if (resp1 === true) {
                                    res.json(resp[0]);
                                } else {
                                    res.json(userErr);
                                }
                            })
                            .catch(function(err) {
                                res.json(err);
                            })
                    .catch(function (err) {
                        res.json(err);
                    })
                });
            } else {
                res.json(userErr);
            }
        });
    }
});

/**
 *  get Saved content
 *
 *  request format:
 *
 *  {
 *      "_id": <idstr>,
 *      "keyword": <keyword>,
 *      "authenticated": <boolean>
 *  }
 *
 */
router.post("/get_saved_content/", function(req, res) {
    var data = req.body;
    var errStr = "Error - could not retreive content";
    var err;

    if (data._id === undefined || !data.authenticated || !data.keyword) {
        if(!data.authenticated) {
            err = { "Error": "unauthorized get request" }
        }
        else {
            console.log(data._id);
            console.log(data.authenticated);
            console.log(data.keyword);
            err = { "Error": "invalid data format" };
        }

        res.json(err);
        return;
    }

    var retDoc;
    var usrDoc;
    usrDoc = {
        _id: ObjectId(data._id)
    }
    
    mongo.findDocument(usrDoc, function(resp) {
        if (resp.length > 0) {
            if (data.keyword === "recent_searches") {
                res.json(resp[0].recentSearches ? resp[0].recentSearches : []);
            }
            else if (data.keyword === "saved_searches") {
                res.json(resp[0].savedSearches ? resp[0].savedSearches : []);
            }
            else if (data.keyword === "favorites") {
                res.json(resp[0].favorites ? resp[0].favorites : []);
            }
            else {
                res.json( { error: "invalid data request" } );
            }
        }
        else {
            err = { "Error": "Could not find user with given ID" }
            res.json(err);
        }
    })
});

/**
 *  Saved content
 *
 *  request format:
 *
 *  {
 *      "_id": <idstr>,
 *      "keyword": <keyword>,
 *      "content": <content>
 *  }
 *
 */
router.post("/update_saved_content/", function(req, res) {

    var data = req.body;
    var errStr = "Got error attempting to update saved content";
    var err;

    // error handling
    if ( data._id === undefined || data.keyword === undefined || data.content === undefined ) {
        err = { "Error": "invalid data format" };
        console.log (data._id);
        console.log(data.keyword);
        console.log(data.content);
        
        res.json( err );
        return;
    }

    // create the update document
    var updoc;
    if ( data.keyword == "saved_searches" ) {
        updoc = {
            $addToSet: {
                savedSearches: data.content
            }
        };
    } else if ( data.keyword == "recent_searches" ) {
        updoc = {
            $addToSet: {
                recentSearches: data.content
            }
        };
    } else if ( data.keyword == "favorites" ) {
        updoc = {
            $addToSet: {
                favorites: data.content
            }
        };
    } else if ( data.keyword == "update_password") {
        bcrypt.hash(data.content, 5)
            .then(function (hashed) {
                updoc.password = hashed;
            })
            .catch(function (err) {
                res.json(err);
                return;
            })

    } else {
        err = { "Error": "invalid data format. keyword is not recognized" };
        res.json(err);
        return;
    }

    // create the query doc
    var querydoc = {
        _id: ObjectId(data._id)
    };

    // push to mongo
    mongo.updateDocument( querydoc, updoc, function( resp ) {
        var resStr = JSON.stringify( resp, null, 2 );
        var resp = JSON.parse(resStr);

        if ( resp.lastErrorObject.updatedExisting == true ) {
            var obj = {
                keyword: data.keyword,
                doc: data._id
            };
            console.log(`Successfully updated:\n${ JSON.stringify( obj, null, 2 ) }`)
            res.json({
                result: resp.value
            });
        } else {
            res.json({
                result: resp.lastErrorObject
            });
        }
    });

});

/*
* Request body should only contain an id
*/
router.post("/neo4j/single_node/", function(req, res) {
    var data = req.body;

    var statement = qstrings.singleNode;
    var params = {};

    if (data.id !== undefined) {
        params.id = data.id;
    }
    console.log(statement);
    console.log(params);
    var q = neo4j.query(statement, params);
    q.response.then(function(resp) {
        console.log(JSON.stringify(resp));
        var field = resp.records[0]._fields[0];
        console.log(field);
        var retVal = {};
        if (field.labels[0] === "Edition") {
            console.log("edition");
            console.log(field.labels[0])
            console.log(field.properties);

            var isbn = [];
            if (field.properties.isbn){
                if (typeof(field.properties.isbn) === "string") {
                    isbn.push(field.properties.isbn);
                }
                else {
                    isbn = field.properties.isbn
                }
            }

            retVal = {
                id: field.identity.low ? field.identity.low : -1,
                title: field.properties.title ? field.properties.title : '',
                date: field.properties.date ? field.properties.date.low : -1,
                isbn: isbn
            }
        }
        else if (field.labels[0] === "Place") {
            console.log("Place");
            console.log(field.labels[0])
            console.log(field.properties);
            retVal = {
                id: field.identity.low ? field.identity.low : -1,
                name: field.properties.name ? field.properties.name : ''
            }
        }
        else if (field.labels[0] === "Person") {
            console.log("Person");
            console.log(field.labels[0])
            console.log(field.properties);
            retVal = {
                id: field.identity.low ? field.identity.low : -1,
                name: field.properties.name ? field.properties.name : ""
            }
        }
        else if (field.labels[0] === "Publisher") {
            console.log("Publisher");
            console.log(field.labels[0])
            console.log(field.properties);
            retVal = {
                id: field.identity.low ? field.identity.low : -1,
                name: field.properties.name ? field.properties.name : ''
            }
        }
        else {
            
        }
        
        res.json(retVal);
    })
    .catch(function (err) {
        console.log(err);
        res.json({error: "There was an error retrieving the id"});
    })
})


/** keyword query for neo4j
 *
 *  The request body should have the form:
 *
 *  {
 *    "advanced": "<bool>",
 *    "basic_query": "<string>",
 *    "terms": "<object>",
 *    "limit":   "<limit>"
 *  }
 *
 */
router.post("/neo4j/", function (req, res) {

    var data = req.body;
    
    // if data.basic_query is not a string with regular characters don't accept it
    var date = new Date().toISOString();
    console.log(`neo4j request at [${date}]\n`);
    
    var statement = qstrings.keywordSearch;
    var params = {};
    var errstr = "This process was rejected. Please double check that your input follows the correct form";

    if ( data.advanced === false ) {
        if ( typeof( data.basic_query ) === "string" ) {
            console.log("basic: ", data.basic_query);
            console.log("limit", data.limit);
            params.regex = `(?i).*${data.basic_query}.*`;
            params.limit = data.limit;

            var q = neo4j.query(statement, params);
            q.response.then(function (resp) {
                    console.log(resp);
                    var arr = [];
                    if (resp.records.length > 0) {
                        resp.records.forEach(record => {
                            var record = record._fields[0];
                            if (record) {
                                console.log(record.isbn);
                                arr.push({
                                    id: record.id ? record.id : '',
                                    isbn: record.isbn ? record.isbn : [],
                                    date: record.date ? record.date : '',
                                    title: record.title ? record.title : '',
                                    authors: record.authors ? record.authors : [],
                                    publishers: record.publishers ? record.publishers : [],
                                    places: record.places ? record.places : [],
                                    relationships: record.relationships ? record.relationships : []
                                });
                            }
                        })
                    }
                    res.json({
                        records: arr
                    });
                    console.log("neo4j request completed normally\n");
                })
                .catch(function (err) {
                    console.log(err);
                    console.log(errstr)
                    res.json({
                        "Message": errstr,
                        "Error": err
                    });
                    console.log(`neo4j request failed: ${JSON.stringify(err, null, 2)}\n`);
                });

            q.driver.close();
            q.session.close();

        } else {
            var err = "Input must be a well-formed string";
            res.json({
                "Message": errstr,
                "Error": err
            });
            console.log(`neo4j request failed: ${err}\n`);
        }
    }

    // Advanced Search
    else {
        var q = neo4j.advancedQuery(req.body);

        q.response.then(function (resp) {
            console.log(resp);
            var arr = [];
            if (resp.records.length > 0) {
                resp.records.forEach(record => {
                    var record = record._fields[0];
                    if (record) {
                        console.log(record.isbn);
                        arr.push({
                            id: record.id ? record.id : '',
                            isbn: record.isbn ? record.isbn : [],
                            date: record.date ? record.date : '',
                            title: record.title ? record.title : '',
                            authors: record.authors ? record.authors : [],
                            publishers: record.publishers ? record.publishers : [],
                            places: record.places ? record.places : [],
                            relationships: record.relationships ? record.relationships : []
                        });
                    }
                })
            }
            res.json({
                records: arr
            });
            console.log("neo4j request completed normally\n");
        })
            .catch(function (err) {
                console.log(err);
                console.log(errstr)
                res.json({
                    "Message": errstr,
                    "Error": err
                });
                console.log(`neo4j request failed: ${JSON.stringify(err, null, 2)}\n`);
        });
        
        q.driver.close();
        q.session.close();

    }
});


/* Save searches to a CSV
 * takes search results in JSON
 * puts them into csv by category
*/
router.post("/save_csv/", function(req, res) {
    // data from search
    var data = req.body;
    var fields = ["title", "isbn", "date", "id", "authors", "publishers"];
    var opts = {fields};

    try {
        // Creating parser and parsing to csv
        const parser = new json2csv(opts);
        const csv = parser.parse(data);
        console.log(csv);

        // Send created csv
        res.setHeader('Content-disposition', 'attachment; filename=testing.csv');
        res.status(200).send(csv);
    } catch (err) {
        console.error(err);
        res.json(err);
    }

});


// use bodyParser
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// all endpoints are prepended with '/api'
app.use('/api', router);

app.use(express.static("public/build/es6-bundled"));

app.get('*', function (req, res) {
    res.sendFile("public/build/es6-bundled/index.html", { root: '.' });
});

// Start the server instance
app.listen(port);