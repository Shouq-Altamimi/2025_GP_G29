// src/pages/DoctorHeader.jsx
"use client";
import React, { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";
import { db } from "../firebase.js";
import {
  collection, doc, getDoc, getDocs,
  query, where, limit as fsLimit,
  updateDoc, deleteField, serverTimestamp,
} from "firebase/firestore";
import {
  FilePlus2, User, LogOut, X, Eye, EyeOff, Lock,
  CheckCircle, XCircle, Circle
} from "lucide-react";
import { getAuth, sendSignInLinkToEmail } from "firebase/auth";

const C = { primary: "#B08CC1", ink: "#4A2C59" };

function pickStr(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

async function sha256Hex(str) {
  const data = new TextEncoder().encode(String(str));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
async function pbkdf2Hex(password, saltB64, iter = 100000) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(password)),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const salt = Uint8Array.from(atob(String(saltB64)), c => c.charCodeAt(0));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: Number(iter) || 100000 },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(bits))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
function randomSaltB64(len = 16) {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf));
}
const isHex64 = (s) => typeof s === "string" && /^[a-f0-9]{64}$/i.test(s);

async function verifyCurrentPassword(docData, inputPwd) {
  const cur = String(inputPwd ?? "").trim();

  if (docData?.tempPassword?.valid && docData?.tempPassword?.value) {
    if (cur === String(docData.tempPassword.value)) return { ok: true, mode: "TEMP" };
  }

  if (
    docData?.passwordAlgo === "PBKDF2-SHA256" &&
    docData?.passwordSalt &&
    docData?.passwordIter &&
    docData?.passwordHash
  ) {
    const h = await pbkdf2Hex(cur, docData.passwordSalt, docData.passwordIter);
    if (h === String(docData.passwordHash)) return { ok: true, mode: "PBKDF2" };
  }

  if (docData?.passwordHash && !docData?.passwordSalt) {
    const h = await sha256Hex(cur);
    if (h === String(docData.passwordHash)) return { ok: true, mode: "SHA256_LEGACY_hashField" };
  }

  if (docData?.password) {
    const p = String(docData.password);
    if (isHex64(p)) {
      const h = await sha256Hex(cur);
      if (h === p) return { ok: true, mode: "SHA256_LEGACY_passwordField" };
    } else if (cur === p) {
      return { ok: true, mode: "PLAINTEXT_LEGACY" };
    }
  }

  return { ok: false };
}

function normalizeDoctor(raw) {
  if (!raw) return null;
  return {
    name: pickStr(raw, ["name"]),
    healthFacility: pickStr(raw, ["healthFacility"]),
    speciality: pickStr(raw, ["speciality"]),
    licenseNumber: pickStr(raw, ["licenseNumber"]),
    DoctorID: pickStr(raw, ["DoctorID"]),
    phone: pickStr(raw, ["phone"]),
    email: pickStr(raw, ["email"]),
    password: raw?.password || "",
    requirePasswordChange: raw?.requirePasswordChange ?? false,
    passwordUpdatedAt: raw?.passwordUpdatedAt ?? null,
  };
}

function validateAndNormalizePhone(raw) {
  const original = String(raw || "").trim();
  if (/\s/.test(original)) return { ok: false, reason: "No spaces allowed." };
  if (/[٠-٩۰-۹]/.test(original)) return { ok: false, reason: "English digits only (0–9)." };
  if (!/^\+?[0-9]+$/.test(original)) return { ok: false, reason: "Digits 0–9 only (and optional leading +)." };
  if (/^05\d{8}$/.test(original)) {
    const last8 = original.slice(2);
    return { ok: true, normalized: `+9665${last8}` };
  }
  if (/^\+9665\d{8}$/.test(original)) return { ok: true, normalized: original };
  return { ok: false, reason: "Must start with 05 or +9665 followed by 8 digits." };
}

