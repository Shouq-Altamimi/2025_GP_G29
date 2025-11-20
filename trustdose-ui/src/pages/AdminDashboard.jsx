// src/pages/AdminDashboard.jsx (أو اسم ملفك)
// صفحة: AdminAddDoctorOnly

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { X, LayoutDashboard, UserPlus, LogOut } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";

import app, { db } from "../firebase";
import {
  collection, addDoc, serverTimestamp,
  doc, updateDoc, runTransaction,
  query, orderBy, limit, getDocs
} from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from "firebase/auth";

/* =========================
   Auth setup
   ========================= */
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

/* =========================
   Blockchain utils
   ========================= */
const DoctorRegistry_ABI = [
  {
    inputs: [
      { internalType: "address", name: "_doctor", type: "address" },
      { internalType: "string",  name: "_accessId", type: "string" },
      { internalType: "bytes32", name: "_tempPassHash", type: "bytes32" }
    ],
    name: "addDoctor", outputs: [], stateMutability: "nonpayable", type: "function"
  },
];

async function loadEthers() {
  const mod = await import("ethers");
  return mod.ethers ? mod.ethers : mod;
}
async function getProvider() {
  const E = await loadEthers();
  return E.BrowserProvider ? new E.BrowserProvider(window.ethereum) : new E.providers.Web3Provider(window.ethereum);
}
async function getSigner(provider) {
  const s = provider.getSigner();
  return typeof s.then === "function" ? await s : s;
}
async function idCompat(text) {
  const E = await loadEthers();
  return (E.utils?.id || E.id)(text);
}

/* =========================
   Helpers
   ========================= */
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

/* =========================
   Firestore
   ========================= */
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

/* =========================
   Blockchain save
   ========================= */
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

/* =========================
   Sidebar (TrustDose style) + Active state
   ========================= */
function TDAdminSidebar({ open, setOpen, onNav, onLogout }) {
  const location = useLocation();
  const go = (path) => { setOpen(false); onNav?.(path); };
  const isActive = (path) => location.pathname === path;

  return (
    <>
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />
      <aside
        className="fixed top-0 left-0 z-50 h-full w-[290px] shadow-2xl"
        style={{
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 180ms ease",
          background:
            "linear-gradient(180deg, rgba(176,140,193,0.95) 0%, rgba(146,137,186,0.95) 45%, rgba(82,185,196,0.92) 100%)",
        }}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <img src="/Images/TrustDose_logo.png" alt="TrustDose" className="h-7 w-auto" />
          <button
            onClick={() => setOpen(false)}
            className="h-9 w-9 grid place-items-center rounded-lg hover:bg-white/20 text-white"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="px-3">
          <SidebarItem active={isActive("/admin/dashboard")} onClick={() => go("/admin/dashboard")}>
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </SidebarItem>

          <SidebarItem active={isActive("/admin")} onClick={() => go("/admin")}>
            <UserPlus size={18} />
            <span>Add Doctor</span>
          </SidebarItem>

          <SidebarItem variant="ghost" onClick={() => { setOpen(false); onLogout?.(); }}>
            <LogOut size={18} />
            <span>Sign out</span>
          </SidebarItem>
        </nav>
      </aside>
    </>
  );
}
function SidebarItem({ children, onClick, variant = "solid", active = false }) {
  const base = "w-full mb-3 inline-flex items-center gap-3 px-3 py-3 rounded-xl font-medium transition-colors";
  const styles = active
    ? "bg-white text-[#5B3A70]"
    : variant === "ghost"
      ? "text-white/90 hover:bg-white/10"
      : "bg-white/25 text-white hover:bg-white/35";
  return (
    <button onClick={onClick} className={`${base} ${styles}`} aria-current={active ? "page" : undefined}>
      {children}
    </button>
  );
}

/* =========================
   Validation (EN-only)
   ========================= */
// min 5 chars
const NAME_RE = /^[A-Za-z ]{5,}$/;
const SPEC_RE = /^[A-Za-z ]{5,}$/;
const LIC_RE  = /^[A-Za-z0-9]{10}$/; // exactly 10 alphanumeric

