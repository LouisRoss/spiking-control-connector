const axios = require('axios');

// Query handlers are called after the first eight bytes of the buffer have been parsed.
//
const HandleGetModelExpansion = function(connection, buffer, configuration) {
  console.log('Handling GetModelExpansion command');

  const sequence = buffer.readUint32LE(8);

  var firstNull = buffer.indexOf(0x00, 12);
  if (firstNull == -1) {
    firstNull = buffer.length;
  }
  const modelName = buffer.toString(undefined, 12, firstNull);
  console.log(`Model name: '${modelName}', sequence ${sequence}`);

  const packagerConfig = configuration['services']['modelPackager'];
  const packagerHost = packagerConfig.host;
  const packagerPort = packagerConfig.port;

  console.log('Getting from ' + packagerHost + ':' + packagerPort + '/model/' + modelName + '/expansion/' + sequence);
  axios.get(packagerHost + ':' + packagerPort + '/model/' + modelName + '/expansion/' + sequence)
  .then(data => {
    console.log(`Received ${data.data.value.length} connections in expansion ${sequence}`);
    const expansionCount = data.data.value.length;

    var totalLength = 0;
    var startingNeuronBuffer = Buffer.alloc(4);
    startingNeuronBuffer.writeUInt32LE(data.data.startingindex);
    totalLength += 4;

    var neuronCountBuffer = Buffer.alloc(4);
    neuronCountBuffer.writeUInt32LE(data.data.totalcount);
    totalLength += 4;

    var connectionCountBuffer = Buffer.alloc(4);
    connectionCountBuffer.writeUInt32LE(expansionCount);
    totalLength += 4;

    var expansionBuffers = [];
    data.data.value.forEach(connection => {
      var connectionBuffer = Buffer.alloc(12);
      connectionBuffer.writeUInt32LE(connection[0], 0);
      connectionBuffer.writeUInt32LE(connection[1], 4);
      connectionBuffer.writeUInt32LE(Math.round(connection[2] * 100), 8);
      totalLength += 12;

      expansionBuffers.push(connectionBuffer);
    });

    var bufferHeader = Buffer.alloc(4);
    bufferHeader.writeUInt32LE(totalLength);

    console.log(`Sending expansion reply with  ${expansionBuffers.length} connections`);
    var messageBuffer = Buffer.concat([bufferHeader, startingNeuronBuffer, neuronCountBuffer, connectionCountBuffer, ...expansionBuffers], 4 + totalLength);
    //console.log(`Sending reply of ${messageBuffer.length}`);
    //console.log(messageBuffer);

    connection.write(messageBuffer);
    //connection.write(JSON.stringify(data.data));
  })
  .catch(error => {
    console.log(`Error ${error}`);
    
    var disconnectedResponse = {response:{result:'ok', status: { connected: false, error: error }}};
    connection.write(`Error ${error}`);
  });
}

module.exports = HandleGetModelExpansion;
