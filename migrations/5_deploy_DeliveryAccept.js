const Prescription = artifacts.require("Prescription");
const DeliveryAccept = artifacts.require("DeliveryAccept");

module.exports = async function (deployer, network, accounts) {
  // جيبي عنوان عقد الوصفات المنشور مسبقًا
  const presc = await Prescription.deployed();
  const prescAddress = presc.address;

  // انشري عقد DeliveryAccept مع عنوان Prescription
  await deployer.deploy(DeliveryAccept, prescAddress);

  const delivery = await DeliveryAccept.deployed();
  console.log("✅ DeliveryAccept deployed at:", delivery.address);
  console.log("↪️ Using Prescription at:", prescAddress);
};
