const net = require('net');

client = null;

cpuhistory = [];
for (var i = 0; i < 200; i++) {
  cpuhistory[i] = 0;
}

status = { connected: false };


class PrivateSingleton {
  constructor() {
    this.passthroughCallback = null;
    this.periodicStatusPoll = this.periodicStatusPoll.bind(this);
    setInterval(this.periodicStatusPoll, 1000);
  }

  periodicStatusPoll() {
    if (typeof status.run === 'undefined' || typeof status.loglevel === 'undefined' || typeof status.engineperiod === 'undefined') {
      this.fullStatusPoll();    
    }
    else {
      this.dynamicStatusPoll();    
    }
  }

  dynamicStatusPoll() {
    if (client) {
      console.log('Polling for dynamic status');
      client.write(JSON.stringify({ query: "dynamicstatus" }));
    }
  }

  getConfigurations() {
    if (client) {
      console.log('Getting configurations');
      client.write(JSON.stringify({ query: "configurations" }));
    }
  }

  fullStatusPoll() {
    if (client) {
      console.log('Polling for full status');
      client.write(JSON.stringify({ query: "fullstatus" }));
    }
  }

  isConnected() {
    return client != null;
  }

  disconnect() {
    if (this.isConnected()) {
      status.connected = false;
      client.destroy();
      client = null;

      return true;
    }

    return false;
  }

  getStatus() {
    //console.log(`Getting current status: ${JSON.stringify(status)}`);
    return status;
  }

  passthrough(query, callback) {
    if (client == null) {
      console.log('Attempt to send passthrough to unconnected model engine');
      return false;
    }

    this.passthroughCallback = callback;
    console.log(`Sending passthrough command ${query.query}`);
    client.write(JSON.stringify(query));

    return true;
  }

  attemptConnection(hostName)
  {
    if (this.isConnected()) {
      return false;
    }

    console.log(`Attempting connection with http://${hostName}:8000`);
    var option = {port:8000, host:hostName};
    client = net.createConnection(option, function () {
      status.connected = true;
      console.log('Connection local address : ' + client.localAddress + ":" + client.localPort);
      console.log('Connection remote address : ' + client.remoteAddress + ":" + client.remotePort);
    });

    return this.setupClient();
  }
  
  setupClient() {
    client.setTimeout(10000);
    client.setEncoding('utf8');
  
    // When receive server send back data.
    client.on('data',  (data) => this.handleModelResponses(data));

    // When connection disconnected.
    client.on('end', () => {
        console.log('Client socket disconnect. ');
        this.disconnect();
    });

    client.on('timeout', () => {
        console.log('Client connection timeout. ');
        this.disconnect();
    });

    client.on('error', (err) => {
        console.error(JSON.stringify(err));
        this.disconnect();
    });

    return true;
  }

  handleModelResponses(data) {
    if (data) {
      status.connected = true;
      var fullResponse = JSON.stringify(data).trim();
      if (fullResponse && fullResponse.length > 0) {
        console.log('Server return data : ' + fullResponse);

        var response = JSON.parse(data);
        this.parseModelResponses(response);
      }
    }
  }

  parseModelResponses(response) {
    if (response.response.result && response.response.result != 'ok') {
      status = { ...status, error: response.response.error, errordetail: response.response.errordetail};
      //status[error] = response.response.error;
      //status[errordetail] = response.response.errordetail;
    }
    else if (response.response.result && response.response.result == 'ok' && response.query) {
      if (response.query.query == 'fullstatus' || response.query.query == 'dynamicstatus') {
        status = { ...status, ...response.response.status, error: null, errordetail: null };
        if (response.response.status.cpu) {
          for (var i = 0; i < 199; i++) {
            cpuhistory[i] = cpuhistory[i + 1];
            cpuhistory[199] = Number(response.response.status.cpu.toFixed(2));
          }
        }
        status.cpuhistory = cpuhistory;
        console.log('Capturing Status: ' + JSON.stringify(status));
      }
      else if (response.query.query == 'control') {
        if (response.response.status) {
          status = { ...status, ...response.response.status };
        }
        status.error = null;
        status.errordetail = null;
        console.log('Received control response, returning' + JSON.stringify(response.response));
        if (this.passthroughCallback) {
          this.passthroughCallback(response.response);
          this.passthroughCallback = null;
        }
      }
      else if (response.query.query == 'configurations') {
        status.error = null;
        status.errordetail = null;
        console.log('Received configurations response, returning' + JSON.stringify(response.response));
        if (this.passthroughCallback) {
          this.passthroughCallback(response.response);
          this.passthroughCallback = null;
        }
      }
    }
  }
}

class statusPoller {
  constructor() {
    throw new Error('Use statusPoller.getInstance()');
  }
  
  static getInstance() {
    if (!statusPoller.instance) {
      statusPoller.instance = new PrivateSingleton();
    }
    return statusPoller.instance;
  }
}

module.exports = statusPoller;
