/*module.exports = {
  networks: {
    ganache: { host: "127.0.0.1", 
      port: 7545,
       network_id: "5777" },
  },
  compilers: {
    solc: {
      version: "0.8.28",
      settings: {
        optimizer: { enabled: true, runs: 200 },
        evmVersion: "paris"   
      },
    },
  },
};*/
module.exports = {
  networks: {
    development: {
      host: "127.0.0.1", // نفس Ganache
      port: 7545,        // نفس RPC في Ganache GUI
      network_id: "5777" // مهم! رقم الشبكة في Ganache (الافتراضي 5777)
      // gas: 6721975,    // (اختياري) تقدر تفتحه إذا احتجت
      // gasPrice: 20000000000
    },
  },

  // خلي الكمبايلر على نفس نسخة عقدك
  compilers: {
    solc: {
      version: "0.8.28",
      settings: {
        optimizer: { enabled: true, runs: 200 },
      },
    },
  },
};

