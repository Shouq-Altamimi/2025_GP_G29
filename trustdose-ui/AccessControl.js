import { useState } from "react";
import { ethers } from "ethers";
import AccessControlArtifact from "../build/contracts/AccessControl.json";

export default function AccessControlPanel() {
  const [account, setAccount] = useState("");
  const [doctorAddress, setDoctorAddress] = useState("");
  const [accessId, setAccessId] = useState("");
  const [contract, setContract] = useState(null);
  const [status, setStatus] = useState("");

  const contractAddress = "0xbac0f8437B6aD3564015e6e20CD67cFA3dbCEBf5";

  // اتصال بـ MetaMask
  async function connectWallet() {
    if (window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0]);
      const instance = new ethers.Contract(contractAddress, AccessControlArtifact.abi, signer);
      setContract(instance);
      setStatus("Wallet connected ✅");
    } else {
      setStatus("Please install MetaMask 🦊");
    }
  }

  // إضافة دكتور
  async function addDoctor() {
    if (!contract) return setStatus("Connect wallet first");
    try {
      const tx = await contract.addUser(doctorAddress, 1, accessId); // Role 1 = Doctor
      await tx.wait();
      setStatus("Doctor added successfully ✅");
    } catch (err) {
      console.error(err);
      setStatus("❌ Transaction failed");
    }
  }

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h2>TrustDose Admin — Add Doctor</h2>
      <button onClick={connectWallet}>Connect MetaMask</button>
      <p>{status}</p>

      <div style={{ marginTop: 20 }}>
        <input
          type="text"
          placeholder="Doctor Wallet Address"
          value={doctorAddress}
          onChange={(e) => setDoctorAddress(e.target.value)}
        />
        <input
          type="text"
          placeholder="Access ID (e.g. DOC-1001)"
          value={accessId}
          onChange={(e) => setAccessId(e.target.value)}
        />
        <button onClick={addDoctor}>Add Doctor</button>
      </div>

      {account && <p>Connected as: {account}</p>}
    </div>
  );
}
