const Prescription = artifacts.require("Prescription");

module.exports = async function (deployer) {
  await deployer.deploy(Prescription);
};
