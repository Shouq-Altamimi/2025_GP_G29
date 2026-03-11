const IoTBreachRecorder = artifacts.require("IoTBreachRecorder");

module.exports = function (deployer) {
  deployer.deploy(IoTBreachRecorder);
};