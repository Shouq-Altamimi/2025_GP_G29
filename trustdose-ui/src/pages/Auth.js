// src/pages/Auth.js
"use client";
import React, { useMemo, useState, useEffect } from "react";
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

  const salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    pwKey,
    256 // 32 bytes
  );
  const hashBytes = new Uint8Array(bits);
  // إلى Base64 للتخزين
  return btoa(String.fromCharCode(...hashBytes));
}

function genSaltBase64(len = 16) {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf));
}

export default function TrustDoseAuth() {
  const [mode, setMode] = useState("signin");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);

  // Sign in
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");

  // Sign up (Patient)
  const [nationalId, setNationalId] = useState("");
  const [phone, setPhone] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState(""); // "M" | "F"
  const [birthDate, setBirthDate] = useState("");
  const [location, setLocation] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("td_auth_id");
    if (saved) setAccountId(saved);
  }, []);
  useEffect(() => {
    if (remember && accountId) localStorage.setItem("td_auth_id", accountId);
    if (!remember) localStorage.removeItem("td_auth_id");
  }, [remember, accountId]);

  const title = useMemo(
    () => (mode === "signup" ? "Create Patient Account" : "Welcome to TrustDose"),
    [mode]
  );

  /** يحدد المصدر وأسماء الحقول المحتملة للمعرّف */
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

      // للمرضى: جرّب getDoc مباشرة على Ph_<id>
      if (role === "patient") {
        try {
          const p = await getDoc(doc(db, "patients", `Ph_${id}`));
          if (p.exists()) user = p.data();
        } catch {}
      }

      // لو ما لقيناه نجرّب where
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

      // التحقق من كلمة المرور:
      // 1) إذا عندنا passwordHash + passwordSalt → قارن PBKDF2
      // 2) وإلا لو عندنا password نصي (قديم) → قارن نصي (توافق للخلف)
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
        // دعم مؤقت لحسابات قديمة
        if (!pass || String(user.password) !== pass) {
          setMsg("❌ ID or password incorrect.");
          return;
        }
      } else {
        // ما فيه كلمة مرور محفوظة
        console.warn(`[Auth] user has no password fields (allowed in dev).`);
      }

      const displayName = user.name || user.companyName || id;
      localStorage.setItem("userId", id);
      localStorage.setItem("userRole", role);

      setMsg(`✅ Logged in as ${role}. Welcome ${displayName}!`);
      console.log("User data:", { role, id, ...user });
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
      const phoneNum = String(phone).trim();
      const pass = String(password).trim();
      const pass2 = String(confirmPassword).trim();
      const nm = name.trim();
      const g = gender.trim().toUpperCase(); // M | F
      const loc = location.trim();
      const bdate = birthDate.trim(); // yyyy-mm-dd

      // Basic checks
      if (!nid || !phoneNum || !pass || !pass2 || !nm || !g || !bdate || !loc) {
        throw new Error("Please fill all fields.");
      }
      if (!/^\d{10,12}$/.test(nid)) throw new Error("National ID should be 10–12 digits.");
      if (!/^\+?\d{8,15}$/.test(phoneNum))
        throw new Error("Phone should be digits only (e.g. +9665xxxxxxx).");
      if (!["M", "F"].includes(g)) throw new Error("Gender must be M or F.");
      if (pass.length < 4) throw new Error("Password must be at least 4 characters.");
      if (pass !== pass2) throw new Error("Passwords do not match.");

      // birthDate validity
      const bdObj = new Date(bdate);
      if (Number.isNaN(bdObj.getTime())) throw new Error("Invalid birth date.");
      const now = new Date();
      if (bdObj > now) throw new Error("Birth date cannot be in the future.");

      // تأكد ما فيه حساب بنفس الهوية
      const docId = `Ph_${nid}`;
      const existsSnap = await getDoc(doc(db, "patients", docId));
      if (existsSnap.exists()) {
        throw new Error("An account with this National ID already exists.");
      }

      // هاش كلمة المرور + ملح
      const saltB64 = genSaltBase64(16);
      const hashB64 = await pbkdf2Hash(pass, saltB64, 100_000);

      // Write document
      await setDoc(doc(db, "patients", docId), {
        // required by schema
        Location: loc,
        birthDate: Timestamp.fromDate(bdObj),
        contact: phoneNum,
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
      setLocation("");
    } catch (err) {
      setMsg(`❌ ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  }

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
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
            />

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

            <div style={{ marginTop: 12, fontSize: 14 }}>
              First time patient?{" "}
              <a href="#signup" onClick={() => setMode("signup")}>
                Create account
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
              placeholder="+9665xxxxxxxx"
              style={inputStyle}
              required
            />

            <label>Name</label>
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

            <label>Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, Area"
              style={inputStyle}
              required
            />

            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
              required
            />

            <label>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
              required
            />

            <button type="submit" disabled={loading} style={buttonStyle}>
              {loading ? "Creating..." : "Create account"}
            </button>

            <div style={{ marginTop: 12, fontSize: 14 }}>
              Already have an account?{" "}
              <a href="#signin" onClick={() => setMode("signin")}>
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
