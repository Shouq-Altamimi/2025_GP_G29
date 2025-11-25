const Prescription = artifacts.require("Prescription");
const LogisticsAccept = artifacts.require("LogisticsAccept");

module.exports = async function (deployer, network, accounts) {
  const prescription = await Prescription.deployed();

  const logistics = accounts.slice(0, 10);
  console.log("Logistics accounts:", logistics);

  await deployer.deploy(LogisticsAccept, prescription.address, logistics);

  console.log(
    "✅ LogisticsAccept deployed with Prescription:",
    prescription.address
  );
};
