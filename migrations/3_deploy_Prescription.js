const Prescription = artifacts.require("Prescription");

module.exports = async function (deployer, network, accounts) {
  const DOCTOR = accounts[0];
  await deployer.deploy(Prescription, DOCTOR);
  console.log("Deployed Prescription with doctor =", DOCTOR);
};
