// src/pages/Auth.js
"use client";
import React, { useMemo, useState, useEffect } from "react";
import { Eye, EyeOff, CheckCircle, Circle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  doc,
  serverTimestamp,
  Timestamp,
  getDoc,
} from "firebase/firestore";

/* =========================
   TrustDose Theme
   ========================= */
const TD = {
  primary: "#B08CC1",
  teal: "#52B9C4",
  ink: "#4A2C59",
  gray: "#666",
  light: "#eee",
  ok: "#10b981",
  warn: "#f59e0b",
  err: "#DC2626",
};

/* =========================
   PBKDF2-SHA256 (WebCrypto)
   ========================= */
async function pbkdf2Hash(password, saltBase64, iterations = 100_000) {
  const enc = new TextEncoder();
  const pwKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const salt = Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    pwKey,
    256
  );
  const hashBytes = new Uint8Array(bits);
  return btoa(String.fromCharCode(...hashBytes));
}

function genSaltBase64(len = 16) {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf));
}

/* =========================
   Cities & Districts (Riyadh only)
   ========================= */
const SA_CITIES = ["Riyadh"];
const DISTRICTS_BY_CITY = {
  Riyadh: [
    "Al Olaya",
    "Al Malaz",
    "Al Nakheel",
    "Al Yasmin",
    "Al Rawdah",
    "Al Qirawan",
    "Other…",
  ],
};

/* =========================
   Validators (Phone / Password / NID)
   ========================= */
function toEnglishDigits(s) {
  if (!s) return "";
  let out = "";
  for (const ch of String(s)) {
    const code = ch.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660);
    else if (code >= 0x06F0 && code <= 0x06F9) out += String(code - 0x06F0);
    else out += ch;
  }
  return out;
}
function isDigitsLike(s) {
  return /^\+?\d+$/.test(s || "");
}

/** Reject spaces; do not auto-fix them */
function validateAndNormalizePhone(raw) {
  const original = String(raw || "");
  if (/\s/.test(original)) {
    return { ok: false, reason: "Phone number must not contain spaces." };
  }
  const cleaned = toEnglishDigits(original).trim();
  if (!isDigitsLike(cleaned)) {
    return { ok: false, reason: "Phone should contain digits only (and optional leading +)." };
  }
  if (/^05\d{8}$/.test(cleaned)) {
    const last8 = cleaned.slice(2);
    return { ok: true, normalized: `+9665${last8}` };
  }
  if (/^\+9665\d{8}$/.test(cleaned)) {
    return { ok: true, normalized: cleaned };
  }
  return {
    ok: false,
    reason:
      "Phone must start with 05 or +9665 followed by 8 digits (e.g., 05xxxxxxxx or +9665xxxxxxxx).",
  };
}

/** Strict at submit: 10 ASCII digits, starts with 1 or 2, no spaces */
function isValidNationalIdStrict(raw) {
  const s = String(raw || "");
  if (/\s/.test(s)) return false;
  return /^[12][0-9]{9}$/.test(s);
}

/** Live validation: allow partial typing up to 11, enforce ASCII digits & start rule, show error if >10 */
function isValidNationalIdLive(raw) {
  const s = String(raw || "");
  if (s === "") return { ok: true, reason: "" };
  if (/\s/.test(s)) return { ok: false, reason: "No spaces allowed." };
  if (!/^[0-9]*$/.test(s)) return { ok: false, reason: "Digits 0-9 only (ASCII)." };
  if (s.length >= 1 && !/^[12]/.test(s)) return { ok: false, reason: "Must start with 1 or 2." };
  if (s.length > 10) return { ok: false, reason: "Exactly 10 digits." };
  return { ok: true, reason: "" };
}

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

/* =========================
   Small UI helpers
   ========================= */
const inputBase = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #DFE3E8",
  margin: "6px 0 12px",
  outline: "none",
  background: "#fff",
  boxShadow: "0 3px 14px rgba(0,0,0,.04)",
  fontSize: 14,
};
const inputFocus = (hasError = false) => ({
  borderColor: hasError ? TD.err : TD.primary,
  boxShadow: hasError
    ? "0 0 0 4px rgba(220,38,38,.08)"
    : "0 0 0 4px rgba(176,140,193,.12)",
});
const buttonStyle = {
  width: "100%",
  padding: 12,
  borderRadius: 12,
  border: "none",
  cursor: "pointer",
  background: `linear-gradient(135deg, ${TD.primary}, ${TD.teal})`,
  color: "#fff",
  fontWeight: 700,
  fontSize: 15,
  letterSpacing: ".2px",
  boxShadow: "0 8px 20px rgba(82,185,196,.25)",
  transition: "transform .08s ease, filter .08s ease",
};
const linkStyle = {
  color: TD.teal,
  fontWeight: 600,
  textDecoration: "none",
};

