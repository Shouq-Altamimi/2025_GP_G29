// ===================== Admin Dashboard (Full, pruned as requested) =====================
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Search, Bell, ChevronDown } from "lucide-react";

import app, { db } from "../firebase";
import {
  collection, addDoc, serverTimestamp,
  doc, updateDoc, runTransaction,
  query, orderBy, limit, getDocs, setDoc
} from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

/* ---------- Auth: Anonymous مرة واحدة + ضمان الجاهزية قبل Firestore ---------- */
const auth = getAuth(app);
if (!auth.currentUser) {
  signInAnonymously(auth).catch(() => {});
}
onAuthStateChanged(auth, (u) => {
  if (u) console.log(" anon uid:", u.uid);
});

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
  if (E.BrowserProvider) return new E.BrowserProvider(window.ethereum); // v6
  return new E.providers.Web3Provider(window.ethereum); // v5
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

/* ---------- Firestore (docId = wallet lowercase) ---------- */
async function saveDoctor_FirestoreByWallet(walletAddress, docData) {
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
  throw new Error("Failed to allocate a sequential Access ID. Please try again.");
}

/* ---------- Component ---------- */
export default function AdminAddDoctorOnly() {
  const [contractAddress, setContractAddress] = useState("0x7ba3501Dab7c44137762db51E1dd6d94d29CFae1");
  const [doctorId, setDoctorId] = useState(""); // = accessId
  const [facility, setFacility] = useState("");
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
    () =>
      isHex40(contractAddress) &&
      isHex40(walletAddress) &&
      name && specialty && facility && licenseNumber &&
      tempPassword,
    [contractAddress, walletAddress, name, specialty, facility, licenseNumber, tempPassword]
  );

  // ====== Input sanitizers & guards ======
  const sanitizeLettersSpaces = (s) => s.replace(/[^A-Za-z\s]+/g, "");
  const sanitizeLicense = (s) => s.replace(/[^A-Za-z0-9-]+/g, "");
  const guardBeforeInput = (allowedCharRegex) => (e) => {
    if (e.data && !allowedCharRegex.test(e.data)) e.preventDefault();
  };
  const handlePasteSanitize = (sanitizer, setter) => (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text") || "";
    setter(sanitizer(text));
  };
  const onlyLetterOrSpace = /^[A-Za-z\s]$/;
  const onlyLicenseChar   = /^[A-Za-z0-9-]$/;

  /* ---- MetaMask ---- */
  async function connectMetaMask() {
    try {
      if (!window?.ethereum) { setStatus("⚠️ Please install MetaMask first."); return; }
      try { await window.ethereum.request({ method: "eth_requestAccounts" }); }
      catch (e) {
        if (e && (e.code === 4001 || e?.message?.includes("rejected"))) {
          setStatus("❌ MetaMask: request was rejected."); return;
        }
      }
      const provider = await getProvider();
      const signer = await getSigner(provider);
      const addr = await signer.getAddress();
      if (!(await isAddressCompat(addr))) { setStatus("❌ MetaMask: invalid address returned."); return; }
      setWalletAddress(addr);
      setStatus("✅ Address fetched from MetaMask.");
    } catch (e) { setStatus(`❌ MetaMask: ${e?.message || e}`); }
  }

  /* ---- On-chain save ---- */
  async function saveOnChain({ contractAddress, doctorWallet, accessId, tempPassword }) {
    const E = await loadEthers();

    if (!window.ethereum) throw new Error("MetaMask not found");
    if (!((E.utils?.isAddress || E.isAddress)(contractAddress))) throw new Error("Invalid contract address");
    if (!((E.utils?.isAddress || E.isAddress)(doctorWallet)))   throw new Error("Invalid wallet address");

    const provider = E.BrowserProvider
      ? new E.BrowserProvider(window.ethereum)          // v6
      : new E.providers.Web3Provider(window.ethereum);  // v5

    const signer = await (async () => {
      const s = provider.getSigner();
      return typeof s.then === "function" ? await s : s;
    })();

    const code = await provider.getCode(contractAddress);
    if (!code || code === "0x") throw new Error("No contract at this address (wrong network/address)");

    const contract = new E.Contract(contractAddress, DoctorRegistry_ABI, signer);

    // تحقق المالك
    try {
      if (typeof contract.owner === "function") {
        const owner = await contract.owner();
        const me    = await signer.getAddress();
        if (owner?.toLowerCase?.() !== me?.toLowerCase?.()) {
          throw new Error(`You must use the owner account.\nOwner: ${owner}\nCurrent: ${me}`);
        }
      }
    } catch (err) { throw new Error(err?.message || "Contract ownership verification failed"); }

    // فحص استخدام Access ID على السلسلة
    try {
      if (typeof contract.isAccessIdUsed === "function") {
        const used = await contract.isAccessIdUsed(accessId);
        if (used) throw new Error(`Access ID "${accessId}" is already used on-chain`);
      }
    } catch (_) {}

    // فحص وجود الدكتور (struct/array)
    try {
      if (typeof contract.getDoctor === "function") {
        const info = await contract.getDoctor(doctorWallet);
        console.log("🔎 getDoctor(", doctorWallet, ") =>", info);
        const access = (info && (info.accessId ?? info[0])) ?? "";
        const active = (info && (info.active ?? info[2])) ?? false;
        if ((access && String(access).length > 0) || active === true) {
          throw new Error("Doctor exists");
        }
      }
    } catch (_) {}

    const tempPassHash = await idCompat(tempPassword);

    // Dry-run v6/v5
    try {
      if (contract.addDoctor?.staticCall) {
        await contract.addDoctor.staticCall(doctorWallet, accessId, tempPassHash); // v6
      } else if (contract.callStatic?.addDoctor) {
        await contract.callStatic.addDoctor(doctorWallet, accessId, tempPassHash); // v5
      } else if (contract.estimateGas?.addDoctor) {
        await contract.estimateGas.addDoctor(doctorWallet, accessId, tempPassHash);
      }
    } catch (err) {
      const reason = err?.reason || err?.message || err?.shortMessage || (err?.error && err.error.message) || "addDoctor() would revert";
      throw new Error(reason);
    }

    // التنفيذ الفعلي
    const tx = await contract.addDoctor(doctorWallet, accessId, tempPassHash);
    const rc = await tx.wait();
    return { txHash: tx.hash, block: rc.blockNumber };
  }

  /* ---- Submit ---- */
  async function handleSave() {
    try {
      setSaving(true);
      if (!formOk) throw new Error("Please fill all required fields correctly");

      await ensureAuthReady(); // مهم جداً قبل أي Firestore

      // A) فحوصات مسبقة على السلسلة (لا نحجز ID قبل ما نتأكد)
      setStatus("⏳ Preflight on-chain checks…");
      const E = await loadEthers();
      const provider = E.BrowserProvider
        ? new E.BrowserProvider(window.ethereum)
        : new E.providers.Web3Provider(window.ethereum);
      const signer = await (async () => {
        const s = provider.getSigner();
        return typeof s.then === "function" ? await s : s;
      })();
      const code = await provider.getCode(contractAddress);
      if (!code || code === "0x") throw new Error("No contract at this address (wrong network/address)");
      const contract = new E.Contract(contractAddress, DoctorRegistry_ABI, signer);

      // المالك
      try {
        if (typeof contract.owner === "function") {
          const owner = await contract.owner();
          const me = await signer.getAddress();
          if (owner?.toLowerCase?.() !== me?.toLowerCase?.()) {
            throw new Error(`You must use the owner account.\nOwner: ${owner}\nCurrent: ${me}`);
          }
        }
      } catch (err) { throw new Error(err?.message || "Ownership check failed"); }

      // الدكتور موجود؟
      try {
        if (typeof contract.getDoctor === "function") {
          const info = await contract.getDoctor(walletAddress);
          console.log("🔎 getDoctor preflight:", info);
          const access = (info && (info.accessId ?? info[0])) ?? "";
          const active = (info && (info.active ?? info[2])) ?? false;
          if ((access && String(access).length > 0) || active === true) {
            throw new Error("Doctor exists");
          }
        }
      } catch (_) {}

      // الـ Access ID المعروض قد يكون مستخدم — إن كان مستخدم نعرض التالي فقط
      try {
        if (typeof contract.isAccessIdUsed === "function") {
          const used = await contract.isAccessIdUsed(accessId);
          if (used) {
            const preview = await peekNextAccessId();
            setAccessId(preview);
            setDoctorId(preview);
            setStatus(`⚠️ "${accessId}" used on-chain. Previewed next: ${preview}`);
          }
        }
      } catch (_) {}

      // B) نحجز Access ID فعليًا الآن
      setStatus("⏳ Allocating sequential Access ID…");
      const id = await allocateSequentialAccessId();
      setAccessId(id);
      setDoctorId(id);

      // C) On-chain
      setStatus("⏳ Adding doctor on-chain…");
      const chain = await saveOnChain({
        contractAddress,
        doctorWallet: walletAddress,
        accessId: id,
        tempPassword,
      });

      // D) Database — نخزّن هاش الباس المؤقت + كل البيانات بوثيقة docId = عنوان المحفظة
      setStatus("⏳ Saving to database…");
      const tempPasswordHash = await sha256Hex(tempPassword);
      const passwordHash     = tempPasswordHash; // للتوافق مع القواعد إن وُجدت
      const expiresAtMs = Date.now() + 24 * 60 * 60 * 1000; // 24h

      await saveDoctor_FirestoreByWallet(walletAddress, {
        // تعريف
        entityType: "Doctor",
        role: "Doctor",
        isActive: true,
      
        // معلومات الطبيب
        name,
        specialty,
        facility,
        licenseNumber,
      
        // ربط البلوك تشين
        walletAddress,
        accessId: id,
        doctorId: id,
        chain: { contractAddress, txHash: chain.txHash, block: chain.block },
      
        // كلمة المرور المؤقتة (توحيد الاسم)
        passwordHash: tempPasswordHash,         
        tempPassword: { expiresAtMs, valid: true },
      
        createdAt: serverTimestamp(),
      });
      
      // علّمنا الـ accessId بأنه مستهلك
      await markAccessIdClaimed_Firestore(id);

      // E) Success + تجهيز التالي
      setStatus(`✅ Doctor added. Tx: ${chain.txHash.slice(0, 12)}…`);
      const previewNext = await peekNextAccessId();
      setAccessId(previewNext);
      setDoctorId(previewNext);
      setTempPassword(generateTempPassword());
    } catch (e) {
      setStatus(`❌ ${e?.message || e}`);
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
    <div className="min-h-screen w-full bg-[#F7F5FB] font-sans">
      {/* HEADER */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 p-4">
          <a href="/" className="flex items-center gap-2 text-[#4A2C59]">
            <img
              src="/images/TrustDose_logo.png"
              alt="TrustDose"
              className="h-16 w-auto object-contain -ml-3"
              style={{ transform: "scale(1.35)", transformOrigin: "left center" }}
            />
            <span className="hidden sm:inline text-sm text-zinc-500"></span>
          </a>
          <div className="ml-auto hidden items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 md:flex">
            <Search className="h-4 w-4" />
            <input className="w-48 bg-transparent outline-none placeholder:text-zinc-400" placeholder="Search…" />
          </div>
          <button className="rounded-xl p-2 text-zinc-600 hover:bg-zinc-100"><Bell className="h-5 w-5" /></button>
          <button className="flex items-center gap-2 rounded-XL border border-zinc-300 px-3 py-2 text-sm text-[#4A2C59] hover:bg-zinc-50">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-zinc-200 text-zinc-700">AD</div>
            <span className="hidden sm:inline">Admin</span>
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* BODY */}
      <main className="mx-auto grid max-w-5xl grid-cols-1 gap-6 p-4 md:grid-cols-1 md:p-6">
        <aside className="mx-auto h-max w-full max-w-2xl rounded-3xl bg-white p-6 shadow-lg ring-1 ring-[#B08CC1]/20 md:sticky md:top-24">
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
              value={facility}
              onBeforeInput={guardBeforeInput(onlyLetterOrSpace)}
              onPaste={handlePasteSanitize(sanitizeLettersSpaces, setFacility)}
              onChange={(e) => setFacility(sanitizeLettersSpaces(e.target.value))}
              title="English letters only"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1]"
              required
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

          {/* Wallet + MetaMask */}
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
    </div>
  );
}
