// src/pages/PShell.jsx
"use client";
import React, { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";
import { db } from "../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit as fsLimit,
  updateDoc,
  deleteField,
} from "firebase/firestore";
import { getAuth, sendSignInLinkToEmail } from "firebase/auth";
import { User, LogOut, X, Eye, EyeOff, Lock, CheckCircle, XCircle } from "lucide-react";

const C = { primary: "#B08CC1", ink: "#4A2C59" };

/* =========================
   Crypto helpers
   ========================= */
const enc = new TextEncoder();

function bytesToHex(arr) {
  return [...new Uint8Array(arr)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function bytesToBase64(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return bytesToHex(buf);
}
async function pbkdf2HashBase64(password, saltBytes, iterations = 100_000, length = 32) {
  const keyMat = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations },
    keyMat,
    length * 8
  );
  let bin = "";
  const arr = new Uint8Array(bits);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

// يستخرج عدد الدورات من النص مثل "PBKDF2-SHA256-100k" أو "pbkdf2-150k"
function parseItersFromAlgo(algo) {
  const m = String(algo || "").toLowerCase().match(/(\d+)\s*k/);
  if (m) return parseInt(m[1], 10) * 1000;
  return 100_000;
}

// ✅ تحقق كلمة السر للمريض/الطبيب مع كل الأنماط المدعومة
async function verifyPatientPassword(inputPw, docData) {
  const algo = String(docData?.passwordAlgo || "").toUpperCase();

  // نمط PBKDF2 (مرضى)
  if (algo.startsWith("PBKDF2") && docData?.passwordHash && docData?.passwordSalt) {
    const iters = Number(docData?.passwordIter) || parseItersFromAlgo(algo) || 100_000;
    const saltBytes = base64ToBytes(docData.passwordSalt);
    const derived = await pbkdf2HashBase64(inputPw, saltBytes, iters, 32);
    return derived === docData.passwordHash;
  }

  // نمط SHA-256 hex (بعض الأطباء/دعم قديم)
  if (docData?.password && /^[a-f0-9]{64}$/i.test(docData.password)) {
    const hex = await sha256Hex(inputPw);
    return hex.toLowerCase() === String(docData.password).toLowerCase();
  }

  // نص صريح (توافق قديم)
  if (typeof docData?.password === "string") {
    return inputPw === docData.password;
  }

  return false;
}

// ✅ بناء حقل الباسوورد للمرضى (افتراضي 100k)
async function buildPBKDF2Update(newPassword, iterations = 100_000) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hashB64 = await pbkdf2HashBase64(newPassword, salt, iterations, 32);
  return {
    passwordAlgo: `PBKDF2-SHA256-${Math.round(iterations / 1000)}k`,
    passwordIter: iterations,
    passwordSalt: bytesToBase64(salt),
    passwordHash: hashB64,
    passwordUpdatedAt: new Date(),
  };
}

/* =========================
   Helpers (data)
   ========================= */
function pickStr(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function normalizePatient(raw) {
  if (!raw) return null;

  const fullName = pickStr(raw, ["fullName", "name", "fullname"]);
  const nationalId = pickStr(raw, ["nationalId", "nationalID", "nid", "NID"]);
  const phone = pickStr(raw, ["phone", "mobile", "contact"]);
  const email = pickStr(raw, ["email", "Email"]);
  const emailVerifiedAt = raw?.emailVerifiedAt || null;

  // نعرض الحي فقط
  const location = pickStr(raw, ["locationDistrict", "district"]);

  let gender = pickStr(raw, ["gender", "sex"]);
  if (gender) {
    const g = gender.trim().toLowerCase();
    if (g === "f" || g === "female" || g === "أنثى" || g === "انثى") gender = "Female";
    else if (g === "m" || g === "male" || g === "ذكر") gender = "Male";
  }

  return { fullName, nationalId, phone, email, emailVerifiedAt, gender, location };
}

function resolvePatientId() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const urlId = sp.get("id");
    if (urlId && String(urlId).trim()) return String(urlId).trim();
  } catch {}
  const role = localStorage.getItem("userRole");
  const userId = localStorage.getItem("userId");
  if (role === "patient" && userId) return String(userId).trim();
  try {
    const cached = JSON.parse(sessionStorage.getItem("td_patient") || "null");
    if (cached?.nid) return String(cached.nid).trim();
  } catch {}
  return null;
}

/* =========================
   PShell (Patient)
   ========================= */
