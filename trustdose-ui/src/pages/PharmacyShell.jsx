"use client";

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
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
  serverTimestamp,
  onSnapshot,
  orderBy,
} from "firebase/firestore";
import {
  ClipboardList,
  PackageCheck,
  Clock,
  User,
  LogOut,
  X,
  Eye,
  EyeOff,
  Lock,
  XCircle,
  AlertCircle,
  Bell,
  History,
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
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: Number(iter) || 100000 },
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
    reason: "Phone must start with 5 followed by 8 digits (e.g., +9665xxxxxxxx).",
  };
}

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

async function isEmailTakenAnyRole(email, currentDocId) {
  const collections = ["doctors", "pharmacies", "patients", "logistics"];
  const trimmed = String(email || "").trim().toLowerCase();
  const current = String(currentDocId || "");

  for (const col of collections) {
    const q = query(collection(db, col), where("email", "==", trimmed));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const conflict = snap.docs.find((d) => d.id !== current);
      if (conflict) return true;
    }
  }
  return false;
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

function normalizePharmacy(raw) {
  if (!raw) return null;
  return {
    name: pickStr(raw, ["name"]),
    pharmacyName: pickStr(raw, ["pharmacyName", "name"]),
    PharmacyID: pickStr(raw, ["PharmacyID"]),
    BranchID: pickStr(raw, ["BranchID"]),
    address: pickStr(raw, ["address"]),
    phone: pickStr(raw, ["phone"]),
    email: pickStr(raw, ["email"]),
    requirePasswordChange: raw?.requirePasswordChange ?? false,
    passwordUpdatedAt: raw?.passwordUpdatedAt ?? null,
    password: raw?.password || "",
    passwordHash: raw?.passwordHash || "",
    passwordSalt: raw?.passwordSalt || "",
    passwordIter: raw?.passwordIter || 0,
    passwordAlgo: raw?.passwordAlgo || "",
    tempPassword: raw?.tempPassword || null,
  };
}

