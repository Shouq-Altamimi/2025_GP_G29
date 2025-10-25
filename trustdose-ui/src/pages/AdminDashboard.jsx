// ===================== Admin Dashboard (Final, stable) =====================
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { LogOut } from "lucide-react";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";

import app, { db } from "../firebase";
import {
  collection, addDoc, serverTimestamp,
  doc, updateDoc, runTransaction,
  query, orderBy, limit, getDocs, setDoc
} from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

/* ---------- Auth Ready (Anonymous) ---------- */
const auth = getAuth(app);
if (!auth.currentUser) signInAnonymously(auth).catch(() => {});
onAuthStateChanged(auth, (u) => u && console.log("anon uid:", u.uid));

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
  return E.BrowserProvider ? new E.BrowserProvider(window.ethereum) : new E.providers.Web3Provider(window.ethereum);
}
async function getSigner(provider) {
  const s = provider.getSigner();
  return typeof s.then === "function" ? await s : s;
}
async function isAddressCompat(addr) {
  const E = await loadEthers();
  return (E.utils?.isAddress || E.isAddress)(addr);
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
// sha256 -> hex
async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- Firestore helpers ---------- */
async function saveDoctor_FirestoreMulti(docData) {
  await ensureAuthReady();
  const ref = doc(db, "doctors", String(walletAddress || "").toLowerCase());
  await setDoc(ref, { ...docData, updatedAt: serverTimestamp() }, { merge: true });
}

/* ---------- accessIds uniqueness via transaction ---------- */
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
  try {
    await reserveAccessId_Firestore(id);
    return true;
  } catch (e) {
    if (String(e?.message).includes("ACCESS_ID_TAKEN")) return false;
    throw e;
  }
}
async function markAccessIdClaimed_Firestore(id) {
  await ensureAuthReady();
  const ref = doc(db, "accessIds", id);
  await updateDoc(ref, { claimed: true, claimedAt: Date.now() });
}
async function saveDoctor_Firestore(docData) {
  await ensureAuthReady();
  return addDoc(collection(db, "doctors"), { ...docData, createdAt: serverTimestamp() });
}

/* ---------- Access ID: Dr-001, Dr-002, ... ---------- */
async function peekNextAccessId() {
  await ensureAuthReady();
  const q = query(collection(db, "doctors"), orderBy("createdAt", "desc"), limit(100));
  const snap = await getDocs(q);
  let maxNum = 0;
  snap.forEach((d) => {
    const a = d.data()?.accessId;
    const m = /^Dr-(\d{3})$/i.exec(String(a || ""));
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n)) maxNum = Math.max(maxNum, n);
    }
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

  if (!window.ethereum) throw new Error("MetaMask not detected");
  const provider = E.BrowserProvider ? new E.BrowserProvider(window.ethereum) : new E.providers.Web3Provider(window.ethereum);
  const code = await provider.getCode(contractAddress);
  if (!code || code === "0x") throw new Error("No contract at this address (wrong network/address)");

  const signer = await getSigner(provider);
  const contract = new E.Contract(contractAddress, DoctorRegistry_ABI, signer);
  const tempPassHash = await idCompat(tempPassword);

  if (typeof contract.owner === "function") {
    const owner = await contract.owner();
    const me = await signer.getAddress();
    if (owner?.toLowerCase?.() !== me?.toLowerCase?.()) {
      throw new Error(`Use contract owner.\nOwner: ${owner}\nCurrent: ${me}`);
    }
  }

  try {
    if (contract.addDoctor?.staticCall) {
      await contract.addDoctor.staticCall(doctorWallet, accessId, tempPassHash);
    }
  } catch (err) {
    const reason = err?.reason || err?.message || err?.shortMessage || (err?.error && err.error.message) || "addDoctor() would revert";
    throw new Error(reason);
  }

  const tx = await contract.addDoctor(doctorWallet, accessId, tempPassHash);
  const rc = await tx.wait();
  return { txHash: tx.hash, block: rc.blockNumber };
}

