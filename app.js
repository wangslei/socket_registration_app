var app = require('http').createServer(handler)
  , io = require('socket.io').listen(app)
  , fs = require('fs')
  , redis = require("redis")


app.listen(3000);

/** 
 * Our redis client which subscribes to channels for updates
 */
redisClient = redis.createClient();

//look for connection errors and log
redisClient.on("error", function (err) {
    console.log("error event - " + redisClient.host + ":" + redisClient.port + " - " + err);
});

/**
 * Dummy redis client which publishes new updates to redis 
 */
redisPublishClient = redis.createClient();

//I use this client to perform non-pubsub operations on redis
redisRegClient = redis.createClient();

/**
 * http handler, currently just sends index.html on new connection
 */
function handler (req, res) {
  fs.readFile(__dirname + '/views/index.html',
  function (err, data) {
    if (err) {
      res.writeHead(500);
      return res.end('Error loading index.html' + __dirname);
    }

    res.writeHead(200);
    res.end(data);
  });
}

/** 
 * set socket.io log level to warn
 *
 * uncomment below line to change debug level
 * 0-error, 1-warn, 2-info, 3-debug 
 *
 * For more options refer https://github.com/LearnBoost/Socket.IO/wiki/Configuring-Socket.IO
 */
//io.set('log level', 3);

/**
 * socket io client, which listens for new websocket connection
 * and then handles various requests
 */