export default function PShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const isPatientPage = location.pathname.startsWith("/patient");

  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [patient, setPatient] = useState(null);
  const [patientDocId, setPatientDocId] = useState(null);

  useEffect(() => {
    (async () => {
      const pid = resolvePatientId();
      if (!pid) {
        setPatient(null);
        setPatientDocId(null);
        return;
      }

      try {
        const s = await getDoc(doc(db, "patients", String(pid)));
        if (s.exists()) {
          setPatient(normalizePatient(s.data()));
          setPatientDocId(s.id);
          return;
        }
      } catch {}

      try {
        const col = collection(db, "patients");
        const q1 = query(col, where("nationalId", "==", String(pid)), fsLimit(1));
        const r1 = await getDocs(q1);
        if (!r1.empty) {
          const d = r1.docs[0];
          setPatient(normalizePatient(d.data()));
          setPatientDocId(d.id);
          return;
        }
      } catch {}

      try {
        const col = collection(db, "patients");
        const q2 = query(col, where("nationalID", "==", String(pid)), fsLimit(1));
        const r2 = await getDocs(q2);
        if (!r2.empty) {
          const d = r2.docs[0];
          setPatient(normalizePatient(d.data()));
          setPatientDocId(d.id);
          return;
        }
      } catch {}

      setPatient(null);
      setPatientDocId(null);
    })();
  }, []);

  function signOut() {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userId");
    sessionStorage.removeItem("td_patient");
    navigate("/auth");
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header
        hideMenu={false}
        onMenuClick={() => {
          if (isPatientPage && patientDocId) setOpen(true);
        }}
      />

      {/* الصفحات الفرعية */}
      <div className="flex-1">
        <Outlet />
      </div>

      <Footer />

      {/* ====== Sidebar ====== */}
      {isPatientPage && patientDocId && (
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
              <DrawerItem
                onClick={() => {
                  setShowProfile(true);
                  setOpen(false);
                }}
              >
                <User size={18} />
                <span>My Profile</span>
              </DrawerItem>

              <DrawerItem onClick={signOut} variant="ghost">
                <LogOut size={18} />
                <span>Sign out</span>
              </DrawerItem>
            </nav>
          </aside>
        </>
      )}

      {/* ====== Modal: My Profile ====== */}
      {showProfile && (
        <PatientProfileModal patient={patient} patientDocId={patientDocId} onClose={() => setShowProfile(false)} />
      )}
    </div>
  );
}

/* =========================
   Components
   ========================= */
