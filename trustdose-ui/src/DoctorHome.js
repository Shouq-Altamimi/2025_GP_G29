"use client";
import React, { useState } from "react";
import { ethers } from "ethers";
import AccessControl from "./contracts/AccessControl.json";

const ROLES = ["None", "Admin", "Doctor", "Pharmacy", "Logistics", "Patient"];

export default function DoctorHome() {
  const [contractAddress, setContractAddress] = useState("0xbac0f8437B6aD3564015e6e20CD67cFA3dbCEBf5");
  const [myRole, setMyRole] = useState("-");
  const [myAccessId, setMyAccessId] = useState("-");
  const [status, setStatus] = useState("");

  const loadMyProfile = async () => {
    try {
      if (!window.ethereum) return alert("Install MetaMask first.");

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const me = await signer.getAddress();

      const contract = new ethers.Contract(
        contractAddress,
        AccessControl.abi,
        provider
      );

      const [role, accessId] = await contract.getUser(me);
      setMyRole(ROLES[Number(role)] || `${role}`);
      setMyAccessId(accessId || "-");
      setStatus("✅ Loaded.");
    } catch (err) {
      console.error(err);
      setStatus(`❌ ${err?.shortMessage || err?.message}`);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 520, fontFamily: "system-ui" }}>
      <h2>Doctor Home</h2>
      <label>Contract Address</label>
      <input
        value={contractAddress}
        onChange={(e) => setContractAddress(e.target.value)}
        placeholder="0x..."
        style={{ display: "block", width: "100%", margin: "6px 0 14px", padding: 8 }}
      />

      <button onClick={loadMyProfile}>Load My Role & AccessID</button>

      <div style={{ marginTop: 16 }}>
        <div><b>Role:</b> {myRole}</div>
        <div><b>Access ID:</b> {myAccessId}</div>
      </div>

      <div style={{ marginTop: 12 }}>{status}</div>
    </div>
  );
}
