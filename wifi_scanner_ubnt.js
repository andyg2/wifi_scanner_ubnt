var request = require('request');
var WebSocketClient = require('websocket').client;

var scannerHostname = "192.168.1.20"
var user = "ubnt";
var password = "ubnt";

var cookieCheckerUrl = "https://" + scannerHostname + "/cookiechecker?uri=/";
var loginUrl = "https://" + scannerHostname + "/login.cgi";
var dataUrl = "wss://" + scannerHostname + "/airview";

var fiveJeeChannels = [
	{id : 36, frequency : 5180},
	{id : 38, frequency : 5190},
	{id : 40, frequency : 5200},
	{id : 42, frequency : 5210},
	{id : 44, frequency : 5220},
	{id : 46, frequency : 5230},
	{id : 48, frequency : 5240},
	{id : 50, frequency : 5250},
	{id : 52, frequency : 5260},
	{id : 54, frequency : 5270},
	{id : 56, frequency : 5280},
	{id : 58, frequency : 5290},
	{id : 60, frequency : 5300},
	{id : 62, frequency : 5310},
	{id : 64, frequency : 5320},
	{id : 100, frequency : 5500},
	{id : 102, frequency : 5510},
	{id : 104, frequency : 5520},
	{id : 106, frequency : 5530},
	{id : 108, frequency : 5540},
	{id : 110, frequency : 5550},
	{id : 112, frequency : 5560},
	{id : 114, frequency : 5570},
	{id : 116, frequency : 5580},
	{id : 118, frequency : 5590},
	{id : 120, frequency : 5600},
	{id : 122, frequency : 5610},
	{id : 124, frequency : 5620},
	{id : 126, frequency : 5630},
	{id : 128, frequency : 5640},
	{id : 132, frequency : 5660},
	{id : 134, frequency : 5670},
	{id : 136, frequency : 5680},
	{id : 138, frequency : 5690},
	{id : 140, frequency : 5700},
	{id : 142, frequency : 5710},
	{id : 144, frequency : 5720},
	{id : 149, frequency : 5745},
	{id : 151, frequency : 5755},
	{id : 153, frequency : 5765},
	{id : 155, frequency : 5775},
	{id : 157, frequency : 5785},
	{id : 159, frequency : 5795},
	{id : 161, frequency : 5805},
	{id : 165, frequency : 5825}
];

var frequencyIdCache = {};

function getFrequencyId(ubntFrequency) {
	//e.g. 56056250 => 5606
	var frequency = Math.round(ubntFrequency / 10000);
	
	var closestChannel = fiveJeeChannels.reduce(function(a, b) {
		return Math.abs(a.frequency - frequency) < Math.abs(b.frequency - frequency) ?
				a : b;
	}, Number.MAX_SAFE_INTEGER);
	
	return closestChannel.id + " (" + ubntFrequency + ")";
}

function login() {
	var parseAirosCookie = function(cookies) {
		var filtered = cookies.filter(function(cookie) {
			return cookie.startsWith("AIROS_");
		}).map(function(cookie) {
			return cookie.split(";").shift();
		});
		
		return filtered.join("; ") + ";";
	};
	
	var doLogin = function(cookie) {
		var loginRequestOptions = {
			form: {username : user, password : password},
			headers: {
				"Cookie" : cookie
			},
			rejectUnauthorized : false
		};

		request.post(loginUrl, loginRequestOptions, function (error, response, body) {
			if(response.statusCode != 302) {
				//we were expecting to be redirected to the index page on success
				console.log("Login Failed");
				process.exit(1);
			}
			
			scan(cookie);
		});
	};
	
	var doCookieCheck = function() {
		var requestOptions = {
				rejectUnauthorized : false
			};
		
		request.get(cookieCheckerUrl, requestOptions, function (error, response, body) {
			if(error) {
				console.log("Failed to Do Cookie Check: " + error.toString());
				process.exit(1);
			}
			
			var cookie = parseAirosCookie(response.headers["set-cookie"]);
			doLogin(cookie);
		});
	};
	
	doCookieCheck();
};

function printData(data) {
	var labels = data["stFreqGridLabels"];
	var latestPower = data["latestPower"];
	
	latestPower.forEach(function(point, i) {
		if(point > 20) {
			console.log("Activity on " + getFrequencyId(labels[i]) + ": " + point);
		}
	});
};

function updateAndAttemptToParseMessage(latestMessage, priorMessages) {
	if(priorMessages.length == 0) {
		if(! latestMessage.startsWith("{")) {
			console.log("Latest Message Does Not Appear to be Start of a New Object -- Dropping: " + latestMessage);
			return;
		}
	}
			
	priorMessages.push(latestMessage);
	
	try {
		var joined = priorMessages.reduce(function(a, b) {
			return a + b;
		}, "");

		var ret = JSON.parse(joined);
		
		priorMessages.splice(0, priorMessages.length);
		
		return ret;
	}
	catch(e) {
		if(priorMessages.length > 5) {
			console.log("Trimming Prior Messages -- Too Many: " + priorMessages.join());
			priorMessages.splice(0, priorMessages.length);
		}
		
		return null;
	}
}

var scan = function(cookie) {
	var clientOptions = {
			tlsOptions : {rejectUnauthorized : false}
	};
	
	var errorOrClose = function(e) {
		if(e) {
			console.log("Closing from Error: " + e);
		}
		
		process.exit(1);
	};
	
	// Data arrives across multiple messages, we'll need to collect 
	// and detect when the full JSON object has arrived.
	var priorMessages = [];
	
	var client = new WebSocketClient(clientOptions);
	 
	client.on('connectFailed', function(error) {
		errorOrClose('Web Socket Connect Error: ' + error.toString());
	});
	 
	client.on('connect', function(connection) {
	    console.log('WebSocket Client Connected');
	    
	    connection.on('error', function(error) {
	    	errorOrClose("Connection Error: " + error.toString());
	    });
	    connection.on('close', function() {
	    	errorOrClose('WebSocket Connection Closed');
	    });
	    connection.on('message', function(message) {
	    	var parsedMessage = updateAndAttemptToParseMessage(message.utf8Data, priorMessages);
	    	if(parsedMessage) {
	    		printData(parsedMessage);
	    	}
	    });
	    
	    function sendNumber() {
	        if (connection.connected) {
	            var number = Math.round(Math.random() * 0xFFFFFF);
	            connection.sendUTF(number.toString());
	            setTimeout(sendNumber, 1000);
	        }
	    }
	    sendNumber();
	});
		
	var requestedProtocols = null;
	var origin = null;
	var headers = {
			"Cookie" : cookie,
			"Origin" : "WifiScanner"
	};
	var connectOptions = null;
	
	client.connect(dataUrl, requestedProtocols, origin, headers, connectOptions);
};

login();