function validateLic(v) {
  if (!v) return { ok: false, err: "License number is required." };
  if (!LIC_RE.test(v)) return { ok: false, err: "Must be exactly 10 letters or digits." };
  return { ok: true, err: "" };
}
function validateName(v) {
  if (!v) return { ok: false, err: "Name is required." };
  if (!NAME_RE.test(v)) return { ok: false, err: "Letters and spaces only (min 5 chars)." };
  return { ok: true, err: "" };
}
function validateSpec(v) {
  if (!v) return { ok: false, err: "Specialty is required." };
  if (!SPEC_RE.test(v)) return { ok: false, err: "Letters and spaces only (min 5 chars)." };
  return { ok: true, err: "" };
}
function validateContract(v) {
  if (!v) return { ok: false, err: "Contract address is required." };
  if (!isHex40(v)) return { ok: false, err: "Enter a valid 0x + 40 hex address." };
  return { ok: true, err: "" };
}
function validateWallet(v) {
  if (!v) return { ok: false, err: "Wallet address is required (use MetaMask button)." };
  if (!isHex40(v)) return { ok: false, err: "Enter a valid 0x + 40 hex address." };
  return { ok: true, err: "" };
}

/* === Sanitizers to force EN-only during typing === */
function sanitizeName(raw) {
  return raw.replace(/[^A-Za-z ]/g, "").replace(/\s{2,}/g, " ");
}
function sanitizeSpec(raw) {
  return raw.replace(/[^A-Za-z ]/g, "").replace(/\s{2,}/g, " ");
}
function sanitizeLicense(raw) {
  return raw.replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
}
function sanitizeHexLike(raw) {
  let s = raw.replace(/[^0-9a-fA-Fx]/g, "");
  if (!s.toLowerCase().startsWith("0x")) {
    s = s.replace(/x/gi, "");
  }
  if (s.toLowerCase().startsWith("0x")) {
    const rest = s.slice(2).replace(/x/gi, "");
    s = "0x" + rest;
  }
  return s;
}

/* =========================
   UI helpers
   ========================= */
function fieldClasses(valid, dirty) {
  const neutral = "border-gray-200 focus:ring-[#B08CC1]";
  if (!dirty) return neutral;
  if (!valid) return "border-rose-500 focus:ring-rose-300";
  return neutral; // صحيح: محايد
}
function ErrorMsg({ children }) {
  if (!children) return null;
  return <div className="mt-1 text-xs text-rose-600 text-left">{children}</div>;
}

/* =========================
   Page
   ========================= */