/* ---------- Component ---------- */
export default function AdminAddDoctorOnly() {
  const [contractAddress, setContractAddress] = useState("0x4E2D2BBB07f80811dfA258E78dB35068D447F6E2");
  const [DoctorID, setDoctorID] = useState("");
  const [healthFacility, sethealthFacility] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [accessId, setAccessId] = useState("…");
  const [tempPassword, setTempPassword] = useState(generateTempPassword());

  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasMM, setHasMM] = useState(false);
  useEffect(() => { setHasMM(typeof window !== "undefined" && !!window.ethereum); }, []);

  // تحديث العنوان تلقائي عند تغيير حساب MetaMask
  useEffect(() => {
    if (!window.ethereum) return;
    const onAccounts = (accounts) => {
      if (accounts && accounts[0]) {
        setWalletAddress(accounts[0]);
        setStatus(`🔄 MetaMask account: ${accounts[0].slice(0, 8)}…`);
      }
    };
    window.ethereum.request({ method: "eth_accounts" }).then(onAccounts).catch(()=>{});
    window.ethereum.on?.("accountsChanged", onAccounts);
    return () => window.ethereum.removeListener?.("accountsChanged", onAccounts);
  }, []);

  // معاينة Access ID القادم (بدون حجز)
  useEffect(() => {
    (async () => {
      try {
        const preview = await peekNextAccessId();
        setAccessId(preview);
        setDoctorId(preview);
      } catch {}
    })();
  }, []);

  const formOk = useMemo(
    () => isHex40(contractAddress) && isHex40(walletAddress) && name && speciality && healthFacility && licenseNumber && tempPassword,
    [contractAddress, walletAddress, name, speciality, healthFacility, licenseNumber, tempPassword]
  );

  async function connectMetaMask() {
    try {
      if (!window?.ethereum) { setStatus("⚠️ MetaMask not detected"); return; }
      try { await window.ethereum.request({ method: "eth_requestAccounts" }); }
      catch (e) { if (e && (e.code === 4001 || e?.message?.includes("rejected"))) { setStatus("❌ MetaMask: request rejected"); return; } }
      const provider = await getProvider();
      const signer = await getSigner(provider);
      const addr = await signer.getAddress();
      setWalletAddress(addr);
      setStatus("✅ Address fetched from MetaMask.");
    } catch (e) {
      setStatus(`❌ MetaMask: ${e?.message || e}`);
    }
  }

  async function handleLogout() {
    try {
      localStorage.removeItem("userRole");
      localStorage.removeItem("userId");
      sessionStorage.clear();
      try { await signOut(getAuth(app)); } catch {}
    } finally {
      window.location.href = "/auth";
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      if (!formOk) throw new Error("Please fill all required fields correctly");
      setStatus("🔐 Ensuring anonymous auth…");
      await ensureAuthReady();

      setStatus("🆔 Allocating sequential Access ID…");
      const id = await allocateSequentialAccessId();
      setAccessId(id);
      setDoctorId(id);

      setStatus("⛓️ Adding doctor on-chain…");
      const chain = await saveOnChain({ contractAddress, doctorWallet: walletAddress, accessId: id, tempPassword });

      setStatus("🗄️ Saving to Firestore…");
      const tempPasswordHash = await sha256Hex(tempPassword);
      const passwordHash     = tempPasswordHash; // للتوافق مع القواعد إن وُجدت
      const expiresAtMs = Date.now() + 24 * 60 * 60 * 1000; // 24h

      await saveDoctor_FirestoreByWallet(walletAddress, {
        // تعريف
        entityType: "Doctor",
        role: "Doctor",
        isActive: true,
      
        // الحقول المشتركة
        name,
        licenseNumber,

        // ربط البلوك تشين
        walletAddress,
        accessId: id,
        chain: { contractAddress, txHash: chain.txHash, block: chain.block },

        // كلمة المرور المؤقتة
        tempPasswordHash,
        passwordHash,
        tempPassword: { expiresAtMs, valid: true },

        createdAt: serverTimestamp(),
      
        // ✅ التسميات القديمة (للتوافق مع الريتريف عند البنات)
        specialty: speciality,
        doctorId: DoctorID,
        facility: healthFacility,
      
        // ✅ التسميات الجديدة (المستخدمة في كود الأدمن)
        speciality,
        DoctorID,
        healthFacility,
      });
      

      setStatus("🏷️ Marking Access ID as claimed…");
      await markAccessIdClaimed_Firestore(id);

      // E) Success + تجهيز التالي
      setStatus(`✅ Doctor added. Tx: ${chain.txHash.slice(0, 12)}…`);
      const previewNext = await peekNextAccessId();
      setAccessId(previewNext);
      setDoctorId(previewNext);
      setTempPassword(generateTempPassword());
    } catch (e) {
      const msg = e?.message || String(e);
      if (/permission|denied|insufficient/i.test(msg)) setStatus(`❌ Firestore permission: ${msg}`);
      else setStatus(`❌ ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`📋 Copied ${label}`);
    } catch (err) {
      console.error(err);
      setStatus("⚠️ Copy failed, please copy manually.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header: فقط زر الخروج */}
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
        </div>
      </header>

      {/* Form box */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <aside className="w-full max-w-xl bg-white rounded-3xl shadow-xl border border-gray-200 p-6">
          <h3 className="mb-4 text-xl font-semibold text-[#4A2C59]">Add Doctor</h3>

          {/* Contract */}
          <input
            placeholder="Contract Address — 0x…"
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
            className="mb-3 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1]"
          />

          {/* Name / Specialty */}
          <div className="grid grid-cols-1 gap-3">
            <input
              placeholder="Doctor Name"
              value={name}
              onBeforeInput={guardBeforeInput(onlyLetterOrSpace)}
              onPaste={handlePasteSanitize(sanitizeLettersSpaces, setName)}
              onChange={(e) => setName(sanitizeLettersSpaces(e.target.value))}
              title="English letters only"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1]"
              required
            />
            <input
              placeholder="Specialty"
              value={specialty}
              onBeforeInput={guardBeforeInput(onlyLetterOrSpace)}
              onPaste={handlePasteSanitize(sanitizeLettersSpaces, setSpecialty)}
              onChange={(e) => setSpecialty(sanitizeLettersSpaces(e.target.value))}
              title="English letters only"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1]"
              required
            />
          </div>

          {/* Doctor ID / Facility / License Number */}
          <div className="mt-3 grid grid-cols-1 gap-3">
            <input
              placeholder="Doctor ID"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              readOnly
              title="Filled automatically from Access ID"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1]"
            />
            <input
              placeholder="Health Facility"
              value={healthFacility}
              onChange={(e) => sethealthFacility(e.target.value.replace(/[^A-Za-z.\-\s]+/g, ""))}
              className="rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1]"
            />
            <input
              placeholder="License Number"
              value={licenseNumber}
              onBeforeInput={guardBeforeInput(onlyLicenseChar)}
              onPaste={handlePasteSanitize(sanitizeLicense, setLicenseNumber)}
              onChange={(e) => setLicenseNumber(sanitizeLicense(e.target.value))}
              title="Letters, digits, and '-' only"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1]"
              required
            />
          </div>

          {/* ✅ زر MetaMask جنب الحقل */}
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
              title="Use MetaMask"
            >
              Use MetaMask
            </button>
          </div>

          {/* Credentials */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2">
              <div className="text-sm text-gray-700"><span className="font-medium">Access ID:</span> {accessId}</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const next = await peekNextAccessId();
                    setAccessId(next);
                    setDoctorId(next);
                    setStatus(`👀 Next Access ID preview: ${next}`);
                  }}
                  className="text-xs rounded-lg border border-gray-200 px-2 py-1 hover:bg-white"
                >
                  ↻
                </button>
                <button onClick={() => copy(accessId, "Access ID")} className="text-xs rounded-lg border border-gray-200 px-2 py-1 hover:bg-white">Copy</button>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2">
              <div className="text-sm text-gray-700"><span className="font-medium">Temp Password:</span> {tempPassword}</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setTempPassword(generateTempPassword())} className="text-xs rounded-lg border border-gray-200 px-2 py-1 hover:bg-white">↻</button>
                <button onClick={() => copy(tempPassword, "Temp Password")} className="text-xs rounded-lg border border-gray-200 px-2 py-1 hover:bg-white">Copy</button>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-5 flex items-center justify-end gap-3">
            <button onClick={() => window.history.back()} className="rounded-2xl border border-gray-200 px-5 py-3 text-[#4A2C59] hover:bg-[#F5F0FA]">Cancel</button>
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

          <p className="mt-3 min-h-[20px] text-center text-xs text-gray-500">{status}</p>
        </aside>
      </main>

      <Footer />
    </div>
  );
}