function DrawerItem({ children, onClick, active = false, variant = "solid" }) {
  const base = "w-full mb-3 inline-flex items-center gap-3 px-3 py-3 rounded-xl font-medium transition-colors";
  const styles =
    active ? "bg-white text-[#5B3A70]" : variant === "ghost" ? "text-white/90 hover:bg-white/10" : "bg-white/25 text-white hover:bg-white/35";
  return (
    <button onClick={onClick} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

function PatientProfileModal({ patient, patientDocId, onClose }) {
  const [emailInput, setEmailInput] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  const P = {
    fullName: patient?.fullName || "—",
    nationalId: patient?.nationalId || "—",
    phone: patient?.phone || "—",
    email: patient?.email || "",
    emailVerifiedAt: patient?.emailVerifiedAt || null,
    gender: patient?.gender || "—",
    location: patient?.location || "—",
  };

  const hasEmail = !!P.email;
  const isVerified = !!P.emailVerifiedAt;

  async function sendVerifyLink() {
    try {
      setEmailMsg("");
      const raw = String(emailInput || "").trim().toLowerCase();
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
      if (!ok) {
        setEmailMsg("Please enter a valid email.");
        return;
      }
      const BASE = window.location.origin;
      const params = new URLSearchParams({
        col: "patients",
        doc: String(patientDocId || ""),
        e: raw,
        redirect: "/patient",
      });
      const settings = {
        url: `${BASE}/auth-email?${params.toString()}`, // أو /auth-email-handler حسب ما عرفتيه في الراوتر
        handleCodeInApp: true,
      };
      setEmailLoading(true);
      await sendSignInLinkToEmail(getAuth(), raw, settings);
      localStorage.setItem("td_email_pending", JSON.stringify({ email: raw, ts: Date.now() }));
      setEmailMsg("A verification link has been sent to your email. Open it, then return to the app.");
    } catch (e) {
      console.error("Firebase:", e.code, e.message);
      setEmailMsg(`Firebase: ${e?.code || e?.message || "Unable to send verification link."}`);
    } finally {
      setEmailLoading(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 grid place-items-center px-4 overflow-y-auto py-8">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold" style={{ color: C.ink }}>
              My Profile
            </h3>
            <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-gray-100" aria-label="Close">
              ✕
            </button>
          </div>

          <div className="space-y-3 text-sm">
            <Row label="Full Name" value={P.fullName} />
            <Row label="National ID" value={P.nationalId} />
            <Row label="Phone" value={P.phone} />
            <Row label="Gender" value={P.gender} />
            <Row label="Location" value={P.location} />
          </div>

          <div className="mt-4">
            <label className="block text-sm text-gray-700 mb-1">Email</label>

            {hasEmail ? (
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800">{P.email}</span>
                {isVerified ? (
                  <span className="text-[12px] px-2 py-0.5 rounded-full border" style={{ background: "#F1F8F5", color: "#166534", borderColor: "#BBE5C8" }}>
                    Verified
                  </span>
                ) : (
                  <span className="text-[12px] px-2 py-0.5 rounded-full border" style={{ background: "#FEF2F2", color: "#991B1B", borderColor: "#FECACA" }}>
                    Not verified
                  </span>
                )}
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent"
                    style={{ outlineColor: C.primary }}
                    placeholder="name@example.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    inputMode="email"
                  />
                  <button onClick={sendVerifyLink} disabled={emailLoading} className="px-3 py-2 rounded-lg text-white disabled:opacity-50" style={{ background: C.primary }}>
                    {emailLoading ? "Sending..." : "Send Verify"}
                  </button>
                </div>

                {!!emailMsg && (
                  <div className="mt-2 text-sm" style={{ color: emailMsg.includes("Firebase") ? "#991B1B" : "#166534" }}>
                    {emailMsg}
                  </div>
                )}
              </>
            )}
          </div>

          {hasEmail && <PatientPasswordSection patientDocId={patientDocId} onSaved={() => {}} color={C.primary} />}

          <div className="mt-4 flex items-center justify-end">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border">
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800 text-right">{value}</span>
    </div>
  );
}

function PatientPasswordSection({ patientDocId, onSaved, color = C.primary }) {
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("");

  const passValidation = (() => {
    const p = String(newPass || "");
    if (!p) return { ok: false, msg: "Password is required" };
    if (p.length < 8) return { ok: false, msg: "At least 8 characters required" };
    if (!/[a-z]/.test(p)) return { ok: false, msg: "Must include lowercase letter" };
    if (!/[A-Z]/.test(p)) return { ok: false, msg: "Must include uppercase letter" };
    if (!/\d/.test(p)) return { ok: false, msg: "Must include number" };
    return { ok: true, msg: "Password meets requirements" };
  })();

  const doUpdate = async () => {
    try {
      setMsg("");
      setMsgType("");

      if (!oldPass || !newPass || !confirmPass) {
        setMsg("Please fill all fields");
        setMsgType("error");
        return;
      }
      if (!passValidation.ok) {
        setMsg(passValidation.msg);
        setMsgType("error");
        return;
      }
      if (newPass !== confirmPass) {
        setMsg("New passwords do not match");
        setMsgType("error");
        return;
      }
      if (oldPass === newPass) {
        setMsg("New password must be different");
        setMsgType("error");
        return;
      }

      setLoading(true);

      const ref = doc(db, "patients", patientDocId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setMsg("Patient record not found");
        setMsgType("error");
        setLoading(false);
        return;
      }
      const data = snap.data();

      const ok = await verifyPatientPassword(oldPass, data);
      if (!ok) {
        setMsg("Current password is incorrect");
        setMsgType("error");
        setLoading(false);
        return;
      }

      const payload = await buildPBKDF2Update(newPass, Number(data?.passwordIter) || parseItersFromAlgo(data?.passwordAlgo) || 100_000);

      // تنظيف أي حقل password قديم إن وجد
      if (data?.password) payload.password = deleteField();

      await updateDoc(ref, payload);

      setMsg("Password updated successfully! ✓");
      setMsgType("success");
      setOldPass("");
      setNewPass("");
      setConfirmPass("");
      onSaved?.({ passwordUpdated: true });
    } catch (e) {
      setMsg(e?.message || "Failed to update password");
      setMsgType("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-gray-200">
      <div className="flex items-center gap-2 mb-4">
        <Lock size={18} style={{ color }} />
        <h4 className="font-semibold text-gray-800">Change Password</h4>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm text-gray-700 mb-1">
            Current Password <span className="text-rose-600">*</span>
          </label>
          <div className="relative">
            <input
              type={showOld ? "text" : "password"}
              value={oldPass}
              onChange={(e) => setOldPass(e.target.value)}
              className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:border-transparent"
              style={{ outlineColor: color }}
              placeholder="Enter current password"
            />
            <button
              type="button"
              onClick={() => setShowOld((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {showOld ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">
            New Password <span className="text-rose-600">*</span>
          </label>
          <div className="relative">
            <input
              type={showNew ? "text" : "password"}
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:border-transparent"
              style={{ outlineColor: color }}
              placeholder="Enter new password"
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {newPass && (
            <div className={`text-xs mt-1 ${passValidation.ok ? "text-green-600" : "text-rose-600"} flex items-center gap-1`}>
              {passValidation.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
              {passValidation.msg}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">
            Confirm New Password <span className="text-rose-600">*</span>
          </label>
          <div className="relative">
            <input
              type={showConfirm ? "text" : "password"}
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:border-transparent"
              style={{ outlineColor: color }}
              placeholder="Confirm new password"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {confirmPass && newPass !== confirmPass && (
            <div className="text-xs mt-1 text-rose-600 flex items-center gap-1">
              <XCircle size={14} />
              Passwords do not match
            </div>
          )}
        </div>

        {msg && (
          <div
            className={`p-3 rounded-lg text-sm ${
              msgType === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-rose-50 text-rose-800 border border-rose-200"
            }`}
          >
            {msg}
          </div>
        )}

        <button
          onClick={doUpdate}
          disabled={loading || !oldPass || !newPass || !confirmPass || newPass !== confirmPass || !passValidation.ok}
          className="w-full py-2.5 rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02]"
          style={{ background: color }}
        >
          {loading ? "Updating..." : "Update Password"}
        </button>
      </div>
    </div>
  );
}
