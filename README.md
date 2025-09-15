# 2025_GP_G29: TrustDose 
### Blockchain & IoT Prescription Management System  

The **TrustDose** platform is a blockchain and IoT-based healthcare management system designed to enhance **security, transparency, and traceability** in prescription handling and medicine delivery. It addresses the common challenges of traditional prescription systems, such as the risk of **fraud, errors, loss of prescriptions, and inadequate monitoring of sensitive medicines** during transport.  

TrustDose provides a unified solution where **doctors, pharmacists, patients, and logistics providers** can interact seamlessly through a transparent and tamper-proof platform. Sensitive medicines such as insulin and vaccines require special care, especially with temperature monitoring during distribution. By combining blockchain immutability with IoT real-time sensor readings, TrustDose ensures that patients receive their medicines under safe and optimal conditions.  

The platform focuses on:  
- **Secure prescription management** using blockchain immutability.  
- **Automated workflows** powered by smart contracts for issuing, validating, and dispensing prescriptions.  
- **Real-time monitoring** of temperature-sensitive medicines through IoT sensors.  
- **Transparency and trust** for all stakeholders by documenting every step of the medicine’s journey: *Doctor → Pharmacy → Logistics → Patient*.  

This solution contributes to improving patient safety, reducing fraud, ensuring compliance with storage conditions, and providing a reliable, modern digital healthcare service.  

---

### Technology Used  

- **Blockchain Technology (Ethereum)**: Ensures the immutability and security of prescription records. Every transaction (from doctor issuance to pharmacy dispensing) is recorded on the blockchain, providing full traceability.  
- **Smart Contracts**: Automate processes such as issuing prescriptions, accepting them by pharmacies, updating shipment status, and validating temperature thresholds before final dispensing.  
- **Truffle and Ganache**: Tools for developing, testing, and deploying smart contracts locally.  
- **React.js & Web3.js**: For building the frontend web application and enabling interaction with the blockchain.  
- **Node.js (Middleware)**: Server-side component bridging IoT sensors with the blockchain.  
- **IoT Sensors (ESP32, DHT11)**: Devices used to continuously monitor temperature for sensitive medicines during transport.  

---

### Setting up Local Development  

#### Step 1: Installation and Setup  

1. **VSCode**: Download from [VSCode website](https://code.visualstudio.com/).  

2. **Node.js**: Download the latest version from [Node.js website](https://nodejs.org/). After installation, verify by running:  
   ```bash
   node -v
   ```  

3. **Git**: Download from [Git website](https://git-scm.com/downloads). Verify installation:  
   ```bash
   git --version
   ```  

4. **Ganache**: Download from [Ganache official website](https://trufflesuite.com/ganache/).  

5. **MetaMask**: Install MetaMask as a browser extension from the [Chrome Web Store](https://chrome.google.com/webstore/category/extensions) or [Firefox Add-ons](https://addons.mozilla.org/).  

---

#### Step 2: Create, Compile & Deploy Smart Contract  

1. **Open VSCode** and launch the integrated terminal (`Ctrl + '`).  

2. **Clone the Project**:  
   ```bash
   git clone https://github.com/your-username/trustdose.git
   cd trustdose
   ```  

3. **Install Truffle**:  
   ```bash
   npm install -g truffle
   ```  

4. **Install Project Dependencies**:  
   ```bash
   npm i
   ```  

##### Project Structure Overview:  
- **contracts**: Contains Solidity smart contracts.  
- **migrations**: JavaScript files for deploying contracts to the blockchain.  
- **test**: JavaScript test files for validating smart contract functionality.  
- **truffle-config.js**: Configuration file for blockchain networks.  
- **client/**: React frontend for doctors, pharmacies, patients, and logistics dashboards.  
- **server/**: Node.js middleware handling IoT integration and data validation.  

5. **Compile Smart Contracts**:  
   ```bash
   truffle compile
   ```  

6. **Deploy Smart Contracts**:  
   - Open Ganache and create a new workspace.  
   - Copy the RPC server address.  
   - Update `truffle-config.js` with the Ganache RPC details.  
   - Run deployment:  
     ```bash
     truffle migrate
     ```  

---

#### Step 3: Run the DApp  

1. **Navigate to the client Folder**:  
   ```bash
   cd client
   ```  

2. **Install Dependencies**:  
   ```bash
   npm i
   ```  

3. **Run the DApp**:  
   ```bash
   npm start
   ```  

The web application will be hosted at: `http://localhost:3000`.  

---

#### Step 4: Connect MetaMask with Ganache  

1. **Start Ganache**: Launch Ganache and note the RPC URL and port.  

2. **Configure MetaMask**:  
   - Open MetaMask and click the network dropdown.  
   - Select "Custom RPC" and enter the Ganache RPC URL.  
   - Save the configuration.  

3. **Import Ganache Account**:  
   - In Ganache, copy the private key of one account.  
   - In MetaMask, select “Import Account” and paste the private key.  

link to the repositry : https://github.com/Shouq-Altamimi/2025_GP_G29
