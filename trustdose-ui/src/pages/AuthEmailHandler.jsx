// src/pages/AuthEmailHandler.jsx
"use client";
import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { db } from "../firebase.js";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getAuth, isSignInWithEmailLink, signInWithEmailLink, signOut } from "firebase/auth";

export default function AuthEmailHandler() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("🔄 Verifying your email...");
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const auth = getAuth();
        const href = window.location.href;

        console.log("📧 Email verification started");
        console.log("🔗 Current URL:", href);

        // ===== Params (with doctors, pharmacies, patients support) =====
        const colParam = (searchParams.get("col") || "doctors").trim().toLowerCase();
        const safeCol = ["doctors", "pharmacies", "patients" ,  "logistics"].includes(colParam)
          ? colParam
          : "doctors";

        const documentId = (searchParams.get("doc") || "").trim();
        let email = (searchParams.get("e") || "").trim().toLowerCase();

        const redirectParam = (searchParams.get("redirect") || "").trim();
        const defaultRedirect =
          safeCol === "pharmacies"
            ? "/pharmacy"
            : safeCol === "patients"
            ? "/patient"
            : "/doctor";
        const redirect = redirectParam || defaultRedirect;

        console.log("📋 Parameters:", { col: safeCol, documentId, email, redirect });

        // Validate link
        if (!isSignInWithEmailLink(auth, href)) {
          console.error("❌ Invalid email link");
          setStatus("❌ Invalid or expired email link");
          setError(true);
          return;
        }

        // Fallback to local pending email if not in URL
        if (!email) {
          try {
            const pending = JSON.parse(localStorage.getItem("td_email_pending") || "{}");
            if (pending?.email) {
              email = String(pending.email).toLowerCase().trim();
              console.log("ℹ Using pending email from localStorage:", email);
            }
          } catch {}
        }

        if (!email || !documentId) {
          console.error("❌ Missing params");
          setStatus("❌ Missing information in link");
          setError(true);
          return;
        }

        setStatus("🔐 Authenticating...");
        console.log("🔐 Signing in with email link...");

        // Temporary sign-in to verify email ownership
        await signInWithEmailLink(auth, email, href);
        console.log("✅ Sign in successful");

        setStatus("💾 Saving email to profile...");
        console.log("💾 Updating Firestore...");

        // Update Firestore doc (doctor/pharmacy/patient)
        await updateDoc(doc(db, safeCol, documentId), {
          email,
          emailVerifiedAt: serverTimestamp(),
        });
        console.log("✅ Firestore updated");

        // Sign out temp auth
        try {
          await signOut(auth);
        } catch {}

        // Clear pending email
        try {
          localStorage.removeItem("td_email_pending");
        } catch {}

        setStatus("✅ Email verified successfully!");
        console.log("🎉 Verification complete! Redirecting...");

        setTimeout(() => {
          nav(redirect, { replace: true });
        }, 1200);
      } catch (e) {
        console.error("💥 Verification error:", e);
        setError(true);

        if (e?.code === "auth/invalid-action-code") {
          setStatus("❌ This link has expired or was already used");
        } else if (e?.code === "auth/invalid-email") {
          setStatus("❌ Invalid email address");
        } else if (e?.code === "auth/network-request-failed") {
          setStatus("❌ Network error. Check your connection");
        } else {
          setStatus(`❌ Error: ${e?.message || "Failed to verify email"}`);
        }
      }
    })();
  }, [searchParams, nav]);

  const colParam = (searchParams.get("col") || "doctors").trim().toLowerCase();
  const fallbackRedirect =
    colParam === "pharmacies"
      ? "/pharmacy"
      : colParam === "patients"
      ? "/patient"
      : "/doctor";

  return (
    <div
      className="min-h-screen grid place-items-center"
      style={{ background: "linear-gradient(135deg, #f5f3ff 0%, #eff6ff 100%)" }}
    >
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center border border-gray-100">
          {/* Logo */}
          <div className="mb-6">
            <img
              src="/Images/TrustDose_logo.png"
              alt="TrustDose"
              className="h-16 mx-auto"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          </div>

          {/* Status message */}
          <div
            className={`text-lg font-medium mb-2 ${
              error ? "text-red-600" : status.includes("✅") ? "text-green-600" : "text-gray-700"
            }`}
          >
            {status}
          </div>

          {/* Loading spinner */}
          {!error && !status.includes("✅") && (
            <div className="mt-4">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-purple-600 border-r-transparent"></div>
            </div>
          )}

          {/* Error button */}
          {error && (
            <button
              onClick={() => nav(fallbackRedirect, { replace: true })}
              className="mt-6 px-6 py-3 rounded-lg text-white font-medium transition-all hover:scale-105"
              style={{ background: "#B08CC1" }}
            >
              Return to Dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
