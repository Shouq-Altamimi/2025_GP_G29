// truffle-config.js
/* 
networks: {
  development: {
    host: "127.0.0.1", // نفس Ganache
    port: 7545,        // نفس RPC في Ganache GUI
    network_id: "5777" // مهم! رقم الشبكة في Ganache (الافتراضي 5777)
    // gas: 6721975,    // (اختياري) تقدر تفتحه إذا احتجت
    // gasPrice: 20000000000
  },
},
*/

// truffle-config.js
module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*"   // 5777/1337 كلاهما يمشي
    }
  },
  compilers: {
    solc: {
      version: "0.8.19",
      settings: { optimizer: { enabled: true, runs: 200 } }
    }
  }
};

