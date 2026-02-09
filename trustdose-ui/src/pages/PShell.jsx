// src/pages/PShell.jsx
"use client";
import React, { useEffect, useState, useRef } from "react";
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
  serverTimestamp,
} from "firebase/firestore";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  sendSignInLinkToEmail,
} from "firebase/auth";
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
   Bell,
  FileText,
} from "lucide-react";

const C = { primary: "#B08CC1", ink: "#4A2C59" };


async function ensureAuthReady() {
  const auth = getAuth();
  if (!auth.currentUser) {
    try {
      await signInAnonymously(auth);
    } catch {}
  }
  await new Promise((res) => onAuthStateChanged(auth, (u) => u && res()));
  return auth;
}


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
  const keyMat = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
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

  if (algo.startsWith("PBKDF2") && docData?.passwordHash && docData?.passwordSalt) {
    const iters = Number(docData?.passwordIter) || parseItersFromAlgo(algo) || 100_000;
    const saltBytes = base64ToBytes(docData.passwordSalt);
    const derived = await pbkdf2HashBase64(inputPw, saltBytes, iters, 32);
    return derived === docData.passwordHash;
  }

  if (docData?.password && /^[a-f0-9]{64}$/i.test(docData.password)) {
    const hex = await sha256Hex(inputPw);
    return hex.toLowerCase() === String(docData.password).toLowerCase();
  }

  
  if (typeof docData?.password === "string") return inputPw === docData.password;

  return false;
}
async function buildPBKDF2Update(newPassword, iterations = 100_000) {
  const iters = Math.max(50_000, Math.min(300_000, iterations));
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hashB64 = await pbkdf2HashBase64(newPassword, salt, iters, 32);
  return {
    passwordAlgo: `PBKDF2-SHA256-${Math.round(iters / 1000)}k`,
    passwordIter: iters,
    passwordSalt: bytesToBase64(salt),
    passwordHash: hashB64,
    passwordUpdatedAt: new Date(),
  };
}


function hasArabic(str) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(
    String(str || "")
  );
}
function toEnglishDigits(s) {
  if (!s) return "";
  let out = "";
  for (const ch of String(s)) {
    const code = ch.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660);
    else if (code >= 0x06f0 && code <= 0x06f9) out += String(code - 0x06f0);
    else out += ch;
  }
  return out;
}
function isDigitsLike(s) {
  return /^\+?\d+$/.test(s || "");
}
function validateAndNormalizePhone(raw) {
  const original = String(raw || "");

  if (hasArabic(original)) {
    return { ok: false, reason: "Arabic characters not allowed." };
  }

  if (/\s/.test(original)) {
    return { ok: false, reason: "Phone number must not contain spaces." };
  }

  const cleaned = toEnglishDigits(original).trim();
  if (!isDigitsLike(cleaned)) {
    return {
      ok: false,
      reason: "Phone should contain digits only (and optional leading +).",
    };
  }

  if (/^05\d{8}$/.test(cleaned)) {
    const last8 = cleaned.slice(2);
    return { ok: true, normalized: `+9665${last8}` };
  }

  if (/^\+9665\d{8}$/.test(cleaned)) {
    return { ok: true, normalized: cleaned };
  }

  if (/^9665\d{8}$/.test(cleaned)) {
    const last8 = cleaned.slice(4);
    return { ok: true, normalized: `+9665${last8}` };
  }

  return {
    ok: false,
    reason: "Phone must start with 5 followed by 8 digits (e.g., +9665xxxxxxxx)",
  };
}


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
      await ensureAuthReady();

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
        const r1 = await getDocs(query(col, where("nationalId", "==", String(pid)), fsLimit(1)));
        if (!r1.empty) {
          const d = r1.docs[0];
          setPatient(normalizePatient(d.data()));
          setPatientDocId(d.id);
          return;
        }
      } catch {}

      try {
        const col = collection(db, "patients");
        const r2 = await getDocs(
          query(col, where("nationalID", "==", String(pid)), fsLimit(1))
        );
        if (!r2.empty) {
          const d = r2.docs[0];
          setPatient(normalizePatient(d.data()));
          setPatientDocId(d.id);
          return;
        }
      } catch {}
    })();
  }, []);

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

      <div className="flex-1">
        <Outlet />
      </div>

      <Footer />

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
  active={location.pathname === "/patient"}
  onClick={() => {
    navigate("/patient");
    setOpen(false);
  }}
>
  <FileText size={18} />
  <span>My Prescriptions</span>
</DrawerItem>


             <DrawerItem
  active={location.pathname === "/patient/notifications"}
  onClick={() => {
    navigate("/patient/notifications");
    setOpen(false);
  }}
>
  <Bell size={18} />
  <span>Notifications</span>
