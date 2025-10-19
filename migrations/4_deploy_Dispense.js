const Prescription = artifacts.require("Prescription");
const Dispense = artifacts.require("Dispense");

module.exports = async function (deployer) {
  // نفترض إن Prescription نُشر في خطوة سابقة (3_deploy_Prescription.js)
  const pres = await Prescription.deployed();

  // انشر عقد الصرف وتمرير عنوان عقد الوصفة للكونستركتر
  await deployer.deploy(Dispense, pres.address);
};