export default function PharmacyShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const isPharmacyPage = location.pathname.startsWith("/pharmacy");

  const [open, setOpen] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [pharmacy, setPharmacy] = useState(null);
  const [pharmacyDocId, setPharmacyDocId] = useState(null);

  const [showEmailAlert, setShowEmailAlert] = useState(false);
  const [showResetAlert, setShowResetAlert] = useState(false);

  const [pageError, setPageError] = useState("");

  // ✅ DB-only notifications for the bell
  const [notifItems, setNotifItems] = useState([]);

  useEffect(() => {
    if (!isPharmacyPage) return;
    (async () => {
      const role = localStorage.getItem("userRole");
      const userPharmacyID = localStorage.getItem("userId");
      if (role !== "pharmacy" || !userPharmacyID) return;

      let snap = await getDoc(doc(db, "pharmacies", String(userPharmacyID)));
      if (!snap.exists()) {
        const qs = await getDocs(
          query(
            collection(db, "pharmacies"),
            where("PharmacyID", "==", String(userPharmacyID)),
            fsLimit(1)
          )
        );
        if (!qs.empty) snap = qs.docs[0];
      }
      if (!snap?.id) return;

      const norm = normalizePharmacy(snap.data());
      setPharmacy(norm);
      setPharmacyDocId(snap.id);

      setShowEmailAlert(!norm.email);
      setShowResetAlert(norm.requirePasswordChange === true);
    })();
  }, [isPharmacyPage, location.pathname]);

  useEffect(() => {
    setPageError("");
  }, [location.pathname]);

  function signOut() {
    localStorage.clear();
    sessionStorage.clear();
    navigate("/auth");
  }

  const isPickActive =
    location.pathname === "/pharmacy" || location.pathname.startsWith("/pharmacy/pickup");
  const isDelivActive = location.pathname.startsWith("/pharmacy/delivery");
  const isPendActive = location.pathname.startsWith("/pharmacy/pending");
  const isNotifActive = location.pathname.startsWith("/pharmacy/notifications");
  const isHistActive = location.pathname.startsWith("/pharmacy/history");

  let subtitleText = "";
  if (isPickActive) subtitleText = "Pick-up orders awaiting patient arrival";
  else if (isDelivActive) subtitleText = "Delivery requests awaiting your acceptance";
  else if (isPendActive) subtitleText = "Pending delivery prescriptions awaiting dispensing";
  else if (isNotifActive) subtitleText = "Reminder alerts";

  // ✅ Listen to notifications collection ONLY (DB is source of truth)
  useEffect(() => {
    if (!isPharmacyPage) return;

    const base = [where("toRole", "==", "pharmacy")];

    const orderedQ = query(
      collection(db, "notifications"),
      ...base,
      orderBy("createdAt", "desc")
    );
    const plainQ = query(collection(db, "notifications"), ...base);

    let unsub = null;

    const attach = (qq, label) => {
      unsub = onSnapshot(
        qq,
        (snap) => {
          setNotifItems(
            snap.docs.map((d) => ({
              __docId: d.id,
              id: d.id,
              ...d.data(),
            }))
          );
        },
        (err) => {
          const msg = String(err?.message || "");
          const isIndex =
            err?.code === "failed-precondition" ||
            msg.toLowerCase().includes("index") ||
            msg.toLowerCase().includes("requires an index");

          if (isIndex && label === "ordered") {
            try {
              if (unsub) unsub();
            } catch {}
            attach(plainQ, "plain");
            return;
          }

          setNotifItems([]);
        }
      );
    };

    attach(orderedQ, "ordered");

    return () => {
      try {
        if (unsub) unsub();
      } catch {}
    };
  }, [isPharmacyPage]);

  // ✅ unread count يعتمد فقط على read field في Firestore
  const unreadCount = useMemo(() => {
    return (notifItems || []).filter((n) => !(n.read === true || n.read === "true")).length;
  }, [notifItems]);

  // زر الجرس مع العداد
  const bellRightNode = isPharmacyPage ? (
    <button
      type="button"
      onClick={() => navigate("/pharmacy/notifications")}
      className="h-10 w-10 grid place-items-center rounded-xl hover:bg-black/[0.04] transition"
      aria-label="Notifications"
      style={{ color: C.ink }}
    >
      <div className="relative">
        <Bell size={20} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold grid place-items-center"
            style={{ background: "#DC2626", color: "#fff", lineHeight: "18px" }}
          >
            {unreadCount > 99 ? "99+" : String(unreadCount)}
          </span>
        )}
      </div>
    </button>
  ) : null;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header
        hideMenu={false}
        onMenuClick={() => {
          if (isPharmacyPage && pharmacyDocId) setOpen(true);
        }}
        rightNode={bellRightNode}
      />

      {showEmailAlert && (
        <AlertBanner>
          ⚠️Please verify your email so you can change your password later.{" "}
          <button
            onClick={() => setShowAccount(true)}
            style={{ fontWeight: 700, color: C.primary }}
          >
            Open My Profile
          </button>
        </AlertBanner>
      )}
      {showResetAlert && (
        <AlertBanner>
          ⚠️ Please Verify your email so you can change your password later.{" "}
          <button
            onClick={() => setShowAccount(true)}
            style={{ fontWeight: 700, color: C.primary }}
          >
            Open My Profile
          </button>
        </AlertBanner>
      )}

      {pageError && (
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <div className="mb-4 p-4 rounded-xl flex items-center gap-2 text-red-700 bg-red-100 border border-red-300">
            <AlertCircle size={20} />
            <span className="text-sm font-medium">{pageError}</span>
          </div>
        </div>
      )}

      {isPharmacyPage && !isNotifActive && (
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6 mt-4">
          <div className="mb-6 flex items-center gap-3">
            <div>
              <h1 className="font-extrabold text-[24px]" style={{ color: "#334155" }}>
                {pharmacy?.pharmacyName || pharmacy?.name
                  ? `Welcome, ${pharmacy.pharmacyName || pharmacy.name}`
                  : "Welcome, Pharmacy"}
              </h1>

              {subtitleText && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-[15px] font-medium" style={{ color: "#64748b" }}>
                    {subtitleText}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1">
        <Outlet context={{ setPageError }} />
      </div>

      <Footer />

      {isPharmacyPage && pharmacyDocId && (
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
              <img src="/Images/TrustDose_logo.png" alt="TrustDose" className="h-7 w-auto" />
              <button
                onClick={() => setOpen(false)}
                className="h-9 w-9 grid place-items-center rounded-lg hover:bg-white/20 text-white"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="px-3">
              <DrawerItem
                active={isPickActive}
                onClick={() => {
                  navigate("/pharmacy");
                  setOpen(false);
                }}
              >
                <ClipboardList size={18} />
                <span>Pick Up Orders</span>
              </DrawerItem>

              <DrawerItem
                active={isDelivActive}
                onClick={() => {
                  navigate("/pharmacy/delivery");
                  setOpen(false);
                }}
              >
                <PackageCheck size={18} />
                <span>Delivery Orders</span>
              </DrawerItem>

              <DrawerItem
                active={isPendActive}
                onClick={() => {
                  navigate("/pharmacy/pending");
                  setOpen(false);
                }}
              >
                <Clock size={18} />
                <span>Pending Orders</span>
              </DrawerItem>

              <DrawerItem
                active={isNotifActive}
                onClick={() => {
                  navigate("/pharmacy/notifications");
                  setOpen(false);
                }}
              >
                <Bell size={18} />
                <span>Notifications</span>
              </DrawerItem>

              <DrawerItem
                active={isHistActive}
                onClick={() => {
                  navigate("/pharmacy/history");
                  setOpen(false);
                }}
              >
                <History size={18} />
                <span>History</span>
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

      {showAccount && pharmacyDocId && (
        <AccountModal
          pharmacy={pharmacy}
          pharmacyDocId={pharmacyDocId}
          onClose={() => setShowAccount(false)}
          onSaved={(d) => {
            setPharmacy((p) => ({ ...p, ...d }));
            if (d.email) setShowEmailAlert(false);
            if (d.requirePasswordChange === false || d.passwordUpdatedAt) setShowResetAlert(false);
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
      <span className="font-medium text-gray-800 text-right">{value}</span>
    </div>
  );
}

function AccountModal({ pharmacy, pharmacyDocId, onClose, onSaved }) {
  const [phone, setPhone] = useState(pharmacy?.phone || "");
  const [initialPhone, setInitialPhone] = useState(pharmacy?.phone || "");
  const [phoneError, setPhoneError] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("");

  const [editingPhone, setEditingPhone] = useState(false);
  const phoneRef = useRef(null);
  useEffect(() => {
    if (editingPhone) {
      setTimeout(() => phoneRef.current?.focus(), 0);
    }
  }, [editingPhone]);

  useEffect(() => {
    setPhone(pharmacy?.phone || "");
    setInitialPhone(pharmacy?.phone || "");
    setPhoneError("");
  }, [pharmacy?.phone]);

  const phoneInfo = validateAndNormalizePhone(phone || "");
  const hasTypedPhone = !!phone && phone !== "+966";
  const hasPhone = !!initialPhone;

  const canSavePhone =
    editingPhone &&
    !saving &&
    hasTypedPhone &&
    phone.length === 13 &&
    phoneInfo.ok &&
    !phoneError;

  async function isPharmacyPhoneTaken(phoneNormalized, selfDocId) {
    const snap = await getDocs(
      query(collection(db, "pharmacies"), where("phone", "==", phoneNormalized), fsLimit(5))
    );
    return snap.docs.some((d) => d.id !== selfDocId);
  }

  async function savePhone() {
    const info = validateAndNormalizePhone(phone);

    if (!info.ok) {
      setPhoneError(
        info.reason || "The phone number you entered isn’t valid. Please check and try again."
      );
      setPhone("+966");
      return;
    }
    if (!pharmacyDocId) {
      setPhoneError("We couldn’t find your pharmacy record. Please try again.");
      setPhone("+966");
      return;
    }
    if (info.normalized === initialPhone) {
      setPhoneError("The phone number you entered is already saved on your profile.");
      setPhone("+966");
      return;
    }

    try {
      setSaving(true);
      setMsg("");
      setMsgType("");
      setPhoneError("");

      const taken = await isPharmacyPhoneTaken(info.normalized, pharmacyDocId);
      if (taken) {
        setPhoneError("The phone number you entered is already registered in our system.");
        setPhone("+966");
        setSaving(false);
        return;
      }

      const payload = {
        phone: info.normalized,
        updatedAt: serverTimestamp(),
        phoneLocal: deleteField(),
      };

      await updateDoc(doc(db, "pharmacies", pharmacyDocId), payload);
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
      setPhoneError("Something went wrong while saving your phone number. Please try again.");
      setPhone("+966");
    } finally {
      setSaving(false);
    }
  }

  const hasEmail = !!pharmacy?.email;
  const [emailInput, setEmailInput] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  async function sendVerifyLink() {
    try {
      setEmailMsg("");

      const v = validateTrustDoseEmail(emailInput);
      if (!v.ok) {
        setEmailMsg(v.reason || "Please enter a valid email.");
        return;
      }
      const email = v.email;

      const taken = await isEmailTakenAnyRole(email, String(pharmacyDocId || ""));
      if (taken) {
        setEmailMsg("This email is already used by another account. Please use a different email.");
        return;
      }

      const BASE = window.location.origin;
      const params = new URLSearchParams({
        col: "pharmacies",
        doc: String(pharmacyDocId || ""),
        e: email,
        redirect: "/pharmacy",
      });
      const settings = {
        url: `${BASE}/auth-email?${params.toString()}`,
        handleCodeInApp: true,
      };
      setEmailLoading(true);
      await sendSignInLinkToEmail(getAuth(), email, settings);

      localStorage.setItem("td_email_pending", JSON.stringify({ email, ts: Date.now() }));
      setEmailMsg("A verification link has been sent to your email. Open it, then return to the app.");
    } catch (e) {
      if (e?.code === "auth/too-many-requests" || e?.code === "auth/quota-exceeded") {
        setEmailMsg("Too many verification emails were requested. Please try again later.");
      } else if (e?.code === "auth/invalid-email") {
        setEmailMsg("Please enter a valid email.");
      } else {
        setEmailMsg(`Firebase: ${e?.code || e?.message || "Unable to send verification link."}`);
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
              <div className="text-base font-semibold mb-2" style={{ color: C.ink }}>
                Pharmacy Info
              </div>
              <div className="space-y-2">
                <Row label="Pharmacy" value={pharmacy?.pharmacyName || pharmacy?.name || "—"} />
                <Row label="Pharmacy ID" value={pharmacy?.BranchID || "—"} />
                <Row label="Address" value={pharmacy?.address || "—"} />
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
                  <div className="font-medium text-gray-900">{initialPhone || "—"}</div>
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
                          if (local.startsWith("+966")) local = local.slice(4);
                          else if (local.startsWith("966")) local = local.slice(3);
                          else if (local.startsWith("05")) local = local.slice(1);
                          local = local.replace(/\D/g, "");
                          if (!local.startsWith("5")) local = "5" + local.replace(/^5*/, "");
                          local = local.slice(0, 9);
                          setPhone("+966" + local);
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
                          if (!phone || phone === "") setPhone("+966");
                        }}
                        onBlur={() => {
                          if (phone === "+966") setPhone("");
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
                          if (afterPrefix.length >= 9) e.preventDefault();
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
                          {phoneInfo.reason || "The phone number you entered isn’t valid yet."}
                        </span>
                      )}
                      {hasTypedPhone && phoneInfo.ok && !phoneError && (
                        <span className="text-emerald-700">✓ Valid phone number</span>
                      )}
                    </div>

                    {phoneError && <div className="mt-1 text-xs text-rose-600">{phoneError}</div>}
                  </>
                )}

                {msgType === "success" && !!msg && (
                  <div className="text-green-700 font-medium mt-2">{msg}</div>
                )}
              </div>

              <div className="mt-3">
                <label className="block text-sm text-gray-700 mb-1">Email</label>
                {hasEmail ? (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800">{pharmacy.email}</span>
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
                          color:
                            emailMsg.startsWith("Too many") ||
                            emailMsg.startsWith("This email") ||
                            emailMsg.startsWith("Please enter")
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

            {hasEmail && <PasswordResetSection pharmacyDocId={pharmacyDocId} onSaved={onSaved} />}
          </div>
        </div>
      </div>
    </>
  );
}

function PasswordResetSection({ pharmacyDocId, onSaved }) {
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("");

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
    return { score, label, color, width, hasLower, hasUpper, hasDigit, hasSymbol, len8 };
  }

  const st = passwordStrength(newPass);
  const passOk = st.hasLower && st.hasUpper && st.hasDigit && st.len8;

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

      const ref = doc(db, "pharmacies", pharmacyDocId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setMsg("Pharmacy record not found");
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

      const salt = randomSaltB64(16);
      const iter = 100000;
      const newHash = await pbkdf2Hex(newPass, salt, iter);

      await updateDoc(ref, {
        passwordAlgo: "PBKDF2-SHA256",
        passwordSalt: salt,
        passwordIter: iter,
        passwordHash: newHash,
        passwordUpdatedAt: serverTimestamp(),
        requirePasswordChange: false,
        "tempPassword.valid": false,
        "tempPassword.expiresAtMs": 0,
        "tempPassword.value": deleteField(),
        password: deleteField(),
      });

      setMsg("Password updated successfully! ✓");
      setMsgType("success");
      setOldPass("");
      setNewPass("");
      setConfirmPass("");

      onSaved?.({ requirePasswordChange: false, passwordUpdatedAt: new Date() });
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

          {newPass && (
            <>
              <div className="mt-3">
                <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${st.width}%`, background: st.color }} />
                </div>
                <div className="mt-2 text-sm">
                  Strength: <span style={{ color: st.color, fontWeight: 700 }}>{st.label}</span>
                  <span className="text-gray-600"> &nbsp;(min 8 chars, include a–z, A–Z, 0–9)</span>
                </div>
              </div>
              <div className="text-xs mt-1">
                <div className={`${st.hasUpper ? "text-green-700" : "text-gray-700"}`}>• Uppercase (A–Z)</div>
                <div className={`${st.hasLower ? "text-green-700" : "text-gray-700"}`}>• Lowercase (a–z)</div>
                <div className={`${st.hasDigit ? "text-green-700" : "text-gray-700"}`}>• Digit (0–9)</div>
                <div className={`${st.len8 ? "text-green-700" : "text-gray-700"}`}>• Length ≥ 8</div>
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
          disabled={loading || !oldPass || !newPass || !confirmPass || newPass !== confirmPass || !passOk}
          className="w-full py-2.5 rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02]"
          style={{ background: C.primary }}
        >
          {loading ? "Updating..." : "Update Password"}
        </button>
      </div>
    </div>
  );
}
