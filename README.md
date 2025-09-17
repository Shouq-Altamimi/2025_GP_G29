# 2025_GP_G29: TrustDose 
### Blockchain & IoT Prescription Management System  


TrustDose is a modern healthcare management platform built on **Blockchain** and **IoT technologies**. It is designed to improve **security, transparency, and traceability** in the process of issuing, dispensing, and delivering prescriptions. Traditional prescription systems face challenges such as fraud, errors, loss of prescriptions, and poor monitoring of sensitive medicines during transport. TrustDose addresses these issues by providing a tamper-proof, transparent platform that connects doctors, pharmacies, patients, and logistics providers.  

The platform is especially valuable for sensitive medicines like insulin and vaccines, which require strict temperature control. By combining blockchain immutability with real-time IoT sensor monitoring, TrustDose ensures that patients receive their medicines safely and under optimal conditions.  

### Key Features  
- Immutable prescription records stored on the **Ethereum blockchain**.  
- Automated prescription workflows using **Smart Contracts** (issue, validate, dispense).  
- Real-time monitoring of medicine temperature with **IoT sensors**.  
- Full transparency and trust among all stakeholders (Doctor → Pharmacy → Logistics → Patient).  

## Technology Used  
- **Blockchain (Ethereum, Solidity)**  
- **Smart Contracts (Truffle, Ganache)**  
- **Frontend (React.js, Web3.js)**  
- **Backend (Node.js middleware)**  
- **IoT Sensors (ESP32, DHT11)**  

## Launching Instructions (Briefly)  
1. **Clone the repository & install dependencies:**  
   ```bash
   git clone https://github.com/your-username/2025_GP_GroupNumber.git  
   cd trustdose  
   npm i
   ```  

2. **Deploy smart contracts using Ganache:**  
   ```bash
   truffle migrate
   ```  

3. **Run the frontend (React DApp):**  
   ```bash
   cd client  
   npm start
   ```  

4. **Connect MetaMask:**  
   - Add Ganache RPC network.  
   - Import an account using a private key from Ganache.  


link to the repositry : https://github.com/Shouq-Altamimi/2025_GP_G29
