// src/pages/Auth.js
"use client";
import React, { useMemo, useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

export default function TrustDoseAuth() {
  const [mode, setMode] = useState("signin");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);

  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [phone, setPhone] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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

  /** يحدد المجموعة وحقل المعرف بناءً على شكل الـID */
  function detectSource(id) {
    const clean = String(id || "").trim();

    // دكتور: Dr-001 أو Dr123
    if (/^dr[-_]?\w+/i.test(clean)) {
      return { coll: "doctors", idField: "DoctorID", role: "doctor" };
    }

    // صيدلية: BranchID مثل B-1 أو Phar_*
    if (/^(phar|b[-_]?)/i.test(clean)) {
      return { coll: "pharmacies", idField: "BranchID", role: "pharmacy" };
    }

    // مريض: رقم وطني (10–12 رقمًا احتياطًا)
    if (/^\d{10,12}$/.test(clean)) {
      return { coll: "patients", idField: "nationalID", role: "patient" };
    }

    // لوجستيات: الشركة بالاسم أو vehicleId لاحقًا
    return { coll: "logistics", idField: "companyName", role: "logistics" };
  }

  // ===== تسجيل الدخول =====
  async function handleSignIn(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      const id = accountId.trim();
      const pass = password.trim();
      if (!id) throw new Error("Please enter your ID");

      // نحدد المصدر
      const { coll, idField, role } = detectSource(id);

      // استعلام مباشر على الحقل المناسب
      const q = query(collection(db, coll), where(idField, "==", id));
      const snap = await getDocs(q);

      if (snap.empty) {
        setMsg("❌ No account found with this ID.");
        return;
      }

      const doc = snap.docs[0];
      const data = doc.data();

      // تحقق كلمة المرور إن وُجد الحقل
      if (Object.prototype.hasOwnProperty.call(data, "password")) {
        if (!pass) {
          setMsg("Please enter your password.");
          return;
        }
        if (String(data.password) !== pass) {
          setMsg("❌ ID or password incorrect.");
          return;
        }
      } else {
        // ما عندنا حقل password — نسمح مؤقتًا وننبّه
        console.warn(
          `[Auth] '${coll}/${doc.id}' has no 'password' field. Allowed login without password (dev mode).`
        );
      }

      // نجاح
      const displayName = data.name || data.companyName || id;
      localStorage.setItem("userId", id);
      localStorage.setItem("userRole", role);

      setMsg(`✅ Logged in as ${role}. Welcome ${displayName}!`);
      console.log("User data:", { role, idField, id, ...data });
      // هنا لاحقًا: توجيه حسب الدور navigate("/doctor") ... إلخ

    } catch (err) {
      console.error(err);
      setMsg(`⚠️ Error: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  // ===== تسجيل مريض جديد (Mock حالياً) =====
  async function handleSignUp(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      if (!nationalId || !phone || !password || !confirmPassword)
        throw new Error("Please fill all fields.");
      if (password !== confirmPassword) throw new Error("Passwords do not match.");

      // لاحقاً: addDoc(collection(db, "patients"), { nationalID, phone, password, ... })
      setMsg("🎉 Account created successfully (mock). You can sign in now.");
      setMode("signin");
      setAccountId(nationalId);
      setPassword("");
      setConfirmPassword("");
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
          width: 420,
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
