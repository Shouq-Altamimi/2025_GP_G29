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
   كاتالوج المدن والأحياء (ثابت حالياً)
   ========================= */
const SA_CITIES = [
  "Riyadh",
  "Jeddah",
  "Dammam",
  "Makkah",
  "Medina",
  "Khobar",
  "Taif",
  "Buraidah",
  "Abha",
  "Tabuk",
  "Hail",
  "Jazan",
  "Najran",
  "Al Ahsa",
];

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
  Jeddah: ["Al Rawdah", "Al Salamah", "Al Nahdah", "Al Hamra", "Al Rehab", "Other…"],
  Dammam: ["Al Faisaliyah", "Al Mazruiyah", "Al Shati", "Badr", "Other…"],
  Makkah: ["Al Aziziyah", "Al Awali", "Al Shara’i", "Al Nuzha", "Other…"],
  Medina: ["Quba", "Al Khalidiyah", "Al Zahra", "Other…"],
  Khobar: ["Al Rakah", "Al Aqrabiyah", "Al Olaya", "Other…"],
  Taif: ["Al Salamah", "Al Faisaliah", "Al Shifa", "Other…"],
  Buraidah: ["Al Nahdah", "Al Rayyan", "Other…"],
  Abha: ["Al Soudah", "Al Nasim", "Other…"],
  Tabuk: ["Al Matar", "Al Mahdود", "Other…"],
  Hail: ["Al Matar", "Al Samraa", "Other…"],
  Jazan: ["Sabya", "Abu Arish", "Other…"],
  Najran: ["Al Faisaliah", "Al Khalidiyah", "Other…"],
  "Al Ahsa": ["Mubarraz", "Hofuf", "Other…"],
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
  if (len12) score++; // bonus

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