io.sockets.on('connection', function (socket) {
  
  //on connect send a welcome message
  //socket.emit('message', { text : 'Welcome Wang!' });

  //on subscription request joins specified room
  //later messages are broadcasted on the rooms
  socket.on('subscribe', function (data) {
    socket.join(data.channel);
  });

  //listen for something to be posted on 'clientinfo'
  socket.on('clientinfo', function (data) {
    //the data here should be postData from the client side
    var action = data.action;

    switch (action) {
        case 'addattendee':
            addattendee(data);
            getlist(data);
            break;
        case 'getlist':
            getlist(data);
            break;
        case 'removeattendee':
            removeattendee(data);
            getlist(data);
            break;
        case 'editattendee':
            editattendee(data);
            getlist(data.original);
            break;
        case 'getemails':
            getemails(data);
            break;
    }

    function addattendee(data) {
        var event = data.event;
        var name = data.name;
        var email = data.email;
        var company = data.company;
        
        if(name==undefined || email==undefined) {
            socket.emit('serverstatus', { status: 'Name or email is undefined' });
            redisPublishClient.publish('serverstatus', 'Name or email is undefined');
        }
        else {
            redisRegClient.sismember(event+":names",name,function (err,res) {
                //checking to see if the name already exists in the events:names index
                if (res==0) {
                    //checking to see if the email already exists in the events:email index
                    redisRegClient.sismember(event+":emails",email, function(err,res) {
                        if(res==0) {
                            redisRegClient.incr(event);
                            redisRegClient.get(event, function(err,res) {
                                var curID=res;      //the current ID is simply the current count at the EVENT key
                                redisRegClient.hmset(event+":attendee:"+curID, {"name": name, "email": email, "company": company}, function(err, res) {
                                    console.log('added hash');
                                });
                                redisRegClient.sadd(event+":names",name);
                                redisRegClient.sadd(event+":emails",email);
                                redisRegClient.set(event+":name:"+name,curID);
                                redisRegClient.set(event+":email:"+email,curID);
                            });
                            // resjson[0]="Attendee added!";
                            // json(response,resjson);
                            socket.emit('serverstatus', { status: 'Attendee added' });
                            redisPublishClient.publish('serverstatus', 'something good');
                        }
                        else {
                            socket.emit('serverstatus', { status: 'Email already registered' });
                            redisPublishClient.publish('serverstatus', 'something bad');
                        }
                    });
                }
                else {
                    socket.emit('serverstatus', { status: 'Name already registered' });
                    redisPublishClient.publish('serverstatus', 'something bad');
                }
            });
        }
    }
    function getlist(data) {
        var event = data.event;
        var count=0;
        var resjson={};
        
        redisRegClient.get(event,function(err,res) {
            if(res==0) {
                console.log("empty list");
                response.end();
            }
            else {
                for (i=1; i<=res; i++) {
                    (function(i) {
                        redisRegClient.hgetall(event+":attendee:"+i.toString(),function(err,data){
                            if(data != null) {
                                count=count+1;
                                resjson[count]=data;
                            }
                            if(i==res)
                                socket.emit('attendeeinfo',resjson);
                                redisPublishClient.publish('attendeeinfo', JSON.stringify(resjson));
                        });
                    })(i);
                }
            }
        });
    }
    function getemails(data) {
        var event = data.event;

        redisRegClient.get(event,function(err,res) {
            if(res!=0) {
                redisRegClient.smembers(event+":emails", function(err,res){
                    socket.emit('emailinfo',res);
                });
            }
        });
        
    }
    function removeattendee(data) {
        var event = data.event;
        var name = data.name;
        var email = data.email;
        var company = data.company;
        var delid=-1;
        
        redisRegClient.get(event+":name:"+name, function (err,res) {
            delid=res;
            if(delid!=-1) {
                (function() {
                    redisRegClient.del(event+":attendee:"+delid);
                    redisRegClient.srem(event+":names",name);
                    redisRegClient.srem(event+":emails",email);
                    redisRegClient.del(event+":name:"+name);
                    redisRegClient.del(event+":email:"+email);
                })();
                getlist(data);
            }
        });
    }
    function editattendee(data) {
        var whattochange = data.whattochange;
        var oldevent = data.original.event;
        var oldname = data.original.name;
        var oldemail = data.original.email;
        var oldcompany = data.original.company;
        var newevent = data.edited.event;
        var newname = data.edited.name;
        var newemail = data.edited.email;
        var newcompany = data.edited.company;
        var editid=-1;

        if(whattochange=='everything') {
            addattendee(data.edited);
            removeattendee(data.original);
        }
        else if(whattochange=='nameemail') {
            //logic is a bit muddled due to asynchronous callback return structure of node-redis
            redisRegClient.get(oldevent+":name:"+oldname, function (err,res) {
                editid=res;
                if(editid!=-1) {
                    redisRegClient.sismember(oldevent+":names",newname,function (err,res) {
                        if (res==0 || (newname==oldname)) {
                            redisRegClient.sismember(oldevent+":emails",newemail, function(err,res) {
                                if(res==0 || (newemail==oldemail)) {
                                    (function() {
                                        redisRegClient.hmset(oldevent+":attendee:"+editid.toString(),{"name": newname, "email": newemail, "company": newcompany}, function(err,res){
                                            console.log("edited hash");
                                        });
                                        redisRegClient.srem(oldevent+":names",oldname);
                                        redisRegClient.srem(oldevent+":emails",oldemail);
                                        redisRegClient.sadd(oldevent+":names",newname);
                                        redisRegClient.sadd(oldevent+":emails",newemail);
                                        redisRegClient.del(oldevent+":name:"+oldname);
                                        redisRegClient.del(oldevent+":email:"+oldemail);
                                        redisRegClient.set(oldevent+":name:"+newname,editid);
                                        redisRegClient.set(oldevent+":email:"+newemail,editid);
                                    })();
                                    redisPublishClient.publish('serverstatus', "Attendee edited.");
                                    socket.emit('serverstatus', { status: 'Attendee edited.' });
                                    //json(response,{0: "Attendee edited."});
                                }
                                else
                                    redisPublishClient.publish('serverstatus', "not allowed to edit (email already exists)");
                                    //json(response,{0: "not allowed to edit (email already exists)"});
                            });
                        }
                        else
                            redisPublishClient.publish('serverstatus', "not allowed to edit (name already exists)");
                            //json(response,{0: "not allowed to edit (name already exists)"});
                    });
                }
            });
        }
        else if(whattochange=='company') {
            redisRegClient.get(oldevent+":name:"+oldname, function (err,res) {
                editid=res;
                if(editid!=-1) {
                    redisRegClient.hmset(oldevent+":attendee:"+editid.toString(),{"company": newcompany}, function(err,res){
                        // json(response,{0: "edited company"});
                        redisPublishClient.publish('serverstatus', "edited company");
                    });
                }
            });
        }
    }
  });
});

var json = function(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  if(typeof data === "string") res.write(data);
  else res.write(JSON.stringify(data));
  res.end();
};

/**
 * subscribe to redis channels when client in ready
 */
redisClient.on('ready', function() {
  //redisClient.subscribe('notification');
  redisClient.subscribe('clientinfo');
});

/**
 * wait for messages from redis channel, on message
 * send updates on the rooms named after channels. 
 * 
 * This sends updates to users. 
 */
redisClient.on("message", function(channel, message){
    var resp = {'text': message, 'channel':channel}
    //io.sockets.in(channel).emit('message', resp);
});

/**
 * Simulates publish to redis channels
 * Currently it publishes updates to redis every 5 seconds.
 */
// setInterval(function() {
//   var no = Math.floor(Math.random() * 100);
//   redisPublishClient.publish('notification', 'Generated random no ' + no);
// }, 10000);