export default function AdminAddDoctorOnly() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    localStorage.clear();
    sessionStorage.clear();
    try { await signOut(getAuth(app)); } catch {}
    navigate("/auth", { replace: true });
  }

  const HOSPITAL_NAME = "Dr. Sulaiman Al Habib Hospital";
  const [contractAddress, setContractAddress] = useState("0x28900a3A92C4b588990DF77e11491380B66842a8");
  const [DoctorID, setDoctorID] = useState("");
  const [healthFacility] = useState(HOSPITAL_NAME);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [name, setName] = useState("");
  const [speciality, setspeciality] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [accessId, setAccessId] = useState("…");
  const [tempPassword, setTempPassword] = useState(generateTempPassword());
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const [dirty, setDirty] = useState({ contract: false, name: false, spec: false, lic: false, wallet: false });

  // Validations
  const vContract = validateContract(contractAddress);
  const vName     = validateName(name);
  const vSpec     = validateSpec(speciality);
  const vLic      = validateLic(licenseNumber);
  const vWallet   = validateWallet(walletAddress);
  const allValid  = vContract.ok && vName.ok && vSpec.ok && vLic.ok && vWallet.ok;

  async function connectMetaMask() {
    try {
      if (!window?.ethereum) { setStatus("⚠️ Please install MetaMask first."); return; }
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const provider = await getProvider();
      const signer = await getSigner(provider);
      const addr = await signer.getAddress();
      setWalletAddress(addr);
      setDirty((d) => ({ ...d, wallet: true }));
      setStatus("✅ Address fetched from MetaMask.");
    } catch (e) {
      setStatus(`❌ ${e?.message || e}`);
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

  const formOk = useMemo(() => allValid && tempPassword, [allValid, tempPassword]);

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

      await saveDoctor_FirestoreMulti({
        entityType: "Doctor",
        role: "Doctor",
        isActive: true,

        name,
        specialty: speciality,
        facility: healthFacility,
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

      setStatus(`✅ Doctor added successfully.`);
      setLicenseNumber("");
      setName("");
      setspeciality("");
      setWalletAddress("");
      setDirty({ contract: false, name: false, spec: false, lic: false, wallet: false });
      setTempPassword(generateTempPassword());
      const previewNext = await peekNextAccessId();
      setAccessId(previewNext);
      setDoctorID(previewNext);
    } catch (e) {
      setStatus(`❌ ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header without logout button */}
      <Header hideMenu={false} onMenuClick={() => setOpen(true)} />

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

      {/* Form box */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <aside className="w-full max-w-xl bg-white rounded-3xl shadow-xl border border-gray-200 p-6">
          <h3 className="mb-4 text-xl font-semibold text-[#4A2C59]">Add Doctor</h3>

          {/* Contract Address */}
          <div className="mb-3">
            <label className="block text-sm text-gray-700 mb-1">
              Contract Address <span className="text-rose-600">*</span>
            </label>
            <input
              placeholder="0x + 40 hex characters"
              value={contractAddress}
              onChange={(e) => {
                const cleaned = sanitizeHexLike(e.target.value);
                setContractAddress(cleaned);
                setDirty((d)=>({...d, contract:true}));
              }}
              className={`w-full rounded-2xl border px-4 py-3 text-gray-800 outline-none focus:ring-2 ${fieldClasses(vContract.ok, dirty.contract)}`}
              inputMode="text"
              dir="ltr"
            />
            <ErrorMsg>{dirty.contract && !vContract.ok ? vContract.err : ""}</ErrorMsg>
          </div>

          {/* Name + Specialty */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Doctor Name <span className="text-rose-600">*</span>
              </label>
              <input
                placeholder="e.g., Ahmed Alharbi"
                value={name}
                onChange={(e) => {
                  setName(sanitizeName(e.target.value));
                  setDirty((d)=>({...d, name:true}));
                }}
                className={`w-full rounded-2xl border px-4 py-3 text-gray-800 outline-none focus:ring-2 ${fieldClasses(vName.ok, dirty.name)}`}
                inputMode="text"
              />
              <ErrorMsg>{dirty.name && !vName.ok ? vName.err : ""}</ErrorMsg>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Specialty <span className="text-rose-600">*</span>
              </label>
              <input
                placeholder="e.g., Cardiology"
                value={speciality}
                onChange={(e) => {
                  setspeciality(sanitizeSpec(e.target.value));
                  setDirty((d)=>({...d, spec:true}));
                }}
                className={`w-full rounded-2xl border px-4 py-3 text-gray-800 outline-none focus:ring-2 ${fieldClasses(vSpec.ok, dirty.spec)}`}
                inputMode="text"
              />
              <ErrorMsg>{dirty.spec && !vSpec.ok ? vSpec.err : ""}</ErrorMsg>
            </div>
          </div>

          {/* IDs / Facility / License */}
          <div className="mt-3 grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Doctor ID</label>
              <input
                placeholder="Auto-generated (e.g., Dr-007)"
                value={DoctorID}
                readOnly
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">Health Facility</label>
              <input
                value={healthFacility}
                readOnly
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">
                License Number <span className="text-rose-600">*</span>
              </label>
              <input
                placeholder="10 letters or digits"
                value={licenseNumber}
                onChange={(e) => {
                  setLicenseNumber(sanitizeLicense(e.target.value));
                  setDirty((d)=>({...d, lic:true}));
                }}
                className={`w-full rounded-2xl border px-4 py-3 text-gray-800 outline-none focus:ring-2 ${fieldClasses(vLic.ok, dirty.lic)}`}
                inputMode="text"
              />
              <ErrorMsg>{dirty.lic && !vLic.ok ? vLic.err : ""}</ErrorMsg>
            </div>
          </div>

          {/* Wallet + Use MetaMask */}
          <div className="mt-3">
            <label className="block text-sm text-gray-700 mb-1">
              Wallet Address <span className="text-rose-600">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                placeholder="Click “Use MetaMask” to fill"
                value={walletAddress}
                readOnly
                className={`flex-1 rounded-2xl border px-4 py-3 text-gray-800 outline-none focus:ring-2 ${fieldClasses(vWallet.ok, dirty.wallet)}`}
                inputMode="text"
                dir="ltr"
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
            <p className="mt-1 text-xs text-gray-500">
              Please click "Use MetaMask" to automatically fill the wallet address.
            </p>
            <ErrorMsg>{dirty.wallet && !vWallet.ok ? vWallet.err : ""}</ErrorMsg>
          </div>

          {/* Access ID + Temp Password (read-only) */}
          <div className="mt-4 space-y-2">
            <div className="flex justify-between border border-gray-200 bg-gray-50 px-4 py-2 rounded-2xl text-sm text-gray-700">
              <span><b>Access ID:</b> {accessId}</span>
            </div>
            <div className="flex justify-between border border-gray-200 bg-gray-50 px-4 py-2 rounded-2xl text-sm text-gray-700">
              <span><b>Temp Password:</b> {tempPassword}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-5 flex justify-end gap-3">
            <button
              onClick={() => window.history.back()}
              className="rounded-2xl border border-gray-200 px-5 py-3 text-[#4A2C59] hover:bg-[#F5F0FA]"
            >
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

      {/* Sidebar */}
      <TDAdminSidebar
        open={open}
        setOpen={setOpen}
        onNav={(path) => navigate(path)}
        onLogout={handleLogout}
      />
    </div>
  );
}
