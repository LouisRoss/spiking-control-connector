var singleton = require('./connection-manager');

class RequestResponder {
  constructor() {
      this.controller = singleton.getInstance();
  }

  handleConnectionRequest(req) {
    if (req && req.request) {
      if (req.request == 'connect') {
        var success = this.controller.attemptConnection(req.server);

        if (success) {
          this.controller.fullStatusPoll();
        }

        return {query:req, response:{result:(success ? 'ok' : "Already Connected")}};
      }
      else if (req.request == 'disconnect') {
        var success = this.controller.disconnect();
        return {query:req, response:{result:(success ? 'ok' : "Already Disconnected")}};
      }
      else {
        console.log(`Unrecognized connection request ${req.request}`);
        return {query:req, response:{result:'fail', error:'bad request', errordetail:`Unrecognized connection request ${req.request}`}};
      }
    }

    return {query:req, response:{result:'fail', error:'bad request', errordetail:"Invalid request format"}};
  }

  handleConfigurationsRequest() {
    //this.controller.getConfigurations();
    return new Promise(resolve => {
      var status = this.controller.passthrough({ query: "configurations" }, data => resolve(data));
      if (status) {
        console.log('Configurations query sent');
      } 
      else {
        console.log('Failed to send configurations query');
      }
    });
  }

  handleFullStatusRequest() {
    this.controller.fullStatusPoll();
  }

  handleStatusRequest() {
    var status = this.controller.getStatus();
    return {query:{query:'dynamicstatus'}, response:{result:'ok', status:status}};
  }

  handlePassthroughRequest(req, callback) {
    if (req && req.request) {
      if (req.request == 'passthrough') {
        var status = this.controller.passthrough(req.packet, (data) => callback(data));

        if (status) {
          console.log('Passthrough command in progress');
        } else {
          console.log('Passthrough command failed');
          callback({query:req, response:{result:'fail', error:'passthrough fail', errordetail:`Unable to complete passthrough request ${req.request}`}});
        }

        return status;
      }
      else {
        console.log(`Unrecognized passthrough request ${req.request}`);
        callback({query:req, response:{result:'fail', error:'passthrough fail', errordetail:`Unrecognized passthrough request ${req.request}`}});
        return false;
      }
    }

    callback({query:req, response:{result:'fail', error:'passthrough fail', errordetail:"Invalid request format"}});
    return false;
  }
}


module.exports = RequestResponder;
