const AccessControl = artifacts.require("DoctorRegistry");

module.exports = function (deployer) {
  deployer.deploy(AccessControl);
};
