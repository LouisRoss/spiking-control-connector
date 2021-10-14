const net = require('net');
const { query } = require('express');

const HandleGetModelDescriptor = require('./sockethandlers/handleGetModelDescriptor');
const HandleGetModelExpansion = require('./sockethandlers/handleGetModelExpansion');
const { strictEqual } = require('assert');


const HandleQuery = function(connection, buffer, configuration) {
  console.log(`Received request from client with ${buffer.length} bytes`);
  //console.log(buffer);

  const queryCommand = buffer.readInt32LE(4);
  console.log(`Query command: ${queryCommand}`);

  switch(queryCommand) {
    case 0:
      return HandleGetModelDescriptor(connection, buffer, configuration);

    case 1:
      return HandleGetModelExpansion(connection, buffer, configuration);

    default:
      console.log(`Unrecognized query command ${queryCommand}`);
      break;
  }

  // TODO - structure the response so that an error message can be recognized.
  const reason = 'Unrecognized query command ' + queryCommand;
  var reasonBuffer = Buffer.fromString(reason);

  const totalLength = reasonBuffer.length;  // + field2.length + field3.length + etc

  var bufferHeader = Buffer.alloc(4);
  bufferHeader.writeUInt32LE(totalLength);

  var messageBuffer = Buffer.concat([bufferHeader, reasonBuffer /*, field2, field3, etc*/], 4 + totalLength);
  connection.write(messageBuffer);
}


class PrivateSingleton {
  constructor() {
    this._buffer = null;
    this._bufferSize = 0;

    this.periodicStatusPoll = this.periodicStatusPoll.bind(this);
    setInterval(this.periodicStatusPoll, 1000);
  }

  periodicStatusPoll() {
  }

  Listen(port, configuration) {
    console.log(`listening on port ${port}`);
    var server = net.createServer(connection => {
      console.log('client connected');
      connection.on('end', function() {
        console.log('client disconnected');
      });

      // Collect incoming chunks and handle when query is completely received.
      connection.on('data', function (chunk) {
        if (this._buffer == null) {
          this._bufferSize = chunk.readInt32LE(0);
          //console.log(`Received first chunk of length ${chunk.length} containing buffer size ${this._bufferSize}`);
          this._buffer = Buffer.alloc(0);
        }

        this._buffer = Buffer.concat([this._buffer, chunk]);
        if (this._buffer.length >= this._bufferSize) {
          HandleQuery(connection, this._buffer, configuration);

          this._buffer = null;
          this._bufferSize = 0;
        }
      });
    });

    server.listen(port, () => {
      console.log('server bound');
    });
  }
}

class socketListener {
  constructor() {
    throw new Error('Use socketListener.getInstance()');
  }
  
  static getInstance() {
    if (!socketListener.instance) {
      socketListener.instance = new PrivateSingleton();
    }
    return socketListener.instance;
  }
}

module.exports = socketListener;
