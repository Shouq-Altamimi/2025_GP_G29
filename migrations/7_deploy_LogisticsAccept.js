const LogisticsAccept = artifacts.require("LogisticsAccept");

module.exports = async function (deployer, network, accounts) {
  // نحدد أول 10 حسابات كـ شركات لوجستيك (لأن البيئة لوكالية)
  const logistics = accounts.slice(0, 10);
  console.log("Logistics Accounts:", logistics);

  // نشر عقد LogisticsAccept وتمرير قائمة اللوجستيك
  await deployer.deploy(LogisticsAccept, logistics);
  console.log("✅ Deployed LogisticsAccept with logistics accounts [0–9]");
};