</DrawerItem>

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

      {showProfile && (
        <PatientProfileModal
          patient={patient}
          patientDocId={patientDocId}
          onClose={() => setShowProfile(false)}
          onSaved={(p) => setPatient((prev) => ({ ...prev, ...p }))}
        />
      )}
    </div>
  );
}


function DrawerItem({ children, onClick, active = false, variant = "solid" }) {
  const base =
    "w-full mb-3 inline-flex items-center gap-3 px-3 py-3 rounded-xl font-medium transition-colors";
  const styles =
    active
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

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800 text-right">{value}</span>
    </div>
  );
}


function PatientProfileModal({ patient, patientDocId, onClose, onSaved }) {
  const P = {
    fullName: patient?.fullName || "—",
    nationalId: patient?.nationalId || "—",
    phone: patient?.phone || "",
    email: patient?.email || "",
    emailVerifiedAt: patient?.emailVerifiedAt || null,
    gender: patient?.gender || "—",
    location: patient?.location || "—",
  };

  const hasEmail = !!P.email;
  const hasPhone = !!P.phone;

  const [editingPhone, setEditingPhone] = useState(false);
  const [phone, setPhone] = useState(P.phone || "");
  const [initialPhone, setInitialPhone] = useState(P.phone || "");
  const [phoneError, setPhoneError] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState("");
  const [phoneMsgType, setPhoneMsgType] = useState("");
  const phoneRef = useRef(null);

  const phoneInfo = validateAndNormalizePhone(phone || "");
  const hasTypedPhone = !!phone && phone !== "+966";

  useEffect(() => {
    setPhone(P.phone || "");
    setInitialPhone(P.phone || "");
    setPhoneError("");
    setPhoneMsg("");
    setPhoneMsgType("");
  }, [P.phone]);

  useEffect(() => {
    if (editingPhone) {
      setTimeout(() => phoneRef.current?.focus(), 0);
    }
  }, [editingPhone]);

  async function isPatientPhoneTaken(normalized, selfId) {
    const snap = await getDocs(
      query(collection(db, "patients"), where("contact", "==", normalized), fsLimit(5))
    );
    return snap.docs.some((d) => d.id !== selfId);
  }

  const canSavePhone =
    editingPhone &&
    !savingPhone &&
    hasTypedPhone &&
    phone.length === 13 &&
    phoneInfo.ok &&
    !phoneError;

  async function savePhone() {
    const info = validateAndNormalizePhone(phone);

    if (!info.ok) {
      setPhoneError(
        info.reason ||
          "The phone number you entered isn’t valid. Please check and try again."
      );
      setPhone("+966");
      return;
    }

    if (!patientDocId) {
      setPhoneError("We couldn’t find your patient record. Please try again.");
      setPhone("+966");
      return;
    }

    if (info.normalized === initialPhone) {
      setPhoneError("The phone number you entered is already saved on your profile.");
      setPhone("+966");
      return;
    }

    try {
      setSavingPhone(true);
      setPhoneMsg("");
      setPhoneMsgType("");

      const taken = await isPatientPhoneTaken(info.normalized, patientDocId);
      if (taken) {
        setPhoneError(
          "The phone number you entered is already registered in our system."
        );
        setPhone("+966");
        setSavingPhone(false);
        return;
      }

      const payload = {
        contact: info.normalized,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "patients", patientDocId), payload);

      setInitialPhone(payload.contact);
      setPhone(payload.contact);
      setPhoneError("");
      setPhoneMsgType("success");
      setPhoneMsg("Saved ✓");
      setEditingPhone(false);
      onSaved?.({ phone: payload.contact });

      setTimeout(() => {
        setPhoneMsg("");
        setPhoneMsgType("");
      }, 1500);
    } catch (e) {
      setPhoneError(
        "Something went wrong while saving your phone number. Please try again."
      );
      setPhone("+966");
    } finally {
      setSavingPhone(false);
    }
  }

  const [emailInput, setEmailInput] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  async function isPatientEmailTaken(emailLower, selfId) {
    const q1 = query(
      collection(db, "patients"),
      where("email", "==", emailLower),
      fsLimit(1)
    );
    const snap = await getDocs(q1);
    if (snap.empty) return false;
    const doc0 = snap.docs[0];
    return doc0.id !== selfId;
  }

  async function sendVerifyLink() {
    try {
      setEmailMsg("");
      const raw = String(emailInput || "").trim().toLowerCase();
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
      if (!ok) {
        setEmailMsg("Please enter a valid email.");
        return;
      }

      const taken = await isPatientEmailTaken(raw, String(patientDocId || ""));
      if (taken) {
        setEmailMsg(
          "This email is already used by another patient. Please use a different email."
        );
        return;
      }

      const auth = await ensureAuthReady();

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
      await sendSignInLinkToEmail(auth, raw, settings);
      localStorage.setItem(
        "td_email_pending",
        JSON.stringify({ email: raw, ts: Date.now() })
      );
      setEmailMsg(
        "A verification link has been sent to your email. Open it, then return to the app."
      );
    } catch (e) {
      setEmailMsg(
        `Firebase: ${e?.code || e?.message || "Unable to send verification link."}`
      );
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
            <h3 className="text-lg font-semibold mb-2" style={{ color: C.ink }}>
              My Profile
            </h3>
            <button
              onClick={onClose}
              className="h-8 w-8 grid place-items-center rounded-lg hover:bg-gray-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="rounded-xl border bg-white p-4 mb-4">
            <div className="text-base font-semibold mb-2" style={{ color: C.ink }}>
              Patient Info
            </div>
            <div className="space-y-2 text-sm">
              <Row label="Full Name" value={P.fullName} />
              <Row label="National ID" value={P.nationalId} />
              <Row label="Gender" value={P.gender} />
              <Row label="Location" value={P.location} />
            </div>
          </div>

<div className="rounded-xl border bg-white p-4">
            <div className="text-base font-semibold mb-2" style={{ color: C.ink }}>
              Contact Info
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-700 font-medium">Phone</span>
                {!editingPhone && (
                  <button
                    onClick={() => {
                      setEditingPhone(true);
                      setPhone("");
                      setPhoneError("");
                      setPhoneMsg("");
                      setPhoneMsgType("");
                    }}
                    className="px-3 py-1.5 rounded-lg text-white"
                    style={{ background: C.primary }}
                  >
                    {hasPhone ? "Update" : "Add"}
                  </button>
                )}
              </div>

              {!editingPhone ? (
                <div className="font-medium text-gray-900">
                  {initialPhone || "—"}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      ref={phoneRef}
                      value={phone}
                      onChange={(e) => {
                        let val = e.target.value;

                        if (hasArabic(val)) return;

                        val = val.replace(/\s/g, "");

                        if (!val.startsWith("+966")) {
                          val = "+966" + val.replace(/^\+?966?/, "");
                        }

                        const afterPrefix = val.slice(4);

                        if (afterPrefix && !/^[0-9]*$/.test(afterPrefix)) return;

                        if (afterPrefix.length > 9) return;

                        setPhone(val);
                        setPhoneError("");
                        setPhoneMsg("");
                        setPhoneMsgType("");
                      }}
                      onPaste={(e) => {
                        e.preventDefault();
                        let paste = e.clipboardData.getData("text").trim();
                        if (hasArabic(paste)) return;

                        paste = paste.replace(/\s/g, "");

                        let local = paste;

                        if (local.startsWith("+966")) {
                          local = local.slice(4);
                        } else if (local.startsWith("966")) {
                          local = local.slice(3);
                        } else if (local.startsWith("05")) {
                          local = local.slice(1);
                        }

                        local = local.replace(/\D/g, "");

                        if (!local.startsWith("5")) {
                          local = "5" + local.replace(/^5*/, "");
                        }

                        local = local.slice(0, 9);

                        const finalVal = "+966" + local;
                        setPhone(finalVal);
                        setPhoneError("");
                        setPhoneMsg("");
                        setPhoneMsgType("");
                      }}
                      placeholder="+966 5xxxxxxxx"
                      inputMode="tel"
                      dir="ltr"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent"
                      style={{ outlineColor: C.primary }}
                      onFocus={() => {
                        if (!phone || phone === "") {
                          setPhone("+966");
                        }
                      }}
                      onBlur={() => {
                        if (phone === "+966") {
                          setPhone("");
                        }
                      }}
                      onKeyDown={(e) => {
                        const allowedControl = [
                          "Backspace",
                          "Delete",
                          "ArrowLeft",
                          "ArrowRight",
                          "Tab",
                          "Home",
                          "End",
                        ];

                        if (e.key === " ") {
                          e.preventDefault();
                          return;
                        }

                        if (allowedControl.includes(e.key)) {
                          if (
                            (e.key === "Backspace" || e.key === "Delete") &&
                            phone.length <= 4
                          ) {
                            e.preventDefault();
                            return;
                          }
                          return;
                        }

                        if (!/^[0-9]$/.test(e.key)) {
                          e.preventDefault();
                          return;
                        }

                        if (phone === "+966" && e.key !== "5") {
                          e.preventDefault();
                          return;
                        }

                        const afterPrefix = phone.slice(4);

                        if (afterPrefix.length >= 9) {
                          e.preventDefault();
                          return;
                        }
                      }}
                    />
                    <button
                      onClick={savePhone}
                      disabled={!canSavePhone}
  className="px-3 py-2 rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: C.primary, color: "#fff" }}
                    >
                      {savingPhone ? "Saving..." : "Save"}
                    </button>
                  </div>

                  <div className="mt-1 text-xs">
                    {(!phone || phone === "+966") && (
                      <span className="text-gray-500">
                        Enter phone: +966 5xxxxxxxx (9 digits after +966)
                      </span>
                    )}

                    {hasTypedPhone && !phoneInfo.ok && (
                      <span className="text-rose-600">
                        {phoneInfo.reason ||
                          "The phone number you entered isn’t valid yet."}
                      </span>
                    )}

                    {hasTypedPhone && phoneInfo.ok && !phoneError && (
                      <span className="text-emerald-700">
                        ✓ Valid phone number
                      </span>
                    )}
                  </div>

                  {phoneError && (
                    <div className="mt-1 text-xs text-rose-600">
                      {phoneError}
                    </div>
                  )}
                </>
              )}

              {phoneMsgType === "success" && !!phoneMsg && (
                <div className="text-green-700 font-medium mt-2">{phoneMsg}</div>
              )}
            </div>

            <div>
              <div className="text-base font-semibold mb-2" style={{ color: C.ink }}>
                Email
              </div>

              {hasEmail ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-gray-800">{P.email}</span>
                  {P.emailVerifiedAt ? (
                    <span
                      className="text-[12px] px-2 py-0.5 rounded-full border"
                      style={{
                        background: "#F1F8F5",
                        color: "#166534",
                        borderColor: "#BBE5C8",
                      }}
                    >
                      Verified
                    </span>
                  ) : (
                    <span
                      className="text-[12px] px-2 py-0.5 rounded-full border"
                      style={{
                        background: "#FEF2F2",
                        color: "#991B1B",
                        borderColor: "#FECACA",
                      }}
                    >
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
                    <button
                      onClick={sendVerifyLink}
                      disabled={emailLoading}
  className="px-3 py-2 rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: C.primary }}
                    >
                      {emailLoading ? "Sending..." : "Send Verify"}
                    </button>
                  </div>

                  {!!emailMsg && (
                    <div
                      className="mt-2 text-sm"
                      style={{
                        color:
                          emailMsg.includes("Firebase") ||
                          emailMsg.includes("already used")
                            ? "#991B1B"
                            : "#166534",
                      }}
                    >
                      {emailMsg}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {hasEmail && (
            <PatientPasswordSection
              patientDocId={patientDocId}
              onSaved={() => {}}
              color={C.primary}
            />
          )}

          
        </div>
      </div>
    </>
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
    let colorLocal = "#ef4444";
    if (score >= 4) {
      label = "Medium";
      colorLocal = "#f59e0b";
    }
    if (score >= 5) {
      label = "Strong";
      colorLocal = "#10b981";
    }

    const width = Math.min(100, Math.round((score / 6) * 100));
    return {
      score,
      label,
      color: colorLocal,
      width,
      hasLower,
      hasUpper,
      hasDigit,
      hasSymbol,
      len8,
    };
  }

  const st = passwordStrength(newPass);
  const passOk = st.hasLower && st.hasUpper && st.hasDigit && st.len8;

  function Req({ ok, label }) {
    return (
      <div className="flex items-center gap-2 text-sm leading-6">
        {ok ? (
          <CheckCircle size={18} className="text-green-600" />
        ) : (
          <Circle size={18} className="text-gray-400" />
        )}
        <span className={ok ? "text-green-700" : "text-gray-700"}>{label}</span>
      </div>
    );
  }

  const doUpdate = async () => {
    try {
      setMsg("");
      setMsgType("");

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
      await ensureAuthReady();

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

      const baseIter =
        Number(data?.passwordIter) || parseItersFromAlgo(data?.passwordAlgo) || 100_000;

      const payload = await buildPBKDF2Update(newPass, baseIter);
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
    <div className="rounded-xl border bg-white p-4 shadow-sm mt-6">
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
                <Req ok={st.hasUpper} label="Uppercase (A–Z)" />
                <Req ok={st.hasLower} label="Lowercase (a–z)" />
                <Req ok={st.hasDigit} label="Digit (0–9)" />
                <Req ok={st.hasSymbol} label="Symbol (!@#$…)" />
                <Req ok={st.len8} label="Length ≥ 8" />
              </div>

              <div className="mt-3">
                <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{ width: `${st.width}%`, background: st.color }}
                  />
                </div>
                <div className="mt-2 text-sm">
                  Strength:{" "}
                  <span style={{ color: st.color, fontWeight: 700 }}>{st.label}</span>
                  <span className="text-gray-600">
                    {" "}
                    &nbsp; (min 8 chars, include a–z, A–Z, 0–9)
                  </span>
                </div>
              </div>
            </>
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
