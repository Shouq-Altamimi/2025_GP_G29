const Prescription = artifacts.require("Prescription");
const DeliveryConfirmation = artifacts.require("DeliveryConfirmation");

module.exports = async function (deployer, network, accounts) {
  const prescription = await Prescription.deployed();

  const logistics = accounts.slice(0, 10);

  await deployer.deploy(DeliveryConfirmation, prescription.address, logistics);

  console.log("✅ DeliveryConfirmation deployed with Prescription:", prescription.address);
};
