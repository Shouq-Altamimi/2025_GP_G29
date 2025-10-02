module.exports = {
  networks: {
    ganache: {
      host: "127.0.0.1",
      port: 7545,         
      network_id: "5777",    
    },
  },
  compilers: {
    solc: {
      version: "0.8.28",  // أو أي إصدار تبينه من 0.8
      settings: { optimizer: { enabled: true, runs: 200 } }
    }
  }
};