export default function TrustDoseAuth() {
  const navigate = useNavigate();

  const [mode, setMode] = useState("signin");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);

  // Sign in
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");

  // 👁️ حالات إظهار/إخفاء الباسوورد
  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);

  // Sign up (Patient)
  const [nationalId, setNationalId] = useState("");
  const [phone, setPhone] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState(""); // "M" | "F"
  const [birthDate, setBirthDate] = useState("");

  // الموقع الجديد
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [districtOther, setDistrictOther] = useState("");

  // UI helpers
  const [pwInfo, setPwInfo] = useState(passwordStrength(""));
  const [phoneInfo, setPhoneInfo] = useState({ ok: false, reason: "", normalized: "" });
  const [phoneChecking, setPhoneChecking] = useState(false);
  const [phoneTaken, setPhoneTaken] = useState(false);

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

  // إعادة تهيئة الحي لما تتغير المدينة
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

      // توجيه حسب الدور
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

  // ===== Patient Sign up (with full schema) =====
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
      const g = gender.trim().toUpperCase(); // M | F
      const bdate = birthDate.trim(); // yyyy-mm-dd

      // القيم الجديدة للموقع
      const c = city.trim();
      const d = district === "__OTHER__" ? districtOther.trim() : district.trim();

      // Basic checks
      if (!nid || !phoneRaw || !pass || !pass2 || !nm || !g || !bdate || !c || !d) {
        throw new Error("Please fill all fields.");
      }
      if (!/^\d{10,12}$/.test(nid)) throw new Error("National ID should be 10–12 digits.");
      if (!["M", "F"].includes(g)) throw new Error("Gender must be M or F.");

      // تحقق رقم الجوال + التوحيد
      if (!phoneCheck.ok) {
        throw new Error(phoneCheck.reason || "Invalid phone.");
      }
      const phoneNorm = phoneCheck.normalized;

      // سياسة كلمة المرور (8 حروف + صغير + كبير + رقم)
      const pw = passwordStrength(pass);
      const meetsPolicy = pw.len8 && pw.hasLower && pw.hasUpper && pw.hasDigit;
      if (!meetsPolicy) {
        throw new Error(
          "Password must be at least 8 chars and include lowercase, uppercase, and a digit."
        );
      }
      if (pass !== pass2) throw new Error("Passwords do not match.");

      // birthDate validity
      const bdObj = new Date(bdate);
      if (Number.isNaN(bdObj.getTime())) throw new Error("Invalid birth date.");
      const now = new Date();
      if (bdObj > now) throw new Error("Birth date cannot be in the future.");

      // تأكد الهوية غير مكررة
      const docId = `Ph_${nid}`;
      const existsSnap = await getDoc(doc(db, "patients", docId));
      if (existsSnap.exists()) {
        throw new Error("An account with this National ID already exists.");
      }

      // تأكد رقم الجوال غير مكرر
      const phoneQ = query(collection(db, "patients"), where("contact", "==", phoneNorm));
      const phoneSnap = await getDocs(phoneQ);
      if (!phoneSnap.empty) {
        throw new Error("This phone number is already registered.");
      }

      // هاش كلمة المرور + ملح
      const saltB64 = genSaltBase64(16);
      const hashB64 = await pbkdf2Hash(pass, saltB64, 100_000);

      // Write document (نخزن الحقول الجديدة + Location مركّب للتوافق)
      await setDoc(doc(db, "patients", docId), {
        // location
        locationCity: c,
        locationDistrict: d,
        Location: `${c}, ${d}`,

        // باقي الحقول
        birthDate: Timestamp.fromDate(bdObj),
        contact: phoneNorm,
        gender: g,
        name: nm,
        nationalID: nid,
        nationalId: nid,

        // تخزين آمن
        passwordHash: hashB64,
        passwordSalt: saltB64,
        passwordAlgo: "PBKDF2-SHA256-100k",

        // meta
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
        background: "linear-gradient(135deg,#B08CC1 0%, #52B9C4 100%)",
      }}
    >
      <div
        style={{
          width: 460,
          background: "#fff",
          padding: 24,
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
        }}
      >
        <h2 style={{ margin: 0, color: "#4A2C59" }}>{title}</h2>
        <p style={{ marginTop: 6, color: "#666" }}>
          {mode === "signup"
            ? "Patient sign-up only (others use Sign in)"
            : "Sign in with your ID & password."}
        </p>

        {mode === "signin" ? (
          <form onSubmit={handleSignIn}>
            <label>ID</label>
            <input
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="DoctorID / PharmacyID / NationalID"
              style={inputStyle}
              required
            />

            <label>Password</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ ...inputStyle, paddingRight: 40 }}
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
                  color: "#666",
                }}
              >
                {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 16px" }}>
              <input
                id="remember"
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <label htmlFor="remember">Remember me</label>
            </div>

            <button type="submit" disabled={loading} style={buttonStyle}>
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
            <label>National ID</label>
            <input
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              placeholder="1xxxxxxxxx"
              style={inputStyle}
              required
            />

            <label>Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05xxxxxxxx or +9665xxxxxxxx"
              style={inputStyle}
              required
            />
            <div style={{ marginTop: -6, marginBottom: 8, fontSize: 12 }}>
              {!phone && <span style={{ color: "#888" }}>Enter phone starting with 05 or +9665</span>}
              {phone && !phoneInfo.ok && (
                <span style={{ color: "#b91c1c" }}>{phoneInfo.reason}</span>
              )}
              {phone && phoneInfo.ok && (
                <span style={{ color: "#065f46" }}>
                  Normalized: {phoneInfo.normalized} {phoneChecking ? " • checking..." : ""}
                  {phoneTaken ? " • already registered" : ""}
                </span>
              )}
            </div>

            <label>Full name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              style={inputStyle}
              required
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label>Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  style={{ ...inputStyle, paddingRight: 8 }}
                  required
                >
                  <option value="">Select…</option>
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
              </div>

              <div>
                <label>Birth date</label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  style={inputStyle}
                  required
                />
              </div>
            </div>

            {/* الموقع: مدينة + حي */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label>City</label>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  style={{ ...inputStyle, paddingRight: 8 }}
                  required
                >
                  <option value="">Select a city…</option>
                  {SA_CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>District</label>
                <select
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  style={{ ...inputStyle, paddingRight: 8 }}
                  required
                  disabled={!city}
                >
                  <option value="">{city ? "Select a district…" : "Choose city first"}</option>
                  {(city ? DISTRICTS_BY_CITY[city] || ["Other…"] : []).map((d) => (
                    <option key={d} value={d === "Other…" ? "__OTHER__" : d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* حقل حي مخصص عند اختيار Other… */}
            {district === "__OTHER__" && (
              <div>
                <label>District (Other)</label>
                <input
                  value={districtOther}
                  onChange={(e) => setDistrictOther(e.target.value)}
                  placeholder="Type district name"
                  style={inputStyle}
                  required
                />
              </div>
            )}

            <label>Password</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ ...inputStyle, paddingRight: 40 }}
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
                  color: "#666",
                }}
              >
                {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            {password.length > 0 && (
              <div style={{ marginTop: -6, marginBottom: 8 }}>
                <div
                  style={{
                    height: 6,
                    background: "#eee",
                    borderRadius: 6,
                    overflow: "hidden",
                  }}
                >
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

            <label>Confirm Password</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPwConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                style={{ ...inputStyle, paddingRight: 40 }}
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
                  color: "#666",
                }}
              >
                {showPwConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            <button type="submit" disabled={loading} style={buttonStyle}>
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

        {msg && <div style={{ marginTop: 12 }}>{msg}</div>}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "1px solid #ddd",
  margin: "6px 0 12px",
  outline: "none",
};

const buttonStyle = {
  width: "100%",
  padding: 12,
  borderRadius: 12,
  border: "none",
  cursor: "pointer",
  background: "linear-gradient(135deg,#B08CC1,#52B9C4)",
  color: "#fff",
  fontWeight: 600,
};

const linkStyle = {
  color: "#52B9C4",
  fontWeight: 600,
  textDecoration: "none",
};
