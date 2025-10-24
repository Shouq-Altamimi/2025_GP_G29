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
import {
  User,
  LogOut,
  X,
  Eye,
  EyeOff,
  Lock,
  CheckCircle,
  XCircle,
  Circle,
} from "lucide-react";

const C = { primary: "#B08CC1", ink: "#4A2C59" };

/* =========================
   Crypto helpers
   ========================= */
const enc = new TextEncoder();
function bytesToHex(arr) {
  return [...new Uint8Array(arr)].map((b) => b.toString(16).padStart(2, "0")).join("");
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
function parseItersFromAlgo(algo) {
  const m = String(algo || "").toLowerCase().match(/(\d+)\s*k/);
  if (m) return parseInt(m[1], 10) * 1000;
  return 100_000;
}
async function verifyPatientPassword(inputPw, docData) {
  const algo = String(docData?.passwordAlgo || "").toUpperCase();

  // PBKDF2
  if (algo.startsWith("PBKDF2") && docData?.passwordHash && docData?.passwordSalt) {
    const iters = Number(docData?.passwordIter) || parseItersFromAlgo(algo) || 100_000;
    const saltBytes = base64ToBytes(docData.passwordSalt);
    const derived = await pbkdf2HashBase64(inputPw, saltBytes, iters, 32);
    return derived === docData.passwordHash;
  }

  // SHA-256 hex
  if (docData?.password && /^[a-f0-9]{64}$/i.test(docData.password)) {
    const hex = await sha256Hex(inputPw);
    return hex.toLowerCase() === String(docData.password).toLowerCase();
  }

  // Legacy plain
  if (typeof docData?.password === "string") return inputPw === docData.password;

  return false;
}
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
   Data helpers
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
      if (!pid) return;

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
    })();
  }, []);

  // open My Profile from Patient.jsx alert button
  useEffect(() => {
    const openProfile = () => setShowProfile(true);
    window.addEventListener("openPatientProfile", openProfile);
    return () => window.removeEventListener("openPatientProfile", openProfile);
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

      {/* child routes */}
      <div className="flex-1">
        <Outlet />
      </div>

      <Footer />

      {/* Sidebar */}
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

      {/* My Profile modal */}
      {showProfile && (
        <PatientProfileModal patient={patient} patientDocId={patientDocId} onClose={() => setShowProfile(false)} />
      )}
    </div>
  );
}

/* =========================
   Shared UI
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

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800 text-right">{value}</span>
    </div>
  );
}

/* =========================
   My Profile modal
   ========================= */
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
        url: `${BASE}/auth-email?${params.toString()}`,
        handleCodeInApp: true,
      };
      setEmailLoading(true);
      await sendSignInLinkToEmail(getAuth(), raw, settings);
      localStorage.setItem("td_email_pending", JSON.stringify({ email: raw, ts: Date.now() }));
      setEmailMsg("A verification link has been sent to your email. Open it, then return to the app.");
    } catch (e) {
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
                <span
                  className="text-[12px] px-2 py-0.5 rounded-full border"
                  style={{ background: "#F1F8F5", color: "#166534", borderColor: "#BBE5C8" }}
                >
                  Verified / On File
                </span>
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
                  <button
                    onClick={sendVerifyLink}
                    disabled={emailLoading}
                    className="px-3 py-2 rounded-lg text-white disabled:opacity-50"
                    style={{ background: C.primary }}
                  >
                    {emailLoading ? "Sending..." : "Send Verify"}
                  </button>
                </div>

                {!!emailMsg && (
                  <div className="mt-2 text-sm text-gray-700">
                    {emailMsg}
                  </div>
                )}
              </>
            )}
          </div>

          {hasEmail && (
            <PatientPasswordSection
              patientDocId={patientDocId}
              onSaved={() => {}}
              color={C.primary}
            />
          )}

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