function Label({ children }) {
  return <label style={{ fontSize: 13, color: TD.ink, fontWeight: 600 }}>{children}</label>;
}

/** Select with placeholder/name + arrow */
function Select({ name, value, onChange, disabled, required, placeholder, children }) {
  return (
    <div style={{ position: "relative" }}>
      <select
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        style={{ ...inputBase, paddingRight: 36, appearance: "none" }}
        onFocus={(e) => Object.assign(e.currentTarget.style, inputFocus(false))}
        onBlur={(e) =>
          Object.assign(e.currentTarget.style, {
            borderColor: "#DFE3E8",
            boxShadow: "0 3px 14px rgba(0,0,0,.04)",
          })
        }
      >
        {/* placeholder option */}
        <option value="" disabled hidden>
          {placeholder || "Select…"}
        </option>
        {children}
      </select>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#7a7a7a"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}

export default function TrustDoseAuth() {
  const navigate = useNavigate();

  const [mode, setMode] = useState("signin");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);

  // Sign in
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");

  // 👁️
  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);

  // Sign up (Patient)
  const [nationalId, setNationalId] = useState("");
  const [nationalIdErr, setNationalIdErr] = useState("");
  const [phone, setPhone] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState(""); // "Male" | "Female"
  const [birthDate, setBirthDate] = useState("");
  const [birthDateErr, setBirthDateErr] = useState("");

  // الموقع
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [districtOther, setDistrictOther] = useState("");

  // UI helpers
  const [pwInfo, setPwInfo] = useState(passwordStrength(""));
  const [phoneInfo, setPhoneInfo] = useState({ ok: false, reason: "", normalized: "" });
  const [phoneChecking, setPhoneChecking] = useState(false);
  const [phoneTaken, setPhoneTaken] = useState(false);

  const isSignup = mode === "signup";
  const inputCompact = isSignup ? { padding: "10px 12px", borderRadius: 10, fontSize: 13.5 } : {};

  useEffect(() => {
    const saved = localStorage.getItem("td_auth_id");
    if (saved) setAccountId(saved);
  }, []);
  useEffect(() => {
    if (remember && accountId) localStorage.setItem("td_auth_id", accountId);
    if (!remember) localStorage.removeItem("td_auth_id");
  }, [remember, accountId]);

  useEffect(() => {
    setPwInfo(passwordStrength(password));
  }, [password]);

  useEffect(() => {
    let cancelled = false;
    const info = validateAndNormalizePhone(phone);
    setPhoneInfo(info);
    setPhoneTaken(false);

    async function check() {
      if (!info.ok || !info.normalized) return;
      setPhoneChecking(true);
      try {
        const qRef = query(collection(db, "patients"), where("contact", "==", info.normalized));
        const snap = await getDocs(qRef);
        if (!cancelled) setPhoneTaken(!snap.empty);
      } catch (e) {
        if (!cancelled) console.warn("Phone uniqueness check error:", e);
      } finally {
        if (!cancelled) setPhoneChecking(false);
      }
    }
    const t = setTimeout(check, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [phone]);

  useEffect(() => {
    setDistrict("");
    setDistrictOther("");
  }, [city]);

  const title = useMemo(
    () => (mode === "signup" ? "Patient sign-up" : "Welcome to TrustDose"),
    [mode]
  );

  // ===== فقط هذا تغيّر: دعم B-1 للصيدلية =====
  function detectSource(id) {
    const clean = String(id || "").trim();

    // ✅ Pharmacy branch like "B-1" is stored in collection("pharmacies") with field BranchID
    if (/^B-\d+$/i.test(clean)) {
      return { coll: "pharmacies", idFields: ["BranchID"], role: "pharmacy" };
    }

    if (/^dr[-_]?\w+/i.test(clean)) {
      return { coll: "doctors", idFields: ["DoctorID"], role: "doctor" };
    }

    if (/^(ph|phar|pharmacy)[-_]?\w+/i.test(clean)) {
      // generic pharmacy IDs if you have other formats
      return { coll: "pharmacies", idFields: ["BranchID", "PharmacyID"], role: "pharmacy" };
    }

    if (/^\d{10,12}$/.test(clean)) {
      return { coll: "patients", idFields: ["nationalID", "nationalId"], role: "patient" };
    }

    return { coll: "logistics", idFields: ["companyName"], role: "logistics" };
  }

  // ===== Sign in =====
  async function handleSignIn(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      const id = accountId.trim();
      const pass = password.trim();
      if (!id) throw new Error("Please enter your ID");

      const { coll, idFields, role } = detectSource(id);
      let user = null;
      let userDocId = null; // ⬅️ نحتفظ بـ docId

      if (role === "patient") {
        try {
          const p = await getDoc(doc(db, "patients", `Ph_${id}`));
          if (p.exists()) { user = p.data(); userDocId = p.id; }
        } catch {}
      }

      // ✅ Fallback خاص بالصيدلية: جرّب Phar_Nahdi ثم pharmacies إذا كان النمط B-<num>
      if (!user && /^B-\d+$/i.test(id)) {
        try {
          // Phar_Nahdi
          let snap = await getDocs(query(collection(db, "Phar_Nahdi"), where("BranchID", "==", id)));
          if (!snap.empty) { user = snap.docs[0].data(); userDocId = snap.docs[0].id; }

          // pharmacies (لو فيه نسخة ثانية)
          if (!user) {
            snap = await getDocs(query(collection(db, "pharmacies"), where("BranchID", "==", id)));
            if (!snap.empty) { user = snap.docs[0].data(); userDocId = snap.docs[0].id; }
          }
        } catch {}
      }

      // منطقك الأصلي كما هو
      if (!user) {
        for (const f of idFields) {
          try {
            const q = query(collection(db, coll), where(f, "==", id));
            const snap = await getDocs(q);
            if (!snap.empty) {
              user = snap.docs[0].data();
              userDocId = snap.docs[0].id; // ⬅️
              break;
            }
          } catch {}
        }
      }

      if (!user) {
        setMsg("❌ No account found with this ID.");
        return;
      }

      if ("passwordHash" in user && "passwordSalt" in user) {
        if (!pass) {
          setMsg("Please enter your password.");
          return;
        }
        const derived = await pbkdf2Hash(pass, user.passwordSalt, 100_000);
        if (derived !== user.passwordHash) {
          setMsg("❌ ID or password incorrect.");
          return;
        }
      } else if ("password" in user) {
        if (!pass || String(user.password) !== pass) {
          setMsg("❌ ID or password incorrect.");
          return;
        }
      } else {
        console.warn(`[Auth] user has no password fields (allowed in dev).`);
      }

      const displayName = user.name || user.companyName || id;

      // ⬇️ تخزين role و المعرّفات بالصورة الصحيحة
      if (role === "pharmacy") {
        localStorage.setItem("userRole", "pharmacy");
        localStorage.setItem("userId", userDocId || id);            // الأفضل docId (مثل Phar_Nahdi)
        if (user.BranchID) localStorage.setItem("pharmacyBranchId", user.BranchID); // مثال B-1
      } else {
        localStorage.setItem("userId", id);
        localStorage.setItem("userRole", role);
      }

      setMsg(`✅ Logged in as ${role}. Welcome ${displayName}!`);

      if (role === "doctor") navigate("/doctor", { replace: true });
      else if (role === "pharmacy") navigate("/pharmacy", { replace: true });
      else if (role === "patient") navigate("/patient", { replace: true });
      else navigate("/", { replace: true });
    } catch (err) {
      console.error(err);
      setMsg(`⚠️ Error: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  // ===== Patient Sign up =====
  async function handleSignUp(e) {
  e.preventDefault();
  setMsg("");
  setLoading(true);

  try {
    // ‼️ حوّل كل شيء لأرقام/نصوص ASCII قبل أي فحص
    const nidAscii = toEnglishDigits(String(nationalId ?? "")).trim();
    if (!isValidNationalIdStrict(nidAscii)) {
      throw new Error("National ID must be 10 digits starting with 1 or 2 (ASCII digits only, no spaces).");
    }

    const phoneRaw = String(phone ?? "");
    const phoneCheck = validateAndNormalizePhone(phoneRaw);

    const pass  = String(password ?? "").trim();
    const pass2 = String(confirmPassword ?? "").trim();
    const nm    = String(name ?? "").trim();
    const g     = String(gender ?? "").trim(); // "Male" | "Female"
    const c     = String(city ?? "").trim();
    const d     = String(district === "__OTHER__" ? (districtOther ?? "") : (district ?? "")).trim();

    // تاريخ الميلاد: فسّره بشكل صارم من input type=date (YYYY-MM-DD)
    const bdateStr = String(birthDate ?? "").trim();
    let bdObj;
    {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bdateStr);
      if (!m) throw new Error("Invalid birth date.");
      const y = Number(m[1]), mo = Number(m[2]), dy = Number(m[3]);
      bdObj = new Date(Date.UTC(y, mo - 1, dy, 0, 0, 0));
    }
    if (Number.isNaN(bdObj.getTime())) throw new Error("Invalid birth date.");

    const maxBirth = new Date(Date.UTC(2007, 11, 31, 23, 59, 59));
    if (bdObj > maxBirth) throw new Error("Birth date must be 2007 or earlier.");

    if (!phoneCheck.ok) throw new Error(phoneCheck.reason || "Invalid phone.");
    const phoneNorm = phoneCheck.normalized;

    if (!nidAscii || !phoneRaw || !pass || !pass2 || !nm || !g || !bdateStr || !c || !d) {
      throw new Error("Please fill all fields.");
    }
    if (!["Male", "Female"].includes(g)) throw new Error("Gender must be Male or Female.");

    const pw = passwordStrength(pass);
    const meetsPolicy = pw.len8 && pw.hasLower && pw.hasUpper && pw.hasDigit;
    if (!meetsPolicy) throw new Error("Password must be at least 8 chars and include lowercase, uppercase, and a digit.");
    if (pass !== pass2) throw new Error("Passwords do not match.");

    const docId = `Ph_${nidAscii}`;

    const existsSnap = await getDoc(doc(db, "patients", docId));
    if (existsSnap.exists()) throw new Error("An account with this National ID already exists.");

    const phoneQ = query(collection(db, "patients"), where("contact", "==", phoneNorm));
    const phoneSnap = await getDocs(phoneQ);
    if (!phoneSnap.empty) throw new Error("This phone number is already registered.");

    // كلمة المرور: PBKDF2-SHA256 32 بايت -> Base64 طوله 44
    const saltB64 = genSaltBase64(16); // 16 بايت -> Base64 طوله 24
    const hashB64 = await pbkdf2Hash(pass, saltB64, 100_000);

    // لوج للتأكد من الأطوال المطلوبة في الrules
    console.log("[signup] hashLen:", hashB64.length, "saltLen:", saltB64.length);

    const payload = {
      locationCity: c,
      locationDistrict: d,
      locationLabel: `${c}, ${d}`,
      birthDate: Timestamp.fromDate(bdObj),
      contact: phoneNorm,
      gender: g,
      name: nm,
      nationalID: nidAscii,
      nationalId: nidAscii,
      passwordHash: hashB64,
      passwordSalt: saltB64,
      passwordAlgo: "PBKDF2-SHA256-100k",
      createdAt: serverTimestamp(),
    };

    await setDoc(doc(db, "patients", docId), payload);

    setMsg("🎉 Patient account created successfully. You can sign in now.");
    setMode("signin");
    setAccountId(nidAscii);
    setPassword("");
    setConfirmPassword("");
    setName("");
    setGender("");
    setBirthDate("");
    setPhone("");
    setCity("");
    setDistrict("");
    setDistrictOther("");
    setPhoneInfo({ ok: false, reason: "", normalized: "" });
    setPhoneTaken(false);
    setNationalIdErr("");
    setBirthDateErr("");
  } catch (err) {
    console.error("signup error:", err?.code, err?.message, err);
    setMsg(`❌ ${err?.code || ""} ${err?.message || err}`);
  } finally {
    setLoading(false);
  }
}


  const currentDistricts = useMemo(
    () => (city ? DISTRICTS_BY_CITY[city] || ["Other…"] : []),
    [city]
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: `
          linear-gradient(0deg, rgba(255,255,255,.42), rgba(255,255,255,.42)),
          linear-gradient(135deg, ${TD.primary} 0%, ${TD.teal} 100%)
        `,
        backgroundAttachment: "fixed",
      }}
    >
      <div
        style={{
          width: "min(92vw, 460px)",
          background: "#fff",
          padding: 24,
          borderRadius: 18,
          boxShadow: "0 18px 42px rgba(0,0,0,0.12)",
          border: "1px solid rgba(0,0,0,.04)",
          maxHeight: "90vh",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "thin",
        }}
      >
        {/* Logo */}
        <div style={{ display: "grid", placeItems: "center", marginBottom: 16 }}>
          <div
            style={{
              width: 220,
              height: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src="/Images/TrustDose_logo.png"
              alt="TrustDose logo"
              style={{
                width: "100%",
                height: "auto",
                objectFit: "contain",
                transform: "scale(1.3)",
                filter: "drop-shadow(0 2px 6px rgba(0,0,0,.12))",
              }}
              draggable="false"
            />
          </div>
        </div>

        <h2 style={{ margin: 0, color: TD.ink, fontSize: 22, fontWeight: 800 }}>{title}</h2>
        <p style={{ marginTop: 10, color: TD.gray, fontSize: 13.5 }}>
          {mode === "signup"
            ? "Patient sign-up only (others use Sign in)"
            : "Sign in with your ID & password."}
        </p>

        {mode === "signin" ? (
          <form onSubmit={handleSignIn}>
            <Label>ID</Label>
            <input
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="DoctorID / PharmacyID / NationalID"
              style={inputBase}
              onFocus={(e) => Object.assign(e.currentTarget.style, inputFocus(false))}
              onBlur={(e) =>
                Object.assign(e.currentTarget.style, {
                  borderColor: "#DFE3E8",
                  boxShadow: "0 3px 14px rgba(0,0,0,.04)",
                })
              }
              required
            />

            <Label>Password</Label>
            <div style={{ position: "relative" }}>
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ ...inputBase, paddingRight: 44 }}
                onFocus={(e) => Object.assign(e.currentTarget.style, inputFocus(false))}
                onBlur={(e) =>
                  Object.assign(e.currentTarget.style, {
                    borderColor: "#DFE3E8",
                    boxShadow: "0 3px 14px rgba(0,0,0,.04)",
                  })
                }
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
                title={showPw ? "Hide password" : "Show password"}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  cursor: "pointer",
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: TD.gray,
                }}
              >
                {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                margin: "8px 0 16px",
              }}
            >
              <input
                id="remember"
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <label htmlFor="remember" style={{ fontSize: 13.5, color: "#333" }}>
                Remember me
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                ...buttonStyle,
                filter: loading ? "grayscale(30%) brightness(.9)" : undefined,
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(.99)") }
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)") }
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>

            <div
              style={{
                marginTop: 12,
                fontSize: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>
                First time patient?{" "}
                <a href="#signup" onClick={() => setMode("signup")} style={linkStyle}>
                  Create account
                </a>
              </span>

              <a
                href="#forgot"
                onClick={(e) => {
                  e.preventDefault();
                  alert("Password reset coming soon 🔒");
                }}
                style={linkStyle}
              >
                Forgot password?
              </a>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSignUp}>
            <Label>National ID</Label>
            <input
              value={nationalId}
              onChange={(e) => {
                const v = e.target.value;
                const live = isValidNationalIdLive(v);
                setNationalId(v);
                setNationalIdErr(live.ok ? "" : live.reason);
              }}
              placeholder="1xxxxxxxxx or 2xxxxxxxxx"
              style={{
                ...inputBase,
                ...inputCompact,
                ...(nationalIdErr ? { borderColor: TD.err, boxShadow: "0 0 0 4px rgba(220,38,38,.08)" } : {}),
              }}
              onFocus={(e) => Object.assign(e.currentTarget.style, inputFocus(!!nationalIdErr))}
              onBlur={(e) =>
                Object.assign(e.currentTarget.style, {
                  borderColor: "#DFE3E8",
                  boxShadow: "0 3px 14px rgba(0,0,0,.04)",
                })
              }
              required
              maxLength={11}
              inputMode="numeric"
              pattern="[12][0-9]{9}"
              title="10 ASCII digits starting with 1 or 2"
              onKeyDown={(e) => {
                const allowedControl = ["Backspace","Delete","ArrowLeft","ArrowRight","Tab","Home","End"];
                if (e.key === " ") { e.preventDefault(); return; }
                if (/^[0-9]$/.test(e.key)) return;
                if (allowedControl.includes(e.key)) return;
                e.preventDefault();
              }}
            />
            {nationalIdErr && (
              <div style={{ marginTop: -6, marginBottom: 8, fontSize: 12, color: "#b91c1c" }}>
                {nationalIdErr}
              </div>
            )}

            <Label>Phone</Label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05xxxxxxxx or +9665xxxxxxxx (no spaces)"
              style={{ ...inputBase, ...inputCompact }}
              onFocus={(e) =>
                Object.assign(
                  e.currentTarget.style,
                  inputFocus(!(phone === "" || (phoneInfo.ok && !phoneTaken)) && !!phone)
                )
              }
              onBlur={(e) =>
                Object.assign(e.currentTarget.style, {
                  borderColor: "#DFE3E8",
                  boxShadow: "0 3px 14px rgba(0,0,0,.04)",
                })
              }
              required
              onKeyDown={(e) => {
                if (e.key === " ") e.preventDefault();
              }}
            />
            <div style={{ marginTop: -6, marginBottom: 8, fontSize: 12 }}>
              {!phone && (
                <span style={{ color: "#888" }}>
                  Enter phone starting with 05 or +9665
                </span>
              )}
              {phone && !phoneInfo.ok && (
                <span style={{ color: "#b91c1c" }}>{phoneInfo.reason}</span>
              )}
              {phone && phoneInfo.ok && (
                <span style={{ color: "#065f46" }}>
                  Normalized: {phoneInfo.normalized}{" "}
                  {phoneChecking ? " • checking..." : ""}
                  {phoneTaken ? " • already registered" : ""}
                </span>
              )}
            </div>

            <Label>Full name</Label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              style={{ ...inputBase, ...inputCompact }}
              onFocus={(e) => Object.assign(e.currentTarget.style, inputFocus(false))}
              onBlur={(e) =>
                Object.assign(e.currentTarget.style, {
                  borderColor: "#DFE3E8",
                  boxShadow: "0 3px 14px rgba(0,0,0,.04)",
                })
              }
              required
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <Label>Gender</Label>
                <Select
                  name="gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  required
                  placeholder="Select gender…"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </Select>
              </div>

              <div>
                <Label>Birth date</Label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBirthDate(v);
                    if (v) {
                      const bd = new Date(v);
                      const maxBirth = new Date("2007-12-31T23:59:59");
                      setBirthDateErr(bd > maxBirth ? "Birth date must be 2007 or earlier." : "");
                    } else {
                      setBirthDateErr("");
                    }
                  }}
                  style={{
                    ...inputBase,
                    ...inputCompact,
                    ...(birthDateErr ? { borderColor: TD.err, boxShadow: "0 0 0 4px rgba(220,38,38,.08)" } : {}),
                  }}
                  onFocus={(e) => Object.assign(e.currentTarget.style, inputFocus(!!birthDateErr))}
                  onBlur={(e) =>
                    Object.assign(e.currentTarget.style, {
                      borderColor: "#DFE3E8",
                      boxShadow: "0 3px 14px rgba(0,0,0,.04)",
                    })
                  }
                  required
                />
                {birthDateErr && (
                  <div style={{ marginTop: -6, marginBottom: 8, fontSize: 12, color: "#b91c1c" }}>
                    {birthDateErr}
                  </div>
                )}
              </div>
            </div>

            {/* City + District */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <Label>City</Label>
                <Select
                  name="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                  placeholder="Select a city…"
                >
                  {SA_CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>District</Label>
                <Select
                  name="district"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  required
                  disabled={!city}
                  placeholder={city ? "Select a district…" : "Choose city first"}
                >
                  {(city ? (DISTRICTS_BY_CITY[city] || []) : []).map((d) => (
                    <option key={d} value={d === "Other…" ? "__OTHER__" : d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {district === "__OTHER__" && (
              <div>
                <Label>District (Other)</Label>
                <input
                  value={districtOther}
                  onChange={(e) => setDistrictOther(e.target.value)}
                  placeholder="Type district name"
                  style={{ ...inputBase, ...inputCompact }}
                  onFocus={(e) => Object.assign(e.currentTarget.style, inputFocus(false))}
                  onBlur={(e) =>
                    Object.assign(e.currentTarget.style, {
                      borderColor: "#DFE3E8",
                      boxShadow: "0 3px 14px rgba(0,0,0,.04)",
                    })
                  }
                  required
                />
              </div>
            )}

            <Label>Password</Label>
            <div style={{ position: "relative" }}>
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ ...inputBase, ...inputCompact, paddingRight: 44 }}
                onFocus={(e) => Object.assign(e.currentTarget.style, inputFocus(false))}
                onBlur={(e) =>
                  Object.assign(e.currentTarget.style, {
                    borderColor: "#DFE3E8",
                    boxShadow: "0 3px 14px rgba(0,0,0,.04)",
                  })
                }
                required
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
                title={showPw ? "Hide password" : "Show password"}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  cursor: "pointer",
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: TD.gray,
                }}
              >
                {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            {/* Password live checklist (Sign up only) */}
            {password.length > 0 && (
              <div style={{ marginTop: 8, marginBottom: 8 }}>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                  <PwRule ok={/[A-Z]/.test(password)} label="Uppercase (A–Z)" />
                  <PwRule ok={/[a-z]/.test(password)} label="Lowercase (a–z)" />
                  <PwRule ok={/\d/.test(password)} label="Digit (0–9)" />
                  <PwRule ok={/[^A-Za-z0-9]/.test(password)} label="Symbol (!@#$…)" />
                  <PwRule ok={password.length >= 8} label="Length ≥ 8" />
                </ul>
              </div>
            )}

            {/* Strength bar & hint */}
            {password.length > 0 && (
              <div style={{ marginTop: -6, marginBottom: 8 }}>
                <div style={{ height: 6, background: "#eee", borderRadius: 6, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${pwInfo.width}%`,
                      background: pwInfo.color,
                      transition: "width .2s ease",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
                  <span style={{ fontSize: 12, color: "#555" }}>
                    Strength: <strong style={{ color: pwInfo.color }}>{pwInfo.label}</strong>
                  </span>
                  <span style={{ fontSize: 12, color: "#666" }}>
                    (min 8 chars, include a–z, A–Z, 0–9)
                  </span>
                </div>
              </div>
            )}

            <Label>Confirm Password</Label>
            <div style={{ position: "relative" }}>
              <input
                type={showPwConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                style={{ ...inputBase, ...inputCompact, paddingRight: 44 }}
                onFocus={(e) => Object.assign(e.currentTarget.style, inputFocus(false))}
                onBlur={(e) =>
                  Object.assign(e.currentTarget.style, {
                    borderColor: "#DFE3E8",
                    boxShadow: "0 3px 14px rgba(0,0,0,.04)",
                  })
                }
                required
              />
              <button
                type="button"
                onClick={() => setShowPwConfirm((v) => !v)}
                aria-label={showPwConfirm ? "Hide password" : "Show password"}
                title={showPwConfirm ? "Hide password" : "Show password"}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  cursor: "pointer",
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: TD.gray,
                }}
              >
                {showPwConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                ...buttonStyle,
                marginTop: 4,
                filter: loading ? "grayscale(30%) brightness(.9)" : undefined,
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(.99)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              {loading ? "Creating..." : "Create account"}
            </button>

            <div style={{ marginTop: 12, fontSize: 14 }}>
              Already have an account?{" "}
              <a href="#signin" onClick={() => setMode("signin")} style={linkStyle}>
                Sign in
              </a>
            </div>
          </form>
        )}

        {msg && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 12,
              background:
                msg.startsWith("🎉") || msg.startsWith("✅")
                  ? "rgba(16,185,129,.08)"
                  : "rgba(239,68,68,.08)",
              color:
                msg.startsWith("🎉") || msg.startsWith("✅") ? "#065f46" : "#7f1d1d",
              border: `1px solid ${
                msg.startsWith("🎉") || msg.startsWith("✅")
                  ? "rgba(16,185,129,.25)"
                  : "rgba(239,68,68,.25)"
              }`,
              fontSize: 13.5,
            }}
          >
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}

/** Password Rule item */
function PwRule({ ok, label }) {
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: ok ? TD.ok : TD.gray }}>
      {ok ? <CheckCircle size={16} /> : <Circle size={16} />}
      <span>{label}</span>
    </li>
  );
}
