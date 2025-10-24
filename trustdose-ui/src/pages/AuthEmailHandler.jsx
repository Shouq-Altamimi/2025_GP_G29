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
        
        // استخرجي الباراميترات
        const col = searchParams.get("col") || "doctors";
        const documentId = searchParams.get("doc") || "";
        const email = searchParams.get("e") || "";
        const redirect = searchParams.get("redirect") || "/doctor";

        console.log("📋 Parameters:", { col, documentId, email, redirect });

        // تحققي إن الرابط صالح من Firebase
        if (!isSignInWithEmailLink(auth, href)) {
          console.error("❌ Invalid email link");
          setStatus("❌ Invalid or expired email link");
          setError(true);
          return;
        }

        if (!email || !documentId) {
          console.error("❌ Missing params");
          setStatus("❌ Missing information in link");
          setError(true);
          return;
        }

        setStatus("🔐 Authenticating...");
        console.log("🔐 Signing in with email link...");
        
        // سجلي دخول مؤقت عشان Firebase يتحقق
        await signInWithEmailLink(auth, email, href);
        console.log("✅ Sign in successful");
        
        setStatus("💾 Saving email to profile...");
        console.log("💾 Updating Firestore...");
        
        // حدّثي بيانات الدكتور في Firestore
        await updateDoc(doc(db, col, documentId), {
          email,
          emailVerifiedAt: serverTimestamp(),
        });
        console.log("✅ Firestore updated");
        
        // اطلعي من Firebase Auth (مجرد تحقق مؤقت)
        await signOut(auth);
        console.log("🚪 Signed out from temp auth");

        // امسحي الـ pending email
        localStorage.removeItem("td_email_pending");

        setStatus("✅ Email verified successfully!");
        console.log("🎉 Verification complete! Redirecting...");
        
        setTimeout(() => {
          nav(redirect, { replace: true });
        }, 1500);
        
      } catch (e) {
        console.error("💥 Verification error:", e);
        setError(true);
        
        // رسائل واضحة للأخطاء الشائعة
        if (e.code === "auth/invalid-action-code") {
          setStatus("❌ This link has expired or was already used");
        } else if (e.code === "auth/invalid-email") {
          setStatus("❌ Invalid email address");
        } else if (e.code === "auth/network-request-failed") {
          setStatus("❌ Network error. Check your connection");
        } else {
          setStatus(`❌ Error: ${e?.message || "Failed to verify email"}`);
        }
      }
    })();
  }, [searchParams, nav]);

  return (
    <div className="min-h-screen grid place-items-center" style={{ 
      background: "linear-gradient(135deg, #f5f3ff 0%, #eff6ff 100%)" 
    }}>
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center border border-gray-100">
          
          {/* Logo */}
          <div className="mb-6">
            <img 
              src="/Images/TrustDose_logo.png" 
              alt="TrustDose" 
              className="h-16 mx-auto"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          </div>
          
          {/* Status Message */}
          <div className={`text-lg font-medium mb-2 ${
            error ? 'text-red-600' : 
            status.includes('✅') ? 'text-green-600' : 
            'text-gray-700'
          }`}>
            {status}
          </div>
          
          {/* Loading indicator */}
          {!error && !status.includes('✅') && (
            <div className="mt-4">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-purple-600 border-r-transparent"></div>
            </div>
          )}
          
          {/* Error button */}
          {error && (
            <button
              onClick={() => nav("/doctor", { replace: true })}
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