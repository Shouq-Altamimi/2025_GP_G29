// src/pages/DoctorHeader.jsx
"use client";
import React, { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";
import { db } from "../firebase.js";
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
import { FilePlus2, User, LogOut, X, Eye, EyeOff, Lock, CheckCircle, XCircle } from "lucide-react";
import { getAuth, sendSignInLinkToEmail } from "firebase/auth";

const C = { primary: "#B08CC1", ink: "#4A2C59" };

function pickStr(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

// دوال التشفير SHA-256
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(inputPassword, storedHash) {
  const inputHash = await hashPassword(inputPassword);
  return inputHash === storedHash;
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
  };
}

function validateAndNormalizePhone(raw) {
  const original = String(raw || "").trim();
  if (/\s/.test(original)) return { ok: false, reason: "No spaces allowed." };
  if (/[٠-٩۰-۹]/.test(original)) return { ok: false, reason: "English digits only (0-9)." };
  if (!/^\+?[0-9]+$/.test(original))
    return { ok: false, reason: "Digits 0-9 only (and optional leading +)." };
  if (/^05\d{8}$/.test(original)) {
    const last8 = original.slice(2);
    return { ok: true, normalized: `+9665${last8}` };
  }
  if (/^\+9665\d{8}$/.test(original)) return { ok: true, normalized: original };
  return { ok: false, reason: "Must start with 05 or +9665 followed by 8 digits." };
}

export default function DoctorHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const isPatientPage = location.pathname.includes("/patient");
  const isDoctorPage =
    location.pathname.startsWith("/doctor") ||
    location.pathname.startsWith("/prescriptions");

  const [open, setOpen] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [doctor, setDoctor] = useState(null);
  const [doctorDocId, setDoctorDocId] = useState(null);

  useEffect(() => {
    if (!isDoctorPage) return;

    (async () => {
      const role = localStorage.getItem("userRole");
      const userDoctorID = localStorage.getItem("userId");

      if (role !== "doctor" || !userDoctorID) {
        setDoctor(null);
        setDoctorDocId(null);
        setOpen(false);
        setShowAccount(false);
        sessionStorage.removeItem("td_doctor");
        return;
      }

      try {
        const qy = query(
          collection(db, "doctors"),
          where("DoctorID", "==", String(userDoctorID)),
          fsLimit(1)
        );
        const qs = await getDocs(qy);

        if (!qs.empty) {
          const d = qs.docs[0];
          const norm = normalizeDoctor(d.data());
          setDoctor(norm);
          setDoctorDocId(d.id);

          sessionStorage.setItem(
            "td_doctor",
            JSON.stringify({
              DoctorID: norm?.DoctorID || String(userDoctorID),
              name: norm?.name || "",
              phone: norm?.phone || "",
              email: norm?.email || "",
              healthFacility: norm?.healthFacility || "",
              speciality: norm?.speciality || "",
            })
          );
          return;
        }

        setDoctor(null);
        setDoctorDocId(null);
        sessionStorage.removeItem("td_doctor");
      } catch (e) {
        console.error("Load doctor by DoctorID failed:", e);
        setDoctor(null);
        setDoctorDocId(null);
        sessionStorage.removeItem("td_doctor");
      }
    })();
  }, [isDoctorPage]);

  function signOut() {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userId");
    sessionStorage.removeItem("td_patient");
    sessionStorage.removeItem("td_doctor");
    navigate("/auth");
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header
        hideMenu={isPatientPage}
        onMenuClick={() => {
          if (isDoctorPage && doctorDocId) setOpen(true);
        }}
      />
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />

      {isDoctorPage && doctorDocId && (
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
                active={location.pathname.startsWith("/doctor")}
                onClick={() => {
                  navigate("/doctor");
                  setOpen(false);
                }}
              >
                <FilePlus2 size={18} />
                <span>Create Prescription</span>
              </DrawerItem>

              <DrawerItem
                onClick={() => {
                  setShowAccount(true);
                  setOpen(false);
                }}
              >
                <User size={18} />
                <span>My Account</span>
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
          onSaved={(d) => setDoctor((prev) => ({ ...prev, ...d }))}
        />
      )}
    </div>
  );
}

