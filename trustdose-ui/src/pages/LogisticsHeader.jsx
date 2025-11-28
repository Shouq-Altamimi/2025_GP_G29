// src/pages/LogisticsHeader.jsx
"use client";

import React, { useEffect, useState, useRef } from "react";
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
  serverTimestamp,
  deleteField,
} from "firebase/firestore";
import {
  Package,
  Clock,
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
    .map((b) => b.toString(16).padStart(2, "0"))
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
  const salt = Uint8Array.from(atob(String(saltB64)), (c) => c.charCodeAt(0));
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: Number(iter) || 100000,
    },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomSaltB64(len = 16) {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf));
}

const isHex64 = (s) => typeof s === "string" && /^[a-f0-9]{64}$/i.test(s);

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
    reason: "Phone must start with 05 or +9665 (9 digits after 5).",
  };
}

async function verifyCurrentPassword(docData, inputPwd) {
  const cur = String(inputPwd ?? "").trim();

  if (docData?.tempPassword?.valid && docData?.tempPassword?.value) {
    if (cur === String(docData.tempPassword.value)) {
      return { ok: true, mode: "TEMP" };
    }
  }

  if (
    docData?.passwordAlgo === "PBKDF2-SHA256" &&
    docData?.passwordSalt &&
    docData?.passwordIter &&
    docData?.passwordHash
  ) {
    const h = await pbkdf2Hex(cur, docData.passwordSalt, docData.passwordIter);
    if (h === String(docData.passwordHash)) {
      return { ok: true, mode: "PBKDF2" };
    }
  }

  if (docData?.passwordHash && !docData?.passwordSalt) {
    const h = await sha256Hex(cur);
    if (h === String(docData.passwordHash)) {
      return { ok: true, mode: "SHA256_LEGACY_hashField" };
    }
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

function normalizeLogistics(raw) {
  if (!raw) return null;

  return {
    companyName: pickStr(raw, ["companyName", "name"]),
    logisticsId: pickStr(raw, ["logisticsId", "LogisticsID", "accessId"]),
    vehicleId: pickStr(raw, ["vehicleId", "VehicleID"]),
    phone: pickStr(raw, ["phone", "mobile"]),
    email: pickStr(raw, ["email"]),
    requirePasswordChange: raw?.requirePasswordChange ?? false,
    passwordUpdatedAt: raw?.passwordUpdatedAt ?? null,
  };
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


const ALL_USER_COLLECTIONS = [
  "doctors",
  "patients",
  "pharmacies",
  "logistics",
  "admin",
];

const COMMON_EMAIL_DOMAINS = [
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "live.com",
  "student.ksu.edu.sa",
  "ksu.edu.sa",
];

function validateTrustDoseEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  if (!email) return { ok: false, reason: "Please enter a valid email." };

  const match = email.match(/^[^\s@]+@([^\s@]+\.[^\s@]+)$/);
  if (!match) return { ok: false, reason: "Please enter a valid email." };

  const domain = match[1].toLowerCase();
  if (!COMMON_EMAIL_DOMAINS.includes(domain)) {
    return {
      ok: false,
      reason: "Please enter a valid email (e.g. name@gmail.com or name@outlook.com).",
    };
  }

  return { ok: true, email };
}

async function isEmailTakenGlobally(email, selfCollection, selfDocId) {
  const raw = String(email || "").trim();
  if (!raw) return false;

  const candidates = [raw, raw.toLowerCase()];
  for (const col of ALL_USER_COLLECTIONS) {
    for (const value of candidates) {
      const qy = query(
        collection(db, col),
        where("email", "==", value),
        fsLimit(1)
      );
      const snap = await getDocs(qy);
      if (!snap.empty) {
        const d = snap.docs[0];
        if (!(col === selfCollection && d.id === selfDocId)) {
          return true;
        }
      }
    }
  }
  return false;
}


export default function LogisticsHeader() {
  const location = useLocation();
  const navigate = useNavigate();

  const isLogisticsPage = location.pathname.startsWith("/logistics");

  const [open, setOpen] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [user, setUser] = useState(null);
  const [docId, setDocId] = useState(null);

  const [showEmailAlert, setShowEmailAlert] = useState(false);

  useEffect(() => {
    if (!isLogisticsPage) return;

    (async () => {
      const role = localStorage.getItem("userRole");
      const userId = localStorage.getItem("userId");

      if (role !== "logistics" || !userId) return;

      try {
        const qy = query(
          collection(db, "logistics"),
          where("LogisticsID", "==", String(userId)),
          fsLimit(1)
        );
        const snap = await getDocs(qy);
        if (snap.empty) return;

        const d = snap.docs[0];
        const norm = normalizeLogistics(d.data());

        setUser(norm);
        setDocId(d.id);

        setShowEmailAlert(!norm.email);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [isLogisticsPage, location.pathname]);

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
          if (isLogisticsPage && docId) setOpen(true);
        }}
      />

      {showEmailAlert && (
        <AlertBanner>
          ⚠️ Please verify your email so you can change your password later.{" "}
          <button
            onClick={() => setShowAccount(true)}
            style={{ fontWeight: 700, color: C.primary }}
          >
            Open My Profile
          </button>
        </AlertBanner>
      )}

      <div className="flex-1">
        <Outlet />
      </div>

      <Footer />

      {isLogisticsPage && docId && (
        <>
          <div
            onClick={() => setOpen(false)}
            className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
              open ? "opacity-100" : "opacity-0 pointer-events-none"
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
              <img
                src="/Images/TrustDose_logo.png"
                alt="TrustDose"
                className="h-7 w-auto"
              />
              <button
                onClick={() => setOpen(false)}
                className="h-9 w-9 grid place-items-center rounded-lg hover:bg-white/20 text-white"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="px-3">
              <DrawerItem
                active={location.pathname === "/logistics"}
                onClick={() => {
                  navigate("/logistics");
                  setOpen(false);
                }}
              >
                <Package size={18} />
                <span>Delivery Orders</span>
              </DrawerItem>

              <DrawerItem
                active={location.pathname === "/logistics/pending"}
                onClick={() => {
                  navigate("/logistics/pending");
                  setOpen(false);
                }}
              >
                <Clock size={18} />
                <span>Pending Orders</span>
              </DrawerItem>

              <DrawerItem
                onClick={() => {
                  setShowAccount(true);
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

      {showAccount && docId && (
        <AccountModal
          user={user}
          docId={docId}
          onClose={() => setShowAccount(false)}
          onSaved={(d) => {
            setUser((prev) => ({ ...prev, ...d }));
            if (d.email) setShowEmailAlert(false);
          }}
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

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500 font-medium">{label}</span>
      <span className="font-medium text-gray-800 text-right">
        {value || "—"}
      </span>
    </div>
  );
}



function AccountModal({ user, docId, onClose, onSaved }) {
  const [phone, setPhone] = useState(user?.phone || "");
  const [initialPhone, setInitialPhone] = useState(user?.phone || "");
  const [phoneError, setPhoneError] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("");

  const [editingPhone, setEditingPhone] = useState(false);
  const phoneRef = useRef(null);

  const phoneInfo = validateAndNormalizePhone(phone || "");
  const hasTypedPhone = !!phone && phone !== "+966";
  const hasPhone = !!initialPhone;

  useEffect(() => {
    if (editingPhone) {
      setTimeout(() => phoneRef.current?.focus(), 0);
    }
  }, [editingPhone]);

  useEffect(() => {
    setPhone(user?.phone || "");
    setInitialPhone(user?.phone || "");
    setPhoneError("");
  }, [user?.phone]);

  const canSavePhone =
    editingPhone &&
    !saving &&
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
    } else if (!docId) {
      setPhoneError(
        "We couldn’t find your logistics record. Please try again."
      );
      setPhone("+966");
    } else if (info.normalized === initialPhone) {
      setPhoneError(
        "The phone number you entered is already saved on your profile."
      );
      setPhone("+966");
    } else {
      try {
        setSaving(true);
        setMsg("");
        setMsgType("");

        const payload = {
          phone: info.normalized,
          updatedAt: serverTimestamp(),
          phoneLocal: deleteField(),
        };

        await updateDoc(doc(db, "logistics", docId), payload);
        setInitialPhone(payload.phone);
        onSaved?.({ phone: payload.phone });
        setPhoneError("");
        setMsgType("success");
        setMsg("Saved ✓");
        setEditingPhone(false);
        setTimeout(() => {
          setMsg("");
          setMsgType("");
        }, 1500);
      } catch (e) {
        console.error(e);
        setPhoneError(
          "Something went wrong while saving your phone number. Please try again."
        );
        setPhone("+966");
      } finally {
        setSaving(false);
      }
    }
  }

  const [emailInput, setEmailInput] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const hasEmail = !!user?.email;

  async function sendVerifyLink() {
    try {
      setEmailMsg("");

      const v = validateTrustDoseEmail(emailInput);
      if (!v.ok) {
        setEmailMsg(v.reason || "Please enter a valid email.");
        return;
      }
      const email = v.email;

      const taken = await isEmailTakenGlobally(email, "logistics", docId);
      if (taken) {
        setEmailMsg(
          "This email is already used in another account. Please use a different email."
        );
        return;
      }

      const BASE = window.location.origin;
      const params = new URLSearchParams({
        col: "logistics",
        doc: String(docId || ""),
        e: email,
        redirect: "/logistics",
      });

      const settings = {
        url: `${BASE}/auth-email?${params.toString()}`,
        handleCodeInApp: true,
      };
      setEmailLoading(true);
      await sendSignInLinkToEmail(getAuth(), email, settings);

      localStorage.setItem(
        "td_email_pending",
        JSON.stringify({ email, ts: Date.now() })
      );
      setEmailMsg(
        "A verification link has been sent to your email. Open it, then return to the app."
      );
    } catch (e) {
      if (e?.code === "auth/too-many-requests" || e?.code === "auth/quota-exceeded") {
        setEmailMsg("Too many verification emails were requested. Please try again later.");
      } else if (e?.code === "auth/invalid-email") {
        setEmailMsg("Please enter a valid email.");
      } else {
        setEmailMsg(
          `Firebase: ${
            e?.code || e?.message || "Unable to send verification link."
          }`
        );
      }
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
            <button
              onClick={onClose}
              className="h-8 w-8 grid place-items-center rounded-lg hover:bg-gray-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="space-y-5 text-sm" aria-live="polite">
            <div className="rounded-xl border bg-white p-4">
              <div
                className="text-base font-semibold mb-2"
                style={{ color: C.ink }}
              >
                Logistics Provider Info
              </div>
              <div className="space-y-2">
                <Row label="Company" value={user?.companyName || "—"} />
                <Row label="Logistics Provider ID" value={user?.logisticsId || "—"} />
                <Row label="Vehicle ID" value={user?.vehicleId || "—"} />
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div
                className="text-base font-semibold mb-2"
                style={{ color: C.ink }}
              >
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
                        setMsg("");
                        setMsgType("");
                        setPhoneError("");
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

                          if (afterPrefix && !/^[0-9]*$/.test(afterPrefix))
                            return;

                          if (afterPrefix.length > 9) return;

                          setPhone(val);
                          setMsg("");
                          setMsgType("");
                          setPhoneError("");
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
                          setMsg("");
                          setMsgType("");
                          setPhoneError("");
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
                        className="px-3 py-2 rounded-lg disabled:opacity-50"
                        style={{ background: C.primary, color: "#fff" }}
                      >
                        {saving ? "Saving..." : "Save"}
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

                {msgType === "success" && !!msg && (
                  <div className="text-green-700 font-medium mt-2">
                    {msg}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-1 text-gray-700 font-medium">Email</div>

                {hasEmail ? (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800">
                      {user.email}
                    </span>
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
                          color:
                            emailMsg.startsWith("Too many") ||
                            emailMsg.includes("already used") ||
                            emailMsg.startsWith("Please enter") ||
                            emailMsg.startsWith("Firebase")
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
              <PasswordResetSection
                user={user}
                docId={docId}
                onSaved={onSaved}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}



function PasswordResetSection({ user, docId, onSaved }) {
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
    if (score >= 4) {
      label = "Medium";
      color = "#f59e0b";
    }
    if (score >= 5) {
      label = "Strong";
      color = "#10b981";
    }

    const width = Math.min(100, Math.round((score / 6) * 100));
    return {
      score,
      label,
      color,
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
        <span className={ok ? "text-green-700" : "text-gray-700"}>
          {label}
        </span>
      </div>
    );
  }

  const handleResetPassword = async () => {
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
        setMsg("New password must be different from old password");
        setMsgType("error");
        return;
      }

      setLoading(true);

      const docRef = doc(db, "logistics", docId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        setMsg("Logistics record not found");
        setMsgType("error");
        setLoading(false);
        return;
      }

      const data = snap.data();

      const v = await verifyCurrentPassword(data, oldPass);
      if (!v.ok) {
        setMsg("Current password is incorrect");
        setMsgType("error");
        setLoading(false);
        return;
      }

      await updateDoc(docRef, {
        password: await sha256Hex(newPass),
        passwordUpdatedAt: serverTimestamp(),
        requirePasswordChange: false,
        "tempPassword.valid": false,
        "tempPassword.expiresAtMs": 0,
        "tempPassword.value": deleteField(),
      });

      setMsg("Password updated successfully! ✓");
      setMsgType("success");
      setOldPass("");
      setNewPass("");
      setConfirmPass("");

      onSaved?.({
        requirePasswordChange: false,
        passwordUpdatedAt: new Date(),
      });
    } catch (error) {
      console.error(error);
      setMsg(error?.message || "Failed to update password");
      setMsgType("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border bg-white p-4">
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
                  <span style={{ color: st.color, fontWeight: 700 }}>
                    {st.label}
                  </span>
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
          onClick={handleResetPassword}
          disabled={
            loading ||
            !oldPass ||
            !newPass ||
            !confirmPass ||
            newPass !== confirmPass ||
            !(
              newPass.length >= 8 &&
              /[a-z]/.test(newPass) &&
              /[A-Z]/.test(newPass) &&
              /\d/.test(newPass)
            )
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
