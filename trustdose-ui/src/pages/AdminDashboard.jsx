// ===================== Admin Dashboard (Final UI fixed + MM near input + dual keys + Modern Welcome Banner Outside) =====================
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";

import app, { db } from "../firebase";
import {
  collection, addDoc, serverTimestamp,
  doc, updateDoc, runTransaction,
  query, orderBy, limit, getDocs
} from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from "firebase/auth";

/* ---------- Auth Ready ---------- */
const auth = getAuth(app);
if (!auth.currentUser) signInAnonymously(auth).catch(() => {});
onAuthStateChanged(auth, (u) => u && console.log(" anon uid:", u.uid));

let authReadyPromise = null;
function ensureAuthReady() {
  const a = getAuth(app);
  if (a.currentUser?.uid) return Promise.resolve(a.currentUser.uid);
  if (authReadyPromise) return authReadyPromise;
  authReadyPromise = new Promise((resolve, reject) => {
    signInAnonymously(a).catch(()=>{});
    const unsub = onAuthStateChanged(a, (u) => {
      if (u?.uid) { unsub(); resolve(u.uid); }
    }, reject);
    setTimeout(() => reject(new Error("Auth timeout")), 10000);
  });
  return authReadyPromise;
}

/* ---------- Contract ABI ---------- */
const DoctorRegistry_ABI = [
  {
    inputs: [
      { internalType: "address", name: "_doctor", type: "address" },
      { internalType: "string",  name: "_accessId", type: "string" },
      { internalType: "bytes32", name: "_tempPassHash", type: "bytes32" }
    ],
    name: "addDoctor", outputs: [], stateMutability: "nonpayable", type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "_doctor", type: "address" },
      { internalType: "bool",    name: "_active", type: "bool" }
    ],
    name: "setDoctorActive", outputs: [], stateMutability: "nonpayable", type: "function"
  },
  {
    inputs: [{ internalType: "string", name: "_accessId", type: "string" }],
    name: "isAccessIdUsed", outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view", type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "_doctor", type: "address" }],
    name: "getDoctor",
    outputs: [
      { internalType: "string",  name: "accessId",     type: "string" },
      { internalType: "bytes32", name: "tempPassHash", type: "bytes32" },
      { internalType: "bool",    name: "active",       type: "bool" }
    ],
    stateMutability: "view", type: "function"
  },
  { inputs: [], name: "owner", outputs: [{ internalType: "address", name: "", type: "address" }], stateMutability: "view", type: "function" }
];

/* ---------- ethers helpers ---------- */
async function loadEthers() {
  const mod = await import("ethers");
  return mod.ethers ? mod.ethers : mod;
}
async function getProvider() {
  const E = await loadEthers();
  if (E.BrowserProvider) return new E.BrowserProvider(window.ethereum);
  return new E.providers.Web3Provider(window.ethereum);
}
async function getSigner(provider) {
  const s = provider.getSigner();
  return typeof s.then === "function" ? await s : s;
}
async function idCompat(text) {
  const E = await loadEthers();
  return (E.utils?.id || E.id)(text);
}

