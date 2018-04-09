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
var mongo = require("./utils/mongoDriver.js");
var neo4j = require("./utils/neo4jDriver.js");
var qstrings = require("./utils/querystrings.js");
var ObjectId = require("mongodb").ObjectId;
var clock = require("./utils/clock.js");
var goodreadsDriver = require("./utils/goodreadsDriver.js");

var port = process.env.PORT || 8080;
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

// WIP :p
router.post("/get_saved_content/", function(req, res) {
    var data = req.body;
    var errStr = "Error - could not retreive content";
    var err;

    if (data._id === undefined || !data.authenticated) {
        if(!data.authenticated) {
            err = { "Error": "unauthorized get request" }
        }
        else {
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
            res.json(resp[0]);
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


/**
 * GoodReads search endpoint
 * 
 * TODO:
 *   + Add comment detailing how the request should be passed
 * 
 */
router.post("/goodreads/", function(req,res) {
    var data = req.body;
    if ( data.search === undefined) {
        err = { "Error": "invalid data format" };
        console.log( `${errStr}:\n${err}` );
        res.json( err );
        return;
    }

    console.log("Post: " + data);

    goodreadsDriver.goodReadSearch(data.search, function(jsArr) {
        var i = 1;
        jsArr.forEach(function(value) {
            console.log("\nSearch " + i + " \n" +JSON.stringify(value));
            i++;
        });

    });
    //goodreadsDriver.getBooks();
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

    var q = neo4j.query(statement, params);
    q.response.then(function(resp) {
        res.json(resp);
    })
    .catch(function (err) {
        res.json({error: "There was an error retrieving the id"});
    })
})

/* Temporary testing endpoint for putting together 
 * advanced search query strings
*/
router.post("/advanced_search/", function (req, res) {
    var data = req.body;

    console.log(`request:\n${JSON.stringify(data, null, 2)}\n`);

    var query = qstrings.optionalMatch;
    query += qstrings.relations;
    query += "WHERE";
    var before = false;

    // Authors
    if ( data.author != null ) {
        for ( var i = 0; i < data.author.length; i++ ) {
            var addAuthor = qstrings.advancedAuthor;
            if ( data.author[i].fname != null ) {
                addAuthor = addAuthor.replace('{ fname_re }', '\"(?i).*' + data.author[i].fname + '.*\"');
            }
            if ( data.author[i].lname != null ) {
                addAuthor = addAuthor.replace('{ lname_re }', '\"(?i).*' + data.author[i].lname + '.*\"');
            }
            query += addAuthor;
            if ( i+1 < data.author.length ) {
                query += "OR";
            }
        }
        before = true;
    }

    // Publishers
    if ( data.publisher != null ) {
        if ( before == true ) {
            query += "AND";
        }
        var addPublisher = qstrings.advancedPublisher;
        for ( var i = 0; i < data.publisher.length; i++ ) {
            query += qstrings.advancedPublisher;
            addPublisher = addPublisher.replace('{ name_re }', '\"(?i).*' + data.publisher[i].name + '.*\"');
            query += addPublisher;
            if ( i + 1 < data.publisher.length ) {
                query += "OR";
            }
        }
        before = true;
    }

    // Book
    if ( data.edition != null ) {
        if ( before == true ) {
            query += "AND";
        }
        var addBook = qstrings.advancedEdition;
        for ( var i = 0; i < data.edition.length; i++ ) {
            if ( data.edition[i].title != null ) {
                addBook = addBook.replace('{ title_re }', '\"(?i).*' + data.edition[i].title + '.*\"');
                addBook = addBook.replace('{ title_re }', '\"(?i).*' + data.edition[i].title + '.*\"');
            }
            if ( data.edition[i].year != null ) {
                addBook = addBook.replace('{ year_re }', '\"(?i).*' + data.edition[i].year + '.*\"');
            }
            query += addBook;
            if ( i+1 < data.edition.length ) {
                query += "OR";
            }
        }
    }

    // Place
    if ( data.place != null) {
        if ( before == true ) {
            query += "AND";
        }
        for ( var i = 0; i < data.place.length; i++ ) {
            var addPlace = qstrings.advancedPlace;
            addPlace = addPlace.replace('{ plcname_re }', '\"(?i).*' + data.place[i].name + '.*\"');
            query += addPlace;
            if ( i+1 < data.place.length ) {
                query += "OR";
            }
        }
    }
    

    query += qstrings.withCollectFirst;
    query += qstrings.unwindRecords;

    console.log(query +"\n\n");
    var statement = JSON.stringify(query, null, 2);
    
    res.json(query);
    
});


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
                                    id: record.id ? record.id.low : -1,
                                    isbn: record.isbn ? record.isbn : [],
                                    date: record.date ? record.date.low : '',
                                    title: record.title ? record.title : '',
                                    authors: record.authors ? record.authors : [],
                                    publishers: record.publishers ? record.publishers : []
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
});


/**
 * 
 * Not production ready, just useful for playing with GraphJSON right now.
 * May not ever be necessary...
 * 
 */
router.post("/neo4j/get_graph/", function (req, res) {
    var statement = qstrings.getGraphJSON;

    neo4j.query(statement, {})
        .then(function (resp) {

            var fields = resp.records[0]._fields
            var nodes = new Array();
            var edges = new Array();

            for (var i = 0; i < fields[0].length; i++) {
                nodes.push({
                    caption: ( fields[0][i].properties.title || fields[0][i].properties.name ),
                    type: fields[0][i].labels[0],
                    id: fields[0][i].identity.low
                });
            }

            for (var i = 0; i < fields[1].length; i++) {
                edges.push({
                    source: fields[1][i].start.low,
                    target: fields[1][i].end.low,
                    caption: fields[1][i].type
                })
            }

            var graphJSON = {
                nodes: nodes,
                edges: edges
            }

            res.json(graphJSON);
        })
        .catch(function (err) {
            res.json({"Error": `${JSON.stringify(err)}`});
        });
});

// use bodyParser
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// all endpoints are prepended with '/api'
app.use('/api', router);

app.use(express.static("public/"));

app.get('*', function (req, res) {
    res.sendFile("public/index.html", { root: '.' });
});

// add directories with the files we need

// Start the server instance
app.listen(port);
