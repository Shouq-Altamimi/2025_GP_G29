// src/pages/PasswordReset.jsx
"use client";
import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { db } from "../firebase.js";
import { doc, updateDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { getAuth, isSignInWithEmailLink, signInWithEmailLink, signOut } from "firebase/auth";
import { Eye, EyeOff, CheckCircle, Circle } from "lucide-react";

const TD = {
  primary: "#B08CC1",
  teal: "#52B9C4",
  ink: "#4A2C59",
  gray: "#666",
  ok: "#10b981",
};

// SHA-256 للدكاترة والصيادلة
async function hashPasswordSHA256(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// PBKDF2 للمرضى
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

const inputFocus = {
  borderColor: TD.primary,
  boxShadow: "0 0 0 4px rgba(176,140,193,.12)",
};

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

function Label({ children }) {
  return <label style={{ fontSize: 13, color: TD.ink, fontWeight: 600 }}>{children}</label>;
}

export default function PasswordReset() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [step, setStep] = useState("verifying"); // "verifying" | "reset" | "done" | "error"
  const [status, setStatus] = useState("🔄 Verifying your reset link...");
  const [error, setError] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [userCol, setUserCol] = useState("");
  const [userDocId, setUserDocId] = useState("");
  const [userId, setUserId] = useState("");
  const [redirect, setRedirect] = useState("/auth");

  const pwInfo = passwordStrength(newPassword);
  const meetsPolicy = pwInfo.len8 && pwInfo.hasLower && pwInfo.hasUpper && pwInfo.hasDigit;

  // التحقق من الرابط
  useEffect(() => {
    (async () => {
      try {
        const auth = getAuth();
        const href = window.location.href;
        
        console.log("🔗 Password reset URL:", href);
        
        const col = searchParams.get("col") || "";
        const documentId = searchParams.get("doc") || "";
        const id = searchParams.get("id") || "";
        const isReset = searchParams.get("reset") === "true";
        const email = searchParams.get("e") || "";
        const redirectPath = searchParams.get("redirect") || "/auth";

        console.log("📋 Parameters:", { col, documentId, id, isReset, email, redirectPath });

        if (!isSignInWithEmailLink(auth, href)) {
          console.error("❌ Invalid email link");
          setStatus("❌ Invalid or expired reset link");
          setStep("error");
          setError(true);
          return;
        }

        if (!email || !documentId || !col || !isReset) {
          console.error("❌ Missing parameters");
          setStatus("❌ Invalid reset link - missing information");
          setStep("error");
          setError(true);
          return;
        }

        setStatus("🔐 Authenticating...");
        console.log("🔐 Signing in with email link...");
        
        await signInWithEmailLink(auth, email, href);
        console.log("✅ Sign in successful");
        
        await signOut(auth);
        console.log("🚪 Signed out from temp auth");

        // حفظ المعلومات
        setUserCol(col);
        setUserDocId(documentId);
        setUserId(id);
        setRedirect(redirectPath);

        setStatus("✅ Link verified! Please enter your new password.");
        setStep("reset");
        
      } catch (e) {
        console.error("💥 Verification error:", e);
        setError(true);
        setStep("error");
        
        if (e.code === "auth/invalid-action-code") {
          setStatus("❌ This reset link has expired or was already used");
        } else if (e.code === "auth/invalid-email") {
          setStatus("❌ Invalid email address");
        } else {
          setStatus(`❌ Error: ${e?.message || "Failed to verify reset link"}`);
        }
      }
    })();
  }, [searchParams]);

  // التحقق من الرابط (يدعم وضع الـ DEBUG)
/*useEffect(() => {
  (async () => {
    try {
      const href = window.location.href;

      const col = searchParams.get("col") || "";
      const documentId = searchParams.get("doc") || "";
      const id = searchParams.get("id") || "";
      const isReset = searchParams.get("reset") === "true";
      const email = searchParams.get("e") || "";
      const redirectPath = searchParams.get("redirect") || "/auth";
      const debug = searchParams.get("debug") === "1";   // <-- أهم سطر

      console.log("🔗 Reset URL:", href);
      console.log("📋 Params:", { col, documentId, id, email, isReset, debug });

      // ===========================
      //     🔥 DEBUG MODE
      // ===========================
      if (debug) {
        console.log("🚨 DEBUG MODE ACTIVE — Skipping Firebase checks");

        if (!col || !documentId || !id || !email || !isReset) {
          setStatus("❌ Invalid reset link - missing info (debug)");
          setStep("error");
          setError(true);
          return;
        }

        setUserCol(col);
        setUserDocId(documentId);
        setUserId(id);
        setRedirect(redirectPath);

        setStatus("✅ Debug link verified! Enter your new password.");
        setStep("reset");
        return;
      }

      // ===========================
      //   الوضع العادي Firebase
      // ===========================
      const auth = getAuth();

      if (!isSignInWithEmailLink(auth, href)) {
        setStatus("❌ Invalid or expired reset link");
        setStep("error");
        setError(true);
        return;
      }

      if (!email || !documentId || !col || !isReset) {
        setStatus("❌ Invalid reset link (missing data)");
        setStep("error");
        setError(true);
        return;
      }

      setStatus("🔐 Authenticating...");

      await signInWithEmailLink(auth, email, href);
      await signOut(auth);

      setUserCol(col);
      setUserDocId(documentId);
      setUserId(id);
      setRedirect(redirectPath);

      setStatus("✅ Link verified! Enter your new password.");
      setStep("reset");

    } catch (e) {
      console.error("💥 Error:", e);
      setError(true);
      setStep("error");
      setStatus("❌ Error verifying reset link");
    }
  })();
}, [searchParams]);*/


  // تحديث الباسوورد
  async function handleResetPassword(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      if (!newPassword || !confirmPassword) {
        throw new Error("Please fill both password fields");
      }

      if (!meetsPolicy) {
        throw new Error("Password must be at least 8 chars and include lowercase, uppercase, and a digit");
      }

      if (newPassword !== confirmPassword) {
        throw new Error("Passwords do not match");
      }

      console.log("💾 Updating password in Firestore...");
      console.log("Collection:", userCol, "Doc:", userDocId);

      const docRef = doc(db, userCol, userDocId);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        throw new Error("User record not found");
      }

      const userData = docSnap.data();
      let hashedPassword;

      // للمرضى: PBKDF2
      if (userCol === "patients") {
        console.log("Using PBKDF2 for patient");
        const saltB64 = genSaltBase64(16);
        hashedPassword = await pbkdf2Hash(newPassword, saltB64, 100_000);
        
        await updateDoc(docRef, {
          passwordHash: hashedPassword,
          passwordSalt: saltB64,
          passwordAlgo: "PBKDF2-SHA256-100k",
          passwordUpdatedAt: serverTimestamp(),
        });
      } 
      // للدكاترة والصيادلة: SHA-256
      else {
        console.log("Using SHA-256 for", userCol);
        hashedPassword = await hashPasswordSHA256(newPassword);
        
        await updateDoc(docRef, {
          password: hashedPassword,
          passwordUpdatedAt: serverTimestamp(),
        });
      }

      console.log("✅ Password updated successfully");

      setStatus("✅ Password reset successfully!");
      setStep("done");
      setMsg("Your password has been updated. Redirecting to sign in...");

      setTimeout(() => {
        nav("/auth", { replace: true });
      }, 2000);

    } catch (error) {
      console.error("Password reset error:", error);
      setMsg(error.message || "Failed to reset password");
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
        }}
      >
        {/* Logo */}
        <div style={{ display: "grid", placeItems: "center", marginBottom: 16 }}>
          <div style={{ width: 220, height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
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
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
        </div>

        <h2 style={{ margin: 0, color: TD.ink, fontSize: 22, fontWeight: 800 }}>
          Reset Password
        </h2>
        <p style={{ marginTop: 10, color: TD.gray, fontSize: 13.5 }}>
          {step === "verifying" && "Please wait while we verify your reset link..."}
          {step === "reset" && "Create a new strong password for your account."}
          {step === "done" && "Your password has been successfully reset!"}
          {step === "error" && "There was a problem with your reset link."}
        </p>

        {/* Verifying State */}
        {step === "verifying" && (
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-purple-600 border-r-transparent"></div>
            <div style={{ marginTop: 16, fontSize: 14, color: TD.gray }}>
              {status}
            </div>
          </div>
        )}

        {/* Reset Form */}
        {step === "reset" && (
          <form onSubmit={handleResetPassword} style={{ marginTop: 16 }}>
            <Label>New Password</Label>
            <div style={{ position: "relative" }}>
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                style={{ ...inputBase, paddingRight: 44 }}
                onFocus={(e) => Object.assign(e.currentTarget.style, inputFocus)}
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
                onClick={() => setShowNew(!showNew)}
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
                  color: TD.gray,
                }}
              >
                {showNew ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            {newPassword.length > 0 && (
              <div style={{ marginTop: -6, marginBottom: 12 }}>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                  <PwRule ok={pwInfo.hasUpper} label="Uppercase (A–Z)" />
                  <PwRule ok={pwInfo.hasLower} label="Lowercase (a–z)" />
                  <PwRule ok={pwInfo.hasDigit} label="Digit (0–9)" />
                  <PwRule ok={pwInfo.hasSymbol} label="Symbol (!@#$…)" />
                  <PwRule ok={pwInfo.len8} label="Length ≥ 8" />
                </ul>
                
                <div style={{ marginTop: 8 }}>
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
              </div>
            )}

            <Label>Confirm New Password</Label>
            <div style={{ position: "relative" }}>
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                style={{ ...inputBase, paddingRight: 44 }}
                onFocus={(e) => Object.assign(e.currentTarget.style, inputFocus)}
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
                onClick={() => setShowConfirm(!showConfirm)}
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
                  color: TD.gray,
                }}
              >
                {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            {confirmPassword && newPassword !== confirmPassword && (
              <div style={{ marginTop: -6, marginBottom: 8, fontSize: 12, color: "#b91c1c" }}>
                Passwords do not match
              </div>
            )}

            {msg && (
              <div
                style={{
                  marginTop: 8,
                  marginBottom: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: msg.includes("success") || msg.includes("updated") 
                    ? "rgba(16,185,129,.08)" 
                    : "rgba(239,68,68,.08)",
                  color: msg.includes("success") || msg.includes("updated") 
                    ? "#065f46" 
                    : "#7f1d1d",
                  border: `1px solid ${
                    msg.includes("success") || msg.includes("updated")
                      ? "rgba(16,185,129,.25)"
                      : "rgba(239,68,68,.25)"
                  }`,
                  fontSize: 13,
                }}
              >
                {msg}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !meetsPolicy || newPassword !== confirmPassword}
              style={{
                ...buttonStyle,
                marginTop: 4,
                filter: (loading || !meetsPolicy || newPassword !== confirmPassword) 
                  ? "grayscale(30%) brightness(.9)" 
                  : undefined,
                opacity: (loading || !meetsPolicy || newPassword !== confirmPassword) ? 0.6 : 1,
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(.99)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        )}

        {/* Done State */}
        {step === "done" && (
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 16, color: TD.ink, fontWeight: 600, marginBottom: 8 }}>
              {status}
            </div>
            <div style={{ fontSize: 14, color: TD.gray }}>
              {msg}
            </div>
          </div>
        )}

        {/* Error State */}
        {step === "error" && (
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
            <div style={{ fontSize: 16, color: "#b91c1c", fontWeight: 600, marginBottom: 16 }}>
              {status}
            </div>
            <button
              onClick={() => nav("/auth", { replace: true })}
              style={{
                ...buttonStyle,
                maxWidth: 200,
                margin: "0 auto",
              }}
            >
              Return to Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PwRule({ ok, label }) {
  return (
    <li style={{ 
      display: "flex", 
      alignItems: "center", 
      gap: 8, 
      fontSize: 12.5, 
      color: ok ? TD.ok : TD.gray 
    }}>
      {ok ? <CheckCircle size={16} /> : <Circle size={16} />}
      <span>{label}</span>
    </li>
  );
}