/* ---------- Helpers ---------- */
function generateTempPassword() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const a = letters[Math.floor(Math.random() * letters.length)];
  const b = letters[Math.floor(Math.random() * letters.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${a}${b}-${num}`;
}
function isHex40(s) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(s || "").trim());
}
async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- Firestore ---------- */
async function saveDoctor_FirestoreMulti(docData) {
  await ensureAuthReady();
  return addDoc(collection(db, "doctors"), { ...docData, createdAt: serverTimestamp() });
}
async function reserveAccessId_Firestore(id) {
  await ensureAuthReady();
  const ref = doc(db, "accessIds", id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) throw new Error("ACCESS_ID_TAKEN");
    tx.set(ref, { createdAt: Date.now(), claimed: false });
  });
  return true;
}
async function tryReserveAccessId(id) {
  try { await reserveAccessId_Firestore(id); return true; }
  catch (e) { if (String(e?.message).includes("ACCESS_ID_TAKEN")) return false; throw e; }
}
async function markAccessIdClaimed_Firestore(id) {
  await ensureAuthReady();
  const ref = doc(db, "accessIds", id);
  await updateDoc(ref, { claimed: true, claimedAt: Date.now() });
}
async function peekNextAccessId() {
  await ensureAuthReady();
  const q = query(collection(db, "doctors"), orderBy("createdAt", "desc"), limit(100));
  const snap = await getDocs(q);
  let maxNum = 0;
  snap.forEach((d) => {
    const a = d.data()?.accessId;
    const m = /^Dr-(\d{3})$/i.exec(String(a || ""));
    if (m) { const n = parseInt(m[1], 10); if (!Number.isNaN(n)) maxNum = Math.max(maxNum, n); }
  });
  const next = maxNum + 1;
  return `Dr-${String(next).padStart(3, "0")}`;
}
async function allocateSequentialAccessId() {
  let candidate = await peekNextAccessId();
  for (let i = 0; i < 20; i++) {
    const ok = await tryReserveAccessId(candidate);
    if (ok) return candidate;
    const m = /^Dr-(\d{3})$/.exec(candidate);
    const n = m ? parseInt(m[1], 10) + 1 : 1;
    candidate = `Dr-${String(n).padStart(3, "0")}`;
  }
  throw new Error("Failed to allocate sequential Access ID. Please try again.");
}

/* ---------- On-chain save ---------- */
async function saveOnChain({ contractAddress, doctorWallet, accessId, tempPassword }) {
  const E = await loadEthers();
  const provider = E.BrowserProvider ? new E.BrowserProvider(window.ethereum) : new E.providers.Web3Provider(window.ethereum);
  const signer = await getSigner(provider);
  const contract = new E.Contract(contractAddress, DoctorRegistry_ABI, signer);
  const tempPassHash = await idCompat(tempPassword);
  const tx = await contract.addDoctor(doctorWallet, accessId, tempPassHash);
  const rc = await tx.wait();
  return { txHash: tx.hash, block: rc.blockNumber };
}

/* ---------- Component ---------- */
export default function AdminAddDoctorOnly() {
  const navigate = useNavigate();

  // ===== Logout =====
  async function handleLogout() {
    try {
      localStorage.removeItem("userRole");
      localStorage.removeItem("userId");
      sessionStorage.clear();
      try { await signOut(getAuth(app)); } catch {}
    } finally {
      navigate("/auth", { replace: true });
    }
  }

  // ===== Constants =====
  const HOSPITAL_NAME = "Dr. Sulaiman Al Habib Hospital";

  // ===== Form state =====
  const [contractAddress, setContractAddress] = useState("0xA41A59dA0602AcccE599B844Aea1931Ae0BA1Fd8");
  const [DoctorID, setDoctorID] = useState("");
  const [healthFacility, sethealthFacility] = useState(HOSPITAL_NAME); // fixed value
  const [licenseNumber, setLicenseNumber] = useState("");
  const [name, setName] = useState("");
  const [speciality, setspeciality] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [accessId, setAccessId] = useState("…");
  const [tempPassword, setTempPassword] = useState(generateTempPassword());
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  // ===== MetaMask next to input =====
  async function connectMetaMask() {
    try {
      if (!window?.ethereum) { setStatus("⚠️ Please install MetaMask first."); return; }
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const provider = await getProvider();
      const signer = await getSigner(provider);
      const addr = await signer.getAddress();
      setWalletAddress(addr);
      setStatus("✅ Address fetched from MetaMask.");
    } catch (e) {
      if (e?.code === 4001) setStatus("❌ MetaMask request rejected.");
      else setStatus(`❌ MetaMask: ${e?.message || e}`);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const preview = await peekNextAccessId();
        setAccessId(preview);
        setDoctorID(preview);
      } catch {}
    })();
  }, []);

  const formOk = useMemo(
    () =>
      isHex40(contractAddress) &&
      isHex40(walletAddress) &&
      name && speciality && healthFacility && licenseNumber && tempPassword,
    [contractAddress, walletAddress, name, speciality, healthFacility, licenseNumber, tempPassword]
  );

  async function handleSave() {
    try {
      setSaving(true);
      if (!formOk) throw new Error("Please fill all required fields correctly");
      await ensureAuthReady();

      setStatus("⏳ Allocating sequential Access ID…");
      const id = await allocateSequentialAccessId();
      setAccessId(id);
      setDoctorID(id);

      setStatus("⏳ Adding doctor on-chain…");
      const chain = await saveOnChain({ contractAddress, doctorWallet: walletAddress, accessId: id, tempPassword });

      setStatus("⏳ Saving to database…");
      const tempPasswordHash = await sha256Hex(tempPassword);
      const expiresAtMs = Date.now() + 24 * 60 * 60 * 1000;

      // ✅ write dual keys for compatibility
      await saveDoctor_FirestoreMulti({
        entityType: "Doctor",
        role: "Doctor",
        isActive: true,

        name,
        specialty: speciality,
        speciality,
        facility: healthFacility,
        healthFacility,
        licenseNumber,

        walletAddress,
        accessId: id,
        doctorId: id,
        DoctorID: id,
        chain: { contractAddress, txHash: chain.txHash, block: chain.block },

        passwordHash: tempPasswordHash,
        tempPassword: { expiresAtMs, valid: true },

        createdAt: serverTimestamp(),
      });

      await markAccessIdClaimed_Firestore(id);

      setStatus(`✅ Doctor added. Tx: ${chain.txHash.slice(0, 12)}…`);
      const previewNext = await peekNextAccessId();
      setAccessId(previewNext);
      setDoctorID(previewNext);
      setTempPassword(generateTempPassword());
    } catch (e) {
      setStatus(`❌ ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <Header
        hideMenu
        rightNode={
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-3 py-2 text-sm text-[#4A2C59] hover:bg-zinc-50"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        }
      />

      <section className="mx-auto w-full max-w-5xl px-6 mt-10 mb-4">
        <div className="flex items-center gap-0">
          <img
            src="/Images/TrustDose-pill.png"
            alt=""
            className="w-[75px] h-[75px] shrink-0 select-none"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-[#2A1E36]">
            Welcome, Admin
          </h1>
        </div>
      </section>

      {/* ===== Form box ===== */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <aside className="w-full max-w-xl bg-white rounded-3xl shadow-xl border border-gray-200 p-6">
          <h3 className="mb-4 text-xl font-semibold text-[#4A2C59]">Add Doctor</h3>

          <input
            placeholder="Contract Address — 0x…"
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
            className="mb-3 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1]"
          />

          <div className="grid grid-cols-1 gap-3">
            <input
              placeholder="Doctor Name"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^A-Za-z\s]+/g, ""))}
              className="rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1]"
            />
            <input
              placeholder="Specialty"
              value={speciality}
              onChange={(e) => setspeciality(e.target.value.replace(/[^A-Za-z\s]+/g, ""))}
              className="rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1]"
            />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3">
            <input
              placeholder="Doctor ID"
              value={DoctorID}
              readOnly
              className="rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1]"
            />

            {/* Fixed Health Facility */}
            <input
              value={healthFacility}
              readOnly
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none bg-gray-50 focus:ring-2 focus:ring-[#B08CC1]"
            />

            <input
              placeholder="License Number"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value.replace(/[^A-Za-z0-9-]+/g, ""))}
              className="rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1]"
            />
          </div>

          {/* Wallet + Use MetaMask */}
          <div className="mt-3 flex items-center gap-2">
            <input
              placeholder="Wallet Address 0x…"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              className="flex-1 rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1]"
            />
            <button
              onClick={connectMetaMask}
              type="button"
              className="rounded-2xl border border-gray-200 bg-[#F8F6FB] px-4 py-3 text-[#4A2C59] hover:bg-[#EDE4F3]"
              title="Fetch address from MetaMask"
            >
              Use MetaMask
            </button>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex justify-between border border-gray-200 bg-gray-50 px-4 py-2 rounded-2xl text-sm text-gray-700">
              <span><b>Access ID:</b> {accessId}</span>
            </div>
            <div className="flex justify-between border border-gray-200 bg-gray-50 px-4 py-2 rounded-2xl text-sm text-gray-700">
              <span><b>Temp Password:</b> {tempPassword}</span>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => window.history.back()} className="rounded-2xl border border-gray-200 px-5 py-3 text-[#4A2C59] hover:bg-[#F5F0FA]">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !formOk}
              className={`rounded-2xl px-5 py-3 font-medium text-white shadow-md transition-all ${
                saving || !formOk ? "bg-[#CBB4D9] cursor-not-allowed" : "bg-[#B08CC1] hover:bg-[#9A7EAF]"
              }`}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          <p className="mt-3 text-center text-xs text-gray-500">{status}</p>
        </aside>
      </main>

      <Footer />
    </div>
  );
}
