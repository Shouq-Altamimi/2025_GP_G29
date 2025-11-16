const Prescription = artifacts.require("Prescription");
const DeliveryAccept = artifacts.require("DeliveryAccept");
const LogisticsReceive = artifacts.require("LogisticsReceive");

module.exports = async function (deployer) {
  const presc = await Prescription.deployed();
  const accept = await DeliveryAccept.deployed();

  await deployer.deploy(LogisticsReceive, presc.address, accept.address);
};
