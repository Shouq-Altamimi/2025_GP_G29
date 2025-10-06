import React, { useState } from "react";
import { ethers } from "ethers";
import AccessControl from "../contracts/AccessControl.json";

const ROLE_DOCTOR = 2; // Doctor من enum

function generateAccessId(prefix = "DOC") {
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${rnd}`;
}

export default function AdminAddDoctor() {
  const [doctorAddress, setDoctorAddress] = useState("");
  const [accessId, setAccessId] = useState(generateAccessId());
  const [status, setStatus] = useState("");

  const [contractAddress, setContractAddress] = useState(
    process.env.REACT_APP_ACCESSCONTROL_ADDRESS || ""
  );

  const handleAddDoctor = async () => {
    try {
      if (!window.ethereum) {
        return alert("Install MetaMask first.");
      }

      // 1) طلب صلاحية ميتاماسك
      await window.ethereum.request({ method: "eth_requestAccounts" });

      // 2) مزود/موقعع
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // تحقق من عنوان الدكتور
      if (!ethers.isAddress(doctorAddress)) {
        return setStatus("❌ Doctor address is invalid");
      }
      // تحقق من عنوان العقد
      if (!ethers.isAddress(contractAddress)) {
        return setStatus("❌ Contract address is invalid");
      }

      // (اختياري) تأكد من الشبكة
      const net = await provider.getNetwork();
      console.log("Connected chainId:", Number(net.chainId));

      // 3) تهيئة العقد
      const contract = new ethers.Contract(
        contractAddress,
        AccessControl.abi,
        signer
      );

      // 4) تنفيذ المعاملة
      setStatus("⏳ Sending transaction…");
      const tx = await contract.addUser(doctorAddress, ROLE_DOCTOR, accessId);
      const receipt = await tx.wait();

      setStatus(
        `✅ Doctor added! AccessID: ${accessId}\nTx: ${tx.hash}\nBlock: ${receipt.blockNumber}`
      );

      // reset
      setDoctorAddress("");
      setAccessId(generateAccessId());
    } catch (err) {
      console.error(err);
      setStatus(`❌ ${err?.shortMessage || err?.message || "Transaction failed"}`);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 520, fontFamily: "system-ui" }}>
      <h2 style={{ marginBottom: 12 }}>Admin: Add Doctor</h2>

      <label>Contract Address</label>
      <input
        value={contractAddress}
        onChange={(e) => setContractAddress(e.target.value)}
        placeholder="0x..."
        style={{ display: "block", width: "100%", margin: "6px 0 14px", padding: 8 }}
      />

      <label>Doctor Wallet Address</label>
      <input
        value={doctorAddress}
        onChange={(e) => setDoctorAddress(e.target.value)}
        placeholder="0x... (MetaMask address)"
        style={{ display: "block", width: "100%", margin: "6px 0 14px", padding: 8 }}
      />

      <label>Access ID</label>
      <div style={{ display: "flex", gap: 8, margin: "6px 0 14px" }}>
        <input
          value={accessId}
          onChange={(e) => setAccessId(e.target.value)}
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={() => setAccessId(generateAccessId())}>Generate</button>
      </div>

      <button
        onClick={handleAddDoctor}
        style={{
          padding: "10px 16px",
          background: "#52B9C4",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        Add Doctor
      </button>

      <pre style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>{status}</pre>
    </div>
  );
}
