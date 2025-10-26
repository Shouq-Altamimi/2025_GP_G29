const Prescription = artifacts.require("Prescription");

module.exports = async function (deployer, network, accounts) {
  const doctors = accounts.slice(0, 10);
  console.log("Doctors:", doctors);

  await deployer.deploy(Prescription, doctors);
  console.log("✅ Deployed Prescription with doctors [0–9]");
};