function DrawerItem({ children, onClick, active = false, variant = "solid" }) {
  const base =
    "w-full mb-3 inline-flex items-center gap-3 px-3 py-3 rounded-xl font-medium transition-colors";
  const styles = active
    ? "bg-white text-[#5B3A70]"
    : variant === "ghost"
    ? "text-white/90 hover:bg-white/10"
    : "bg-white/25 text-white hover:bg-white/35";
  return (
    <button onClick={onClick} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

function AccountModal({ doctor, doctorDocId, onClose, onSaved }) {
  // ===== Phone =====
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

  // ===== Email =====
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
        setEmailMsg("الرجاء إدخال بريد إلكتروني صالح.");
        return;
      }

      const BASE = window.location.origin;
      const params = new URLSearchParams({
        col: "doctors",
        doc: String(doctorDocId || ""),
        e: raw,
        redirect: "/doctor",
      });

      const settings = {
        url: `${BASE}/auth-email?${params.toString()}`,
        handleCodeInApp: true,
      };

      setEmailLoading(true);
      await sendSignInLinkToEmail(getAuth(), raw, settings);

      localStorage.setItem("td_email_pending", JSON.stringify({ email: raw, ts: Date.now() }));
      setEmailMsg("تم إرسال رابط التحقق إلى بريدك. افتحيه ثم ارجعي للتطبيق.");
    } catch (e) {
      console.error("Firebase:", e.code, e.message);
      setEmailMsg(`Firebase: ${e?.code || e?.message || "تعذر إرسال رابط التحقق."}`);
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
              My Account
            </h3>
            <button
              onClick={onClose}
              className="h-8 w-8 grid place-items-center rounded-lg hover:bg-gray-100"
              aria-label="Close"
            >
              ✕
            </button>
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
                  <span
                    className="text-[12px] px-2 py-0.5 rounded-full border"
                    style={{ background: "#F1F8F5", color: "#166534", borderColor: "#BBE5C8" }}
                  >
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
                    <div
                      className="mt-2 text-sm"
                      style={{
                        color: emailMsg.includes("Firebase") ? "#991B1B" : "#166534",
                      }}
                    >
                      {emailMsg}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Password Reset Section - Only show if email is verified */}
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
            <button onClick={onClose} className="px-4 py-2 rounded-lg border">
              Cancel
            </button>
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

// ===== Password Reset Component =====
function PasswordResetSection({ doctor, doctorDocId, onSaved }) {
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('');

  // نفس دالة passwordStrength من Auth.js
  const passwordStrength = (pw) => {
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
  };

  const pwInfo = passwordStrength(newPass);
  
  // إضافة passValidation هنا
  const passValidation = (() => {
    const p = String(newPass || "");
    if (!p) return { ok: false, msg: "Password is required" };
    if (p.length < 8) return { ok: false, msg: "At least 8 characters required" };
    if (!/[a-z]/.test(p)) return { ok: false, msg: "Must include lowercase letter" };
    if (!/[A-Z]/.test(p)) return { ok: false, msg: "Must include uppercase letter" };
    if (!/\d/.test(p)) return { ok: false, msg: "Must include number" };
    return { ok: true, msg: "Password meets requirements" };
  })();
  
  const meetsPolicy = pwInfo.len8 && pwInfo.hasLower && pwInfo.hasUpper && pwInfo.hasDigit;

  const handleResetPassword = async () => {
    try {
      setMsg('');
      setMsgType('');

      console.log('🔐 Starting password reset...');
      console.log('Doctor Doc ID:', doctorDocId);

      if (!oldPass || !newPass || !confirmPass) {
        setMsg('Please fill all fields');
        setMsgType('error');
        return;
      }

      if (!passValidation.ok) {
        setMsg(passValidation.msg);
        setMsgType('error');
        return;
      }

      if (newPass !== confirmPass) {
        setMsg('New passwords do not match');
        setMsgType('error');
        return;
      }

      if (oldPass === newPass) {
        setMsg('New password must be different from old password');
        setMsgType('error');
        return;
      }

      setLoading(true);

      const docRef = doc(db, 'doctors', doctorDocId);
      console.log('📄 Fetching doctor document...');
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        console.error('❌ Doctor document not found');
        setMsg('Doctor record not found');
        setMsgType('error');
        setLoading(false);
        return;
      }

      const currentPassword = docSnap.data().password;
      console.log('Current password in DB:', currentPassword);
      console.log('Old password entered:', oldPass);

      // التحقق من كلمة المرور القديمة
      let isOldCorrect = false;
      
      // فحص إذا كانت الباسوورد مشفرة (SHA-256 = 64 حرف hex)
      const isHashed = currentPassword && currentPassword.length === 64 && /^[a-f0-9]+$/.test(currentPassword);
      console.log('Is password hashed?', isHashed);
      
      if (isHashed) {
        // الباسوورد مشفرة، نستخدم verifyPassword
        isOldCorrect = await verifyPassword(oldPass, currentPassword);
        console.log('Hashed verification result:', isOldCorrect);
      } else {
        // الباسوورد plain text
        isOldCorrect = oldPass === currentPassword;
        console.log('Plain text verification result:', isOldCorrect);
      }

      if (!isOldCorrect) {
        console.error('❌ Current password is incorrect');
        setMsg('Current password is incorrect');
        setMsgType('error');
        setLoading(false);
        return;
      }

      // تشفير الباسوورد الجديدة
      console.log('🔒 Hashing new password...');
      const hashedPassword = await hashPassword(newPass);
      console.log('New hashed password:', hashedPassword);

      // تحديث الباسوورد في Firebase
      console.log('💾 Updating password in Firebase...');
      await updateDoc(docRef, {
        password: hashedPassword,
        passwordUpdatedAt: new Date(),
      });

      console.log('✅ Password updated successfully!');
      setMsg('Password updated successfully! ✓');
      setMsgType('success');
      
      setOldPass('');
      setNewPass('');
      setConfirmPass('');

      onSaved?.({ passwordUpdated: true });

    } catch (error) {
      console.error('❌ Password reset error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      setMsg(error.message || 'Failed to update password');
      setMsgType('error');
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
            />
            <button
              type="button"
              onClick={() => setShowOld(!showOld)}
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
              style={{ outlineColor: C.primary }}
              placeholder="Enter new password"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {newPass && (
            <div className={`text-xs mt-1 flex items-center gap-1 ${passValidation.ok ? 'text-green-600' : 'text-rose-600'}`}>
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
              style={{ outlineColor: C.primary }}
              placeholder="Confirm new password"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
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
          <div className={`p-3 rounded-lg text-sm ${
            msgType === 'success' 
              ? 'bg-green-50 text-green-800 border border-green-200' 
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}>
            {msg}
          </div>
        )}

        <button
          onClick={handleResetPassword}
          disabled={loading || !oldPass || !newPass || !confirmPass || newPass !== confirmPass || !passValidation.ok}
          className="w-full py-2.5 rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02]"
          style={{ background: C.primary }}
        >
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </div>

    </div>
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