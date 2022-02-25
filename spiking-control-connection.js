const net = require('net');
const fs = require('fs');

let rawdata = fs.readFileSync('/configuration/settings.json');
const settings = JSON.parse(rawdata);

class ConnectionManager {
  constructor(engineName, wss) {
    this.engineName = engineName;
    this.isSelectedEngine = false;
    this.wsServer = wss;
    this.hostName = engineName;
    settings.engines.forEach(e => { if (e.name === engineName) { this.hostName = e.host; } });
    this.client = null;
    this.shouldConnect = true;
    this.connectionStatus = { connected: false };
    this.cpuhistory = new Array(200).fill(0);
    this.passthroughCallback = null;
    this.socketResponse = '';
    this._buffer = null;
    this._bufferSize = 0;

    this.periodicStatusPoll = this.periodicReconnect.bind(this);
    setInterval(this.periodicReconnect, 1000);
  }
  
  periodicReconnect() {
    if (this.shouldConnect && !this.isConnected()) {
      this.attemptConnection();
    }
  }

  dynamicStatusPoll() {
    if (this.client) {
      console.log('Polling for dynamic status');
      this.client.write(JSON.stringify({ query: "dynamicstatus" }));
    }
  }

  fullStatusPoll() {
    if (this.client) {
      console.log('Polling for full status');
      this.client.write(JSON.stringify({ query: "fullstatus" }));
    }
  }

  setSelectedEngine(selected) {
    this.isSelectedEngine = selected;
  }

  isConnected() {
    return this.client !== null;
  }

  getStatus() {
    return this.connectionStatus;
  }


  // Client-initiated queries.
  RunWhenConnected(callback) {
    if (this.isConnected()) {
      callback();
    } else {
      console.log('RunWhenConnected attempting connection before callback');
      this.shouldConnect = true;
      this.attemptConnection(callback);
    }
  };

  handleConnectionRequest(req) {
    if (req && req.body.query) {
      console.log(`Got /connection with request ${req.body.query}`);
      if (req.body.query == 'connect') {
        console.log("Got /connection request 'connect'");
        this.shouldConnect = true;
        var success = this.attemptConnection();

        return {query:req.body, response:{result:(success ? 'Connecting' : "Connected")}};
      }
      else if (req.body.query == 'disconnect') {
        console.log("Got /connection request 'disconnect'");
        this.shouldConnect = false;
        var success = this.disconnect();
        return {query:req.body, response:{result:(success ? 'Disconnecting' : "Disconnected")}};
      }
      else {
        console.log(`Unrecognized connection request ${req.body.request}`);
        return {query:req.body, response:{result:'fail', error:'bad request', errordetail:`Unrecognized connection query ${req.query}`}};
      }
    }

    return {query:req.body, response:{result:'fail', error:'bad request', errordetail:"Invalid request format"}};
  }

  handleFullStatusRequest(callback) {
    this.fullStatusPoll();
    this.passthroughCallback = callback;
  }

  handleStatusRequest( ) {
    var status = this.getStatus();
    return {query:{query:'dynamicstatus'}, response:{result:'ok', status:status}};
  }

  handlePassthroughRequest(req, callback) {
    if (req && req.body) {
      if (this.isConnected()) {
        this.passthroughCallback = callback;
        console.log(`Sending passthrough command ${JSON.stringify(req.body)}`);
        this.client.write(JSON.stringify(req.body));
      } else {
        console.log('Passthrough command failed');
        callback({query:req.body, response:{result:'fail', error:'passthrough fail', errordetail:`Unable to complete passthrough request ${req.body}`}});
      }

      return this.isConnected();
    }

    callback({query:req, response:{result:'fail', error:'passthrough fail', errordetail:"Invalid request format"}});
    return false;
  }

  // Internal connection plumbing.
  attemptConnection(callback = null)
  {
    if (!this.shouldConnect || this.isConnected()) {
      return false;
    }

    console.log(`Attempting connection with engine at ${this.hostName}:8000`);
    var option = {port:8000, host:this.hostName};
    this.client = net.createConnection(option, () => {
      this.connectionStatus.connected = true;
      console.log('Connection local address : ' + this.client.localAddress + ":" + this.client.localPort);
      console.log('Connection remote address : ' + this.client.remoteAddress + ":" + this.client.remotePort);

      if (callback) {
        callback();
      }
    });

    return this.setupClient();
  }

  disconnect() {
    if (this.isConnected()) {
      this.connectionStatus.connected = false;
      this.client.destroy();
      this.client = null;

      return true;
    }

    return false;
  }

  setupClient() {
    this.client.setTimeout(10000);
  
    // When receive server send back data.
    this.client.on('data', chunk => this.handleModelResponses(chunk));

    // When connection disconnected.
    this.client.on('end', () => {
        console.log('Client socket disconnect. ');
        this.disconnect();
    });

    this.client.on('timeout', () => {
        console.log('Client connection timeout. ');
        this.disconnect();
    });

    this.client.on('error', (err) => {
        console.error(JSON.stringify(err));
        this.disconnect();
    });

    return true;
  }

  handleModelResponses(chunk) {
    if (this._buffer == null) {
      this._bufferSize = chunk.readUIntLE(0, 2);
      this._buffer = Buffer.alloc(chunk.length - 2);
      chunk.copy(this._buffer, 0, 2);
      chunk = Buffer.alloc(0);
    }

    this._buffer = Buffer.concat([this._buffer, chunk]);
    if (this._buffer.length >= this._bufferSize) {
      this.socketResponse += this._buffer.toString('utf-8');
      this.connectionStatus.connected = true;

      var response = null;
      try {
        response = JSON.parse(this.socketResponse);
      } catch (exception) {
        console.log('Error parsing engine command-control response: ' + exception.message);
      }

      this.socketResponse = '';
      this.parseModelResponses(response);
  
      this._buffer = null;
      this._bufferSize = 0;
    }
  }

  parseModelResponses(response) {
    if (response.response.result && response.response.result != 'ok') {
      this.connectionStatus = { ...this.connectionStatus, error: response.response.error, errordetail: response.response.errordetail};
      //status[error] = response.response.error;
      //status[errordetail] = response.response.errordetail;
    }
    else if (response.response.result && response.response.result == 'ok' && response.query) {
      this.connectionStatus.error = null;
      this.connectionStatus.errordetail = null;

      if (response.query.query == 'fullstatus' || response.query.query == 'dynamicstatus') {
        if (response.response.status.cpu) {
          for (var i = 0; i < 199; i++) {
            this.cpuhistory[i] = this.cpuhistory[i + 1];
            this.cpuhistory[199] = Number(response.response.status.cpu.toFixed(2));
          }
        }
        this.connectionStatus.cpuhistory = this.cpuhistory;
      }

      if (response.response.status) {
        this.connectionStatus = { ...this.connectionStatus, ...response.response.status };
        ///console.log(`Capturing Status: (selected = ${this.isSelectedEngine})` + JSON.stringify(this.connectionStatus));

        if (this.isSelectedEngine) {
          this.wsServer.clients.forEach( client => {
            client.send(JSON.stringify(this.connectionStatus));
          });
        };
      };
    }

    ///console.log('Received passthrough response, returning ' + JSON.stringify(response.response));
    if (this.passthroughCallback !== null) {
      this.passthroughCallback(response.response);
      this.passthroughCallback = null;
      console.log('Engine return data : ' + JSON.stringify(response.response));
    }
  }
}

module.exports = ConnectionManager;
