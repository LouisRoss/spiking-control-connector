const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const cors = require("cors"); // enforce CORS, will be set to frontend URL when deployed
const { WebSocketServer } = require('ws');

const fs = require('fs');

const ConnectionManager = require('./spiking-control-connection');


let rawdata = fs.readFileSync('/configuration/configuration.json');
configuration = JSON.parse(rawdata);
console.log(configuration);

const wss = new WebSocketServer({ port: 5001 });

wss.on('connection', function connection(ws, req) {
  console.log(`WebSocket Connected`);
  ws.on('message', function incoming(message) {
    console.log(`received spurious webSocket message ${message}`);
  });
});

wss.on('close', function close() {
  console.log('WebSocket closed');
});



class engineConnectionRepository {
  constructor() {
    throw new Error('Use engineConnectionRepository.getInstance()');
  }
  
  static getInstance() {
    if (!engineConnectionRepository.instance) {
      engineConnectionRepository.instance = new Map();
    }
    return engineConnectionRepository.instance;
  }
}



function GetOrMakeConnection(engine) {
  const engines = engineConnectionRepository.getInstance();

  var engineConnection = null;
  if (engines.has(engine)) {
    console.log(`Using existing connection for engine '${engine}'`)
    engineConnection = engines.get(engine);
  } else {
    console.log(`Making new connection for engine '${engine}'`)
    engineConnection = new ConnectionManager(engine, wss);
    engines.set(engine, engineConnection);

    engineConnection.attemptConnection();
  }

  return engineConnection;
}

const app = express();
app.use(cors());

const router = express.Router();

// Get the list of models that currently exist.
router.get('/engine/:engine/status', (req, res) => {
  const { engine } = req.params;
  const connection = GetOrMakeConnection(engine);

  console.log(`Handling status request for engine ${engine}`);
  res.json(connection.handleStatusRequest());
});

router.get('/engine/:engine/fullstatus', (req, res) => {
  const { engine } = req.params;
  const connection = GetOrMakeConnection(engine);

  console.log(`Full status request for engine ${engine}`);
  connection.handleFullStatusRequest(data => {
    res.json(data);
  });
});


// Accept the URL parameter engine, and create a connection to it.
router.post('/engine/:engine/connection', (req, res) => {
  const { engine } = req.params;
  const connection = GetOrMakeConnection(engine);

  console.log('POST with connection request');
  //console.log(req);
  connection.RunWhenConnected(() =>{
    const result = connection.handleConnectionRequest(req);
    console.log(result);
    res.json(result);
  });
});

// Accept the URL parameter engine, and set the selected engine.
router.post('/engine/:engine/select', (req, res) => {
  const { engine } = req.params;

  for (let [engineName, connection] of engineConnectionRepository.getInstance()) {
    connection.setSelectedEngine(engineName === engine);
  }

  res.json(JSON.stringify({"result":"ok"}));
});

router.post('/engine/:engine/passthrough', (req, res) => {
  const { engine } = req.params;
  const connection = GetOrMakeConnection(engine);

  console.log('POST with passthrough request');
  connection.RunWhenConnected(() =>{
    connection.handlePassthroughRequest(req, data => {
      res.json(data);
    });
  });
});

// Accept the model name, and expand it.
//router.put('/package/:modelName', [putPackage]);

// Accept the URL parameter modelName, and delete the specified model.
//router.delete('/model/:modelName', [deleteModel]);


var server = http.createServer(app);
const PORT = 5000;
app.use(bodyParser.json());
app.use('/', router);
app.use(express.static('public'));

server.listen(PORT, () => console.log(`Server running on port http://spiking-control-connector:${PORT}`));