function AlertBanner({ children }) {
  return (
    <div style={{ margin: "0 24px 16px 24px" }}>
      <div
        style={{
          background: "#fff5cc",
          color: "#8a6d3b",
          padding: "12px",
          borderRadius: "10px",
          textAlign: "center",
          border: "1px solid #ffe8a1",
          fontWeight: 500,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function DoctorHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const isDoctorPage = location.pathname.startsWith("/doctor");

  const [open, setOpen] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [doctor, setDoctor] = useState(null);
  const [doctorDocId, setDoctorDocId] = useState(null);

  const [showEmailAlert, setShowEmailAlert] = useState(false);
  const [showResetAlert, setShowResetAlert] = useState(false);

  useEffect(() => {
    if (!isDoctorPage) return;
    (async () => {
      const role = localStorage.getItem("userRole");
      const userDoctorID = localStorage.getItem("userId");

      if (role !== "doctor" || !userDoctorID) return;

      const qy = query(collection(db, "doctors"), where("DoctorID", "==", String(userDoctorID)), fsLimit(1));
      const qs = await getDocs(qy);
      if (!qs.empty) {
        const d = qs.docs[0];
        const norm = normalizeDoctor(d.data());
        setDoctor(norm);
        setDoctorDocId(d.id);
        setShowEmailAlert(!norm.email);
        setShowResetAlert(
          norm.requirePasswordChange === true ||
          (!!norm.email && !norm.passwordUpdatedAt)
        );
      }
    })();
  }, [isDoctorPage, location.pathname]);

  function signOut() {
    localStorage.clear();
    sessionStorage.clear();
    navigate("/auth");
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header
        hideMenu={false}
        onMenuClick={() => {
          if (isDoctorPage && doctorDocId) setOpen(true);
        }}
      />

      {/* Alerts */}
      {showEmailAlert && (
        <AlertBanner>
          ⚠️ You haven’t added an email address yet. <br />
          Please add your email from{" "}
          <button
            onClick={() => setShowAccount(true)}
            style={{ fontWeight: 700, color: C.primary }}
          >
            My Profile
          </button>{" "}
          to activate your account and receive notifications.
        </AlertBanner>
      )}

      {showResetAlert && (
        <AlertBanner>
          ⚠️ You need to set your password. <br />
          Please open{" "}
          <button
            onClick={() => setShowAccount(true)}
            style={{ fontWeight: 700, color: C.primary }}
          >
            My Profile
          </button>{" "}
          and change your password to continue.
        </AlertBanner>
      )}

      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />

      {/* Sidebar */}
      {isDoctorPage && doctorDocId && (
        <>
          <div
            onClick={() => setOpen(false)}
            className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
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
              <button onClick={() => setOpen(false)} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-white/20 text-white">
                <X size={18} />
              </button>
            </div>

            <nav className="px-3">
              <DrawerItem
                active={location.pathname.startsWith("/doctor")}
                onClick={() => { navigate("/doctor"); setOpen(false); }}
              >
                <FilePlus2 size={18} />
                <span>Create Prescription</span>
              </DrawerItem>

              <DrawerItem
                onClick={() => { setShowAccount(true); setOpen(false); }}
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

      {showAccount && doctorDocId && (
        <AccountModal
          doctor={doctor}
          doctorDocId={doctorDocId}
          onClose={() => setShowAccount(false)}
          onSaved={(d) => {
            setDoctor((prev) => ({ ...prev, ...d }));
            if (d.email) setShowEmailAlert(false);
            if (d.requirePasswordChange === false) setShowResetAlert(false);
          }}
        />
      )}
    </div>
  );
}

function DrawerItem({ children, onClick, active = false, variant = "solid" }) {
  const base = "w-full mb-3 inline-flex items-center gap-3 px-3 py-3 rounded-xl font-medium transition-colors";
  const styles = active
    ? "bg-white text-[#5B3A70]"
    : variant === "ghost"
    ? "text-white/90 hover:bg-white/10"
    : "bg-white/25 text-white hover:bg-white/35";
  return <button onClick={onClick} className={`${base} ${styles}`}>{children}</button>;
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
   Account modal
   ========================= */
function AccountModal({ doctor, doctorDocId, onClose, onSaved }) {
  const [phone, setPhone] = useState(doctor?.phone || "");
  const [phoneInfo, setPhoneInfo] = useState({ ok: false, reason: "", normalized: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => setPhoneInfo(validateAndNormalizePhone(phone)), [phone]);
  const canSave = phoneInfo.ok && !saving;

  async function save() {
    const pInfo = validateAndNormalizePhone(phone);
    if (!pInfo.ok) {
      setMsg(pInfo.reason || "Invalid phone.");
      return;
    }
    if (!doctorDocId) {
      setMsg("Doctor record not found.");
      return;
    }
    try {
      setSaving(true);
      setMsg("");
      const payload = { phone: pInfo.normalized, updatedAt: new Date(), phoneLocal: deleteField() };
      await updateDoc(doc(db, "doctors", doctorDocId), payload);
      onSaved?.({ phone: payload.phone });
      setMsg("Saved ✓");
      setTimeout(() => onClose?.(), 600);
    } catch (e) {
      setMsg(e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  // Email
  const [emailInput, setEmailInput] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const hasEmail = !!doctor?.email;

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
        col: "doctors",
        doc: String(doctorDocId || ""),
        e: raw,
        redirect: "/doctor",
      });

      const settings = { url: `${BASE}/auth-email?${params.toString()}`, handleCodeInApp: true };
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
            <h3 className="text-lg font-semibold" style={{ color: C.ink }}>My Profile</h3>
            <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-gray-100" aria-label="Close">✕</button>
          </div>

          <div className="space-y-3 text-sm">
            <Row label="Name" value={doctor?.name || "—"} />
            <Row label="Health Facility" value={doctor?.healthFacility || "—"} />
            <Row label="Speciality" value={(doctor?.speciality || "—").trim()} />
            <Row label="Doctor ID" value={doctor?.DoctorID || "—"} />
            <Row label="License No." value={doctor?.licenseNumber || "—"} />

            {/* Phone */}
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Phone <span className="text-rose-600">*</span>
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05xxxxxxxx or +9665xxxxxxxx (no spaces)"
                inputMode="tel"
                pattern="[+0-9]*"
                dir="ltr"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent"
                style={{ outlineColor: C.primary }}
                onKeyDown={(e) => {
                  if (e.key === " " || /[٠-٩۰-۹]/.test(e.key)) e.preventDefault();
                }}
              />
              <div style={{ marginTop: 6, fontSize: 12 }}>
                {!phone && <span style={{ color: "#888" }}>Enter phone starting with 05 or +9665</span>}
                {phone && !phoneInfo.ok && <span style={{ color: "#b91c1c" }}>{phoneInfo.reason}</span>}
              </div>
            </div>

            {/* Email */}
            <div className="mt-3">
              <label className="block text-sm text-gray-700 mb-1">Email</label>

              {hasEmail ? (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800">{doctor.email}</span>
                  <span className="text-[12px] px-2 py-0.5 rounded-full border" style={{ background: "#F1F8F5", color: "#166534", borderColor: "#BBE5C8" }}>
                    Verified
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
                    <div className="mt-2 text-sm" style={{ color: emailMsg.includes("Firebase") ? "#991B1B" : "#166534" }}>
                      {emailMsg}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Password (only if email exists) */}
            {hasEmail && (
              <PasswordResetSection
                doctor={doctor}
                doctorDocId={doctorDocId}
                onSaved={onSaved}
              />
            )}

            {!!msg && <div className="text-sm">{msg}</div>}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border">Cancel</button>
            <button
              onClick={save}
              disabled={!canSave}
              className="px-4 py-2 rounded-lg text-white disabled:opacity-50"
              style={{ background: C.primary }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* =========================
   Password Reset
   ========================= */
function PasswordResetSection({ doctor, doctorDocId, onSaved }) {
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("");

  const showReqs = (newPass || "").length > 0;

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

  const passOk = st.hasLower && st.hasUpper && st.hasDigit && st.len8;

  function Req({ ok, label }) {
    return (
      <div className="flex items-center gap-2 text-sm leading-6">
        {ok ? <CheckCircle size={18} className="text-green-600" /> : <Circle size={18} className="text-gray-400" />}
        <span className={ok ? "text-green-700" : "text-gray-700"}>{label}</span>
      </div>
    );
  }

  const handleResetPassword = async () => {
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
        setMsg("New password must be different from old password");
        setMsgType("error");
        return;
      }

      setLoading(true);

      const docRef = doc(db, "doctors", doctorDocId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        setMsg("Doctor record not found");
        setMsgType("error");
        setLoading(false);
        return;
      }

      const data = snap.data();

      // 1) verify current with smart verifier
      const v = await verifyCurrentPassword(data, oldPass);
      if (!v.ok) {
        setMsg("Current password is incorrect");
        setMsgType("error");
        setLoading(false);
        return;
      }

      // 2) upgrade to PBKDF2
      const salt = randomSaltB64(16);
      const iter = 100000;
      const newHash = await pbkdf2Hex(newPass, salt, iter);

      await updateDoc(docRef, {
        passwordAlgo: "PBKDF2-SHA256",
        passwordSalt: salt,
        passwordIter: iter,
        passwordHash: newHash,
        passwordUpdatedAt: serverTimestamp(),
        requirePasswordChange: false,

        // invalidate tempPassword
        "tempPassword.valid": false,
        "tempPassword.expiresAtMs": 0,
        "tempPassword.value": deleteField(),

        // remove any legacy/plain fields
        password: deleteField(),
      });

      setMsg("Password updated successfully! ✓");
      setMsgType("success");
      setOldPass("");
      setNewPass("");
      setConfirmPass("");

      onSaved?.({ requirePasswordChange: false, passwordUpdatedAt: new Date() });
    } catch (error) {
      console.error(error);
      setMsg(error?.message || "Failed to update password");
      setMsgType("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-gray-200">
      <div className="flex items-center gap-2 mb-4">
        <Lock size={18} style={{ color: C.primary }} />
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
              onChange={(e) => setNewPass(e.target.value)}
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

          {showReqs && (
            <>
              <div className="mt-3 flex flex-col gap-2">
                <Req ok={st.hasUpper}  label="Uppercase (A–Z)" />
                <Req ok={st.hasLower}  label="Lowercase (a–z)" />
                <Req ok={st.hasDigit}  label="Digit (0–9)" />
                <Req ok={st.hasSymbol} label="Symbol (!@#$…)" />
                <Req ok={st.len8}      label="Length ≥ 8" />
              </div>

              <div className="mt-3">
                <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${st.width}%`, background: st.color }} />
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

        <button
          onClick={handleResetPassword}
          disabled={
            loading ||
            !oldPass ||
            !newPass ||
            !confirmPass ||
            newPass !== confirmPass ||
            !passOk
          }
          className="w-full py-2.5 rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02]"
          style={{ background: C.primary }}
        >
          {loading ? "Updating..." : "Update Password"}
        </button>
      </div>
    </div>
  );
}
