// src/pages/AdminAddDoctor.jsx
"use client";
import React, { useState } from "react";
import { ethers } from "ethers";
import AccessControl from "../contracts/AccessControl.json"; // عدّلي المسار إذا لزم
import { db } from "../firebase"; // عدّلي المسار إذا لزم
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

const ROLE_DOCTOR = 2;

function generateAccessId() {
  return "AC-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}
function generateTempPassword() {
  // نمط بسيط مثل PX-4821
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const a = letters[Math.floor(Math.random() * letters.length)];
  const b = letters[Math.floor(Math.random() * letters.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${a}${b}-${num}`;
}

// SHA-256 باستخدام WebCrypto
async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function AdminAddDoctor() {
  const [contractAddress, setContractAddress] = useState(""); // اكتب عقد Ganache هنا أو الصقه
  const [entityType] = useState("Doctor");
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [mohReg, setMohReg] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [tempPassword, setTempPassword] = useState(generateTempPassword());
  const [accessId, setAccessId] = useState(generateAccessId());
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const connectMetaMask = async () => {
    try {
      if (!window.ethereum) {
        setStatus("⚠️ ثبّتي MetaMask أولاً.");
        return;
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      setWalletAddress(addr);
      setStatus("✅ تم جلب العنوان من MetaMask.");
    } catch (e) {
      setStatus(`❌ MetaMask: ${e?.shortMessage || e?.message}`);
    }
  };

  const saveOnChain = async ({ contractAddress, doctorWallet, accessId }) => {
    if (!window.ethereum) throw new Error("MetaMask not found");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    // تحقّق من صلاحية العنوان
    if (!ethers.isAddress(doctorWallet)) {
      throw new Error("Wallet address غير صالح");
    }
    // تحميل العقد بتوقيع الموقّع (الأدمن)
    const contract = new ethers.Contract(contractAddress, AccessControl.abi, signer);
    const tx = await contract.addUser(doctorWallet, ROLE_DOCTOR, accessId);
    const receipt = await tx.wait();
    return { txHash: tx.hash, block: receipt.blockNumber };
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setStatus("⏳ جاري الحفظ على السلسلة وFirestore...");

      // تحقق أساسي
      if (!contractAddress) throw new Error("أدخل عنوان عقد AccessControl");
      if (!name || !specialty || !mohReg) throw new Error("أكملي الحقول المطلوبة");
      if (!walletAddress || !ethers.isAddress(walletAddress)) throw new Error("Wallet Address غير صالح");
      if (!tempPassword) throw new Error("Temp Password مطلوب");

      // 1) حفظ على البلوك تشين
      const chain = await saveOnChain({
        contractAddress,
        doctorWallet: walletAddress,
        accessId,
      });

      // 2) هاش الباسورد المؤقت
      const passwordHash = await sha256Hex(tempPassword);

      // 3) حفظ في Firestore
      await addDoc(collection(db, "doctors"), {
        entityType,
        name,
        specialty,
        mohReg,
        walletAddress,
        accessId,
        passwordHash, // لا نخزّن الباسورد نفسه
        role: "Doctor",
        chain: {
          contractAddress,
          txHash: chain.txHash,
          block: chain.block,
        },
        createdAt: serverTimestamp(),
        isActive: true,
      });

      setStatus(`✅ تم إضافة الطبيب. Tx: ${chain.txHash.slice(0, 10)}…`);
      // جدّدي القيم إن تبين تضيفين آخر
      setAccessId(generateAccessId());
      setTempPassword(generateTempPassword());
      // نخلي الاسم/… كما هي علشان السجل واضح
    } catch (e) {
      setStatus(`❌ فشل الحفظ: ${e?.shortMessage || e?.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 18, minWidth: 420, fontFamily: "system-ui" }}>
      <h3 style={{ marginBottom: 12 }}>Add Doctor</h3>

      <label>AccessControl Contract Address</label>
      <input
        placeholder="0x... (Ganache)"
        value={contractAddress}
        onChange={(e) => setContractAddress(e.target.value)}
        style={{ display: "block", width: "100%", margin: "6px 0 14px", padding: 10 }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label>Entity type</label>
          <select value={entityType} disabled style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }}>
            <option>Doctor</option>
          </select>
        </div>

        <div>
          <label>Specialty</label>
          <input
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            placeholder="e.g. Endocrinology"
            style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div>
          <label>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Doctor Name"
            style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }}
          />
        </div>

        <div>
          <label>MOH Reg</label>
          <input
            value={mohReg}
            onChange={(e) => setMohReg(e.target.value)}
            placeholder="MOH Registration No."
            style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div>
          <label>Wallet Address</label>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <input
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="0x... (MetaMask)"
              style={{ flex: 1, padding: 10 }}
            />
            <button onClick={connectMetaMask} type="button" style={{ padding: "10px 12px" }}>
              Use MetaMask
            </button>
          </div>
        </div>

        <div>
          <label>Temp Password</label>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <input
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              placeholder="e.g. PX-4821"
              style={{ flex: 1, padding: 10 }}
            />
            <button onClick={() => setTempPassword(generateTempPassword())} type="button" style={{ padding: "10px 12px" }}>
              Regenerate
            </button>
          </div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>
            سيُخزَّن **هاش** هذا الباسورد في Firestore (ليس النص الصريح).
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label>Access ID</label>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <input value={accessId} readOnly style={{ flex: 1, padding: 10 }} />
          <button onClick={() => setAccessId(generateAccessId())} type="button" style={{ padding: "10px 12px" }}>
            Regenerate
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
        <button type="button" style={{ padding: "10px 16px" }} onClick={() => window.history.back()}>
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "10px 16px",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Saving..." : "Save & On-chain"}
        </button>
      </div>

      <div style={{ marginTop: 10 }}>{status}</div>
    </div>
  );
}
