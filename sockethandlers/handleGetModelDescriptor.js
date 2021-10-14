const axios = require('axios');

// Query handlers are called after the first eight bytes of the buffer have been parsed.
//
const HandleGetModelDescriptor = function(connection, buffer, configuration) {
  console.log('Handling GetModelDescriptor command');

  var firstNull = buffer.indexOf(0x00, 8);
  if (firstNull == -1) {
    firstNull = buffer.length;
  }
  const modelName = buffer.toString(undefined, 8, firstNull);
  console.log(`Model name: '${modelName}'`);

  const packagerConfig = configuration['services']['modelPackager'];
  const packagerHost = packagerConfig.host;
  const packagerPort = packagerConfig.port;

  axios.get(packagerHost + ':' + packagerPort + '/model/' + modelName + '/population')
  .then(data => {
    console.log(data.data);
    const neuronCount = data.data.neuroncount;
    const expansionCount = data.data.templates.length;

    var neuronCountBuffer = Buffer.alloc(4);
    neuronCountBuffer.writeUInt32LE(neuronCount);

    var expansionCountBuffer = Buffer.alloc(4);
    expansionCountBuffer.writeUInt32LE(expansionCount);

    const totalLength = neuronCountBuffer.length + expansionCountBuffer.length;  // + field3.length + etc

    var bufferHeader = Buffer.alloc(4);
    bufferHeader.writeUInt32LE(totalLength);

    console.log(`Sending reply with neuronCount = ${neuronCount} and expansionsCount = ${expansionCount}`);
    var messageBuffer = Buffer.concat([bufferHeader, neuronCountBuffer, expansionCountBuffer /*, field3, etc*/], 4 + totalLength);
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

module.exports = HandleGetModelDescriptor;