/* =========================
   Password Section (checklist + strength on typing)
   ========================= */
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

  // ✅ show checklist + bar only when the user starts typing
  const showReqs = (newPass || "").length > 0;

  // ===== inline passwordStrength (no extra file) =====
  function passwordStrength(pw) {
    const p = String(pw || "");
    let score = 0;
    const hasLower = /[a-z]/.test(p);
    const hasUpper = /[A-Z]/.test(p);
    const hasDigit = /\d/.test(p);
    const hasSymbol = /[^A-Za-z0-9]/.test(p);
    const len8 = p.length >= 8;
    const len12 = p.length >= 12;

    if (len8) score++;
    if (hasLower) score++;
    if (hasUpper) score++;
    if (hasDigit) score++;
    if (hasSymbol) score++;
    if (len12) score++;

    let label = "Weak";
    let color = "#ef4444";
    if (score >= 4) { label = "Medium"; color = "#f59e0b"; }
    if (score >= 5) { label = "Strong"; color = "#10b981"; }

    const width = Math.min(100, Math.round((score / 6) * 100));
    return { score, label, color, width, hasLower, hasUpper, hasDigit, hasSymbol, len8 };
  }

  const st = passwordStrength(newPass);
  // Enable submit if (Upper + Lower + Digit + Length ≥ 8). Symbol optional.
  const passOk = st.hasLower && st.hasUpper && st.hasDigit && st.len8;

  function Req({ ok, label }) {
    return (
      <div className="flex items-center gap-2 text-sm leading-6">
        {ok ? <CheckCircle size={18} className="text-green-600" /> : <Circle size={18} className="text-gray-400" />}
        <span className={ok ? "text-green-700" : "text-gray-700"}>{label}</span>
      </div>
    );
  }

  const doUpdate = async () => {
    try {
      setMsg(""); setMsgType("");

      if (!oldPass || !newPass || !confirmPass) {
        setMsg("Please fill all fields");
        setMsgType("error");
        return;
      }
      if (!passOk) {
        setMsg("Please meet all password requirements");
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

      const payload = await buildPBKDF2Update(
        newPass,
        Number(data?.passwordIter) || parseItersFromAlgo(data?.passwordAlgo) || 100_000
      );
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
        {/* Current */}
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
              style={{ outlineColor: C.primary }}
              placeholder="Enter current password"
              autoComplete="current-password"
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

        {/* New */}
        <div>
          <label className="block text-sm text-gray-700 mb-1">
            New Password <span className="text-rose-600">*</span>
          </label>
          <div className="relative">
            <input
              type={showNew ? "text" : "password"}
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)} // show requirements on typing
              className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:border-transparent"
              style={{ outlineColor: C.primary }}
              placeholder="Enter new password"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* ✅ Requirements in a single column */}
          {showReqs && (
            <>
              <div className="mt-3 flex flex-col gap-2">
                <Req ok={st.hasUpper}  label="Uppercase (A–Z)" />
                <Req ok={st.hasLower}  label="Lowercase (a–z)" />
                <Req ok={st.hasDigit}  label="Digit (0–9)" />
                <Req ok={st.hasSymbol} label="Symbol (!@#$…)" />
                <Req ok={st.len8}      label="Length ≥ 8" />
              </div>

              {/* Strength bar */}
              <div className="mt-3">
                <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{ width: `${st.width}%`, background: st.color }}
                  />
                </div>
                <div className="mt-2 text-sm">
                  Strength: <span style={{ color: st.color, fontWeight: 700 }}>{st.label}</span>
                  <span className="text-gray-600"> &nbsp; (min 8 chars, include a–z, A–Z, 0–9)</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Confirm */}
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
              style={{ outlineColor: C.primary }}
              placeholder="Confirm new password"
              autoComplete="new-password"
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

        {/* Status */}
        {msg && (
          <div
            className={`p-3 rounded-lg text-sm ${
              msgType === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-rose-50 text-rose-800 border border-rose-200"
            }`}
          >
            {msg}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={doUpdate}
          disabled={
            loading ||
            !oldPass ||
            !newPass ||
            !confirmPass ||
            newPass !== confirmPass ||
            !passOk
          }
          className="w-full py-2.5 rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02]"
          style={{ background: color }}
        >
          {loading ? "Updating..." : "Update Password"}
        </button>
      </div>
    </div>
  );
}
