// migrations/8_deploy_DeliveryConfirmation.js
const DeliveryConfirmation = artifacts.require("DeliveryConfirmation");

module.exports = function (deployer, network, accounts) {
  const logistics = accounts.slice(0, 10);
  console.log("Logistics accounts for DeliveryConfirmation:", logistics);
  return deployer.deploy(DeliveryConfirmation, logistics);
};
