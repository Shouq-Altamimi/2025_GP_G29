// src/pages/Auth.js
"use client";
import React, { useMemo, useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
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
   ألوان وهوية TrustDose
   ========================= */
const TD = {
  primary: "#B08CC1", // موف
  teal: "#52B9C4",    // فيروزي
  ink: "#4A2C59",     // حبر
  gray: "#666",
  light: "#eee",
};

/* =========================
   أدوات الهاش (PBKDF2-SHA256)
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
    256 // 32 bytes
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
   كاتالوج المدن والأحياء
   ========================= */
const SA_CITIES = [
  "Riyadh","Jeddah","Dammam","Makkah","Medina","Khobar","Taif","Buraidah",
  "Abha","Tabuk","Hail","Jazan","Najran","Al Ahsa",
];

const DISTRICTS_BY_CITY = {
  Riyadh: ["Al Olaya","Al Malaz","Al Nakheel","Al Yasmin","Al Rawdah","Al Qirawan","Other…"],
  Jeddah: ["Al Rawdah","Al Salamah","Al Nahdah","Al Hamra","Al Rehab","Other…"],
  Dammam: ["Al Faisaliyah","Al Mazruiyah","Al Shati","Badr","Other…"],
  Makkah: ["Al Aziziyah","Al Awali","Al Shara’i","Al Nuzha","Other…"],
  Medina: ["Quba","Al Khalidiyah","Al Zahra","Other…"],
  Khobar: ["Al Rakah","Al Aqrabiyah","Al Olaya","Other…"],
  Taif: ["Al Salamah","Al Faisaliah","Al Shifa","Other…"],
  Buraidah: ["Al Nahdah","Al Rayyan","Other…"],
  Abha: ["Al Soudah","Al Nasim","Other…"],
  Tabuk: ["Al Matar","Al Mahدود","Other…"],
  Hail: ["Al مطار","Al Samraa","Other…"],
  Jazan: ["Sabya","Abu Arish","Other…"],
  Najran: ["Al Faisaliah","Al Khalidiyah","Other…"],
  "Al Ahsa": ["Mubarraz","Hofuf","Other…"],
};

/* =========================
   أدوات التحقق (هاتف + كلمة مرور)
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
function validateAndNormalizePhone(raw) {
  const cleaned = toEnglishDigits(String(raw || "").trim()).replace(/\s+/g, "");
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
   عناصر UI صغيرة قابلة لإعادة الاستخدام
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
  borderColor: hasError ? "#DC2626" : TD.primary,
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

/** حاوية select مع سهم صغير */
function Select({ value, onChange, disabled, required, children }) {
  return (
    <div style={{ position: "relative" }}>
      <select
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
  const [phone, setPhone] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState(""); // "M" | "F"
  const [birthDate, setBirthDate] = useState("");

  // الموقع
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [districtOther, setDistrictOther] = useState("");

  // UI helpers
  const [pwInfo, setPwInfo] = useState(passwordStrength(""));
  const [phoneInfo, setPhoneInfo] = useState({ ok: false, reason: "", normalized: "" });
  const [phoneChecking, setPhoneChecking] = useState(false);
  const [phoneTaken, setPhoneTaken] = useState(false);

  // تصغير بسيط لعناصر Sign-up
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
    () => (mode === "signup" ? "Create Patient Account" : "Welcome to TrustDose"),
    [mode]
  );

  function detectSource(id) {
    const clean = String(id || "").trim();
    if (/^dr[-_]?\w+/i.test(clean)) {
      return { coll: "doctors", idFields: ["DoctorID"], role: "doctor" };
    }
    if (/^(phar|b[-_]?)/i.test(clean)) {
      return { coll: "pharmacies", idFields: ["BranchID"], role: "pharmacy" };
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

      if (role === "patient") {
        try {
          const p = await getDoc(doc(db, "patients", `Ph_${id}`));
          if (p.exists()) user = p.data();
        } catch {}

      }

      if (!user) {
        for (const f of idFields) {
          try {
            const q = query(collection(db, coll), where(f, "==", id));
            const snap = await getDocs(q);
            if (!snap.empty) {
              user = snap.docs[0].data();
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
      localStorage.setItem("userId", id);
      localStorage.setItem("userRole", role);

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
      const nid = String(nationalId).trim();
      const phoneRaw = String(phone).trim();
      const phoneCheck = validateAndNormalizePhone(phoneRaw);
      const pass = String(password).trim();
      const pass2 = String(confirmPassword).trim();
      const nm = name.trim();
      const g = gender.trim().toUpperCase();
      const bdate = birthDate.trim();

      const c = city.trim();
      const d = district === "__OTHER__" ? districtOther.trim() : district.trim();

      if (!nid || !phoneRaw || !pass || !pass2 || !nm || !g || !bdate || !c || !d) {
        throw new Error("Please fill all fields.");
      }
      if (!/^\d{10,12}$/.test(nid)) throw new Error("National ID should be 10–12 digits.");
      if (!["M", "F"].includes(g)) throw new Error("Gender must be M or F.");

      if (!phoneCheck.ok) { throw new Error(phoneCheck.reason || "Invalid phone."); }
      const phoneNorm = phoneCheck.normalized;

      const pw = passwordStrength(pass);
      const meetsPolicy = pw.len8 && pw.hasLower && pw.hasUpper && pw.hasDigit;
      if (!meetsPolicy) {
        throw new Error("Password must be at least 8 chars and include lowercase, uppercase, and a digit.");
      }
      if (pass !== pass2) throw new Error("Passwords do not match.");

      const bdObj = new Date(bdate);
      if (Number.isNaN(bdObj.getTime())) throw new Error("Invalid birth date.");
      const now = new Date();
      if (bdObj > now) throw new Error("Birth date cannot be in the future.");

      const docId = `Ph_${nid}`;
      const existsSnap = await getDoc(doc(db, "patients", docId));
      if (existsSnap.exists()) { throw new Error("An account with this National ID already exists."); }

      const phoneQ = query(collection(db, "patients"), where("contact", "==", phoneNorm));
      const phoneSnap = await getDocs(phoneQ);
      if (!phoneSnap.empty) { throw new Error("This phone number is already registered."); }

      const saltB64 = genSaltBase64(16);
      const hashB64 = await pbkdf2Hash(pass, saltB64, 100_000);

      await setDoc(doc(db, "patients", docId), {
        locationCity: c,
        locationDistrict: d,
        Location: `${c}, ${d}`,
        birthDate: Timestamp.fromDate(bdObj),
        contact: phoneNorm,
        gender: g,
        name: nm,
        nationalID: nid,
        nationalId: nid,
        passwordHash: hashB64,
        passwordSalt: saltB64,
        passwordAlgo: "PBKDF2-SHA256-100k",
        createdAt: serverTimestamp(),
      });

      setMsg("🎉 Patient account created successfully. You can sign in now.");
      setMode("signin");
      setAccountId(nid);
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
    } catch (err) {
      setMsg(`❌ ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  const currentDistricts = city ? DISTRICTS_BY_CITY[city] || ["Other…"] : [];

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
          // نفس العرض للصفحتين للتنسيق
          width: "min(92vw, 460px)",
          background: "#fff",
          padding: 24,
          borderRadius: 18,
          boxShadow: "0 18px 42px rgba(0,0,0,0.12)",
          border: "1px solid rgba(0,0,0,.04)",
          // منع طول مفرط في Sign-up
          maxHeight: "90vh",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "thin",
        }}
      >
        {/* الشعار داخل الكارد، أكبر بدون ما يكبر الكارد */}
        <div style={{ display: "grid", placeItems: "center", marginBottom: 16 }}>
          <div
            style={{
              width: 220,          // إطار ثابت
              height: 100,         // يضمن مساحة مريحة
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
                transform: "scale(1.3)", // 👈 تكبير داخلي بدون توسيع الكارد
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
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(.99)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
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
              onChange={(e) => setNationalId(e.target.value)}
              placeholder="1xxxxxxxxx"
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

            <Label>Phone</Label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05xxxxxxxx or +9665xxxxxxxx"
              style={{ ...inputBase, ...inputCompact }}
              onFocus={(e) =>
                Object.assign(
                  e.currentTarget.style,
                  inputFocus(!phoneInfo.ok && !!phone)
                )
              }
              onBlur={(e) =>
                Object.assign(e.currentTarget.style, {
                  borderColor: "#DFE3E8",
                  boxShadow: "0 3px 14px rgba(0,0,0,.04)",
                })
              }
              required
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
                <Select value={gender} onChange={(e) => setGender(e.target.value)} required>
                  <option value="">Select…</option>
                  <option value="M">M</option>
                  <option value="F">F</option>
                </Select>
              </div>

              <div>
                <Label>Birth date</Label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
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
            </div>

            {/* الموقع: مدينة + حي */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <Label>City</Label>
                <Select value={city} onChange={(e) => setCity(e.target.value)} required>
                  <option value="">Select a city…</option>
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
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  required
                  disabled={!city}
                >
                  <option value="">
                    {city ? "Select a district…" : "Choose city first"}
                  </option>
                  {(city ? DISTRICTS_BY_CITY[city] || ["Other…"] : []).map((d) => (
                    <option key={d} value={d === "Other…" ? "__OTHER__" : d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {/* حقل حي مخصص عند اختيار Other… */}
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
