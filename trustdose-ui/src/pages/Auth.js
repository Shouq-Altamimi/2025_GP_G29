// src/pages/Auth.js
"use client";
import React, { useMemo, useState, useEffect } from "react";
import { Eye, EyeOff, CheckCircle, Circle, X } from "lucide-react";
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
import { getAuth, sendSignInLinkToEmail } from "firebase/auth";
import { ethers } from "ethers";

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

async function hashPasswordSHA256(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyPasswordSHA256(inputPassword, storedHash) {
  const inputHash = await hashPasswordSHA256(inputPassword);
  return inputHash === storedHash;
}

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

async function pbkdf2Hex(password, saltBase64, iterations = 100_000) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const salt = Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256
  );
  return Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function genSaltBase64(len = 16) {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf));
}

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

// ✅ منع الأحرف والأرقام العربية
function hasArabic(str) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(
    str
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

  // ✅ منع العربي
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
  return {
    ok: false,
    reason:
      "Phone must start with 5 followed by 8 digits (e.g., +9665xxxxxxxx).",
  };
}

// ✅ التحقق المحسّن من الهوية الوطنية
function isValidNationalIdStrict(raw) {
  const s = String(raw || "");
  if (/\s/.test(s)) return false;
  if (hasArabic(s)) return false;
  return /^[12][0-9]{9}$/.test(s);
}

function isValidNationalIdLive(raw) {
  const s = String(raw || "");
  if (s === "") return { ok: true, reason: "" };
  if (/\s/.test(s)) return { ok: false, reason: "No spaces allowed." };
  if (hasArabic(s)) return { ok: false, reason: "Arabic not allowed." };
  if (!/^[0-9]*$/.test(s))
    return { ok: false, reason: "Digits 0-9 only (ASCII)." };
  if (s.length >= 1 && !/^[12]/.test(s))
    return { ok: false, reason: "Must start with 1 or 2." };

  // ✅ رسالة خطأ فقط إذا أقل من 10
  if (s.length > 0 && s.length < 10) {
    return { ok: false, reason: "National ID must be exactly 10 digits." };
  }
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

function Label({ children, required }) {
  return (
    <label style={{ fontSize: 13, color: TD.ink, fontWeight: 600 }}>
      {children}
      {required && <span style={{ color: TD.err, marginLeft: 4 }}>*</span>}
    </label>
  );
}

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

  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");

  const [showForgotPw, setShowForgotPw] = useState(false);
  const [forgotId, setForgotId] = useState("");
  const [forgotMsg, setForgotMsg] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);

  const [nationalId, setNationalId] = useState("");
  const [nationalIdErr, setNationalIdErr] = useState("");
  const [phone, setPhone] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [nameErr, setNameErr] = useState("");
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthDateErr, setBirthDateErr] = useState("");

  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [districtOther, setDistrictOther] = useState("");

  const [pwInfo, setPwInfo] = useState(passwordStrength(""));
  const [phoneInfo, setPhoneInfo] = useState({
    ok: false,
    reason: "",
    normalized: "",
  });
  const [phoneChecking, setPhoneChecking] = useState(false);
  const [phoneTaken, setPhoneTaken] = useState(false);

  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMsg, setAdminMsg] = useState("");

  const isSignup = mode === "signup";
  const inputCompact = isSignup
    ? { padding: "10px 12px", borderRadius: 10, fontSize: 13.5 }
    : {};

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
        const qRef = query(
          collection(db, "patients"),
          where("contact", "==", info.normalized)
        );
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

  function detectSource(id) {
    const clean = String(id || "").trim();

    if (/^B-\d+$/i.test(clean)) {
      return { coll: "pharmacies", idFields: ["BranchID"], role: "pharmacy" };
    }

    if (/^dr[-_]?\w+/i.test(clean)) {
      return {
        coll: "doctors",
        idFields: ["DoctorID", "doctorId", "accessId"],
        role: "doctor",
      };
    }

    if (/^(ph|phar|pharmacy)[-_]?\w+/i.test(clean)) {
      return {
        coll: "pharmacies",
        idFields: ["BranchID", "PharmacyID"],
        role: "pharmacy",
      };
    }

    if (/^\d{10,12}$/.test(clean)) {
      return {
        coll: "patients",
        idFields: ["nationalID", "nationalId"],
        role: "patient",
      };
    }
    if (/^LG-\d{3}$/i.test(clean)) {
      return {
        coll: "logistics",
        idFields: ["LogisticsID"],
        role: "logistics",
      };
    }
  }

  async function handleAdminMetaMaskLogin() {
    try {
      setAdminMsg("");
      setAdminLoading(true);

      if (!window.ethereum) {
        setAdminMsg("Please install MetaMask first.");
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      if (!accounts?.length) {
        setAdminMsg("No wallet has been selected.");
        return;
      }
      const address = String(accounts[0]).toLowerCase();

      setAdminMsg("Checking administrator privileges...");

      const ref = doc(db, "admins", address);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setAdminMsg("⚠️This address is not registered as an administrator.");
        return;
      }

      try {
        const signer = await provider.getSigner();
        const msg = `TrustDose Admin Login\nAddress: ${address}\nNonce: ${Date.now()}`;
        await signer.signMessage(msg);
      } catch {}

      localStorage.setItem("userRole", "admin");
      localStorage.setItem("wallet", address);
      localStorage.setItem("userId", address);

      setAdminMsg("✅ Logged in as administrator");
      // ⬇️ التوجيه مباشرة لصفحة الداشبورد
      navigate("/admin/dashboard", { replace: true });
    } catch (e) {
      console.error(e);
      setAdminMsg("An error occurred while connecting to your wallet.");
    } finally {
      setAdminLoading(false);
    }
  }
//////////////////////
// ========== Fake RESET EMAIL (for testing ONLY) ========== //
/*async function fakeSendPasswordResetEmail(auth, email, actionCodeSettings) {
  try {
    if (!actionCodeSettings || !actionCodeSettings.url) {
      console.error("❌ actionCodeSettings.url is missing");
      throw new Error("Internal error: URL not generated");
    }

    const base = String(actionCodeSettings.url).trim();

    // generate fake oobCode manually
    const fakeOob =
      "FAKE_" + Math.random().toString(36).substring(2, 10).toUpperCase();

    const finalLink = `${base}&mode=resetPassword&oobCode=${fakeOob}&debug=1`;

    console.log("==================================");
    console.log("🔐 FAKE PASSWORD RESET EMAIL");
    console.log("To:", email);
    console.log("Reset Link:");
    console.log(finalLink);
    console.log("==================================");

    return Promise.resolve();
  } catch (err) {
    console.error("FAKE RESET ERROR:", err);
    throw err;
  }
}
*/
//////////////////////
  async function handleForgotPassword(e) {
    e.preventDefault();
    setForgotMsg("");
    setForgotLoading(true);

    try {
      const id = forgotId.trim();
      if (!id) throw new Error("Please enter your ID");

      const { coll, idFields, role } = detectSource(id);
      let user = null;
      let userDocId = null;

      if (role === "patient") {
        try {
          const p = await getDoc(doc(db, "patients", `Ph_${id}`));
          if (p.exists()) {
            user = p.data();
            userDocId = p.id;
          }
        } catch {}
      }

      if (!user && /^B-\d+$/i.test(id)) {
        try {
          let snap = await getDocs(
            query(collection(db, "Phar_Nahdi"), where("BranchID", "==", id))
          );
          if (!snap.empty) {
            user = snap.docs[0].data();
            userDocId = snap.docs[0].id;
          }

          if (!user) {
            snap = await getDocs(
              query(collection(db, "pharmacies"), where("BranchID", "==", id))
            );
            if (!snap.empty) {
              user = snap.docs[0].data();
              userDocId = snap.docs[0].id;
            }
          }
        } catch {}
      }

      if (!user && /^LG-\d{3}$/i.test(id)) {
        try {
          const snap = await getDocs(
            query(collection(db, "logistics"), where("LogisticsID", "==", id))
          );
          if (!snap.empty) {
            user = snap.docs[0].data();
            userDocId = snap.docs[0].id;
            // coll = "logistics";  // ملاحظة: هذا السطر عندك أصلاً، ما لمسته
          }
        } catch {}
      }
      if (!user) {
        for (const f of idFields) {
          try {
            const q = query(collection(db, coll), where(f, "==", id));
            const snap = await getDocs(q);
            if (!snap.empty) {
              user = snap.docs[0].data();
              userDocId = snap.docs[0].id;
              break;
            }
          } catch {}
        }
      }

      if (!user) {
        setForgotMsg("❌ No account found with this ID.");
        return;
      }

      const email = user.email;
      if (!email) {
        setForgotMsg(
          "❌ No email registered for this account. Please contact support."
        );
        return;
      }

      const auth = getAuth();
      const BASE = window.location.origin;

      const params = new URLSearchParams({
        col: coll,
        doc: String(userDocId || ""),
        id: id,
        reset: "true",
        e: email,
        redirect: "/auth",
      });

      const actionCodeSettings = {
        url: `${BASE}/password-reset?${params.toString()}`,
        handleCodeInApp: true,
      };

     await sendSignInLinkToEmail(auth, email, actionCodeSettings);
     //await fakeSendPasswordResetEmail(auth, email, actionCodeSettings);


      setForgotMsg(
        `✅ Password reset link sent to ${email}. Check your inbox and spam folder!`
      );
      setTimeout(() => {
        setShowForgotPw(false);
        setForgotId("");
        setForgotMsg("");
      }, 3000);
    } catch (err) {
      console.error("Forgot password error:", err);
      let errorMessage = "Failed to send reset link";
      if (err.code === "auth/invalid-email") {
        errorMessage = "Invalid email address";
      } else if (err.code === "auth/too-many-requests") {
        errorMessage = "Too many requests. Please try again later";
      } else if (err.message) {
        errorMessage = err.message;
      }
      setForgotMsg(`❌ ${errorMessage}`);
    } finally {
      setForgotLoading(false);
    }
  }
  ///////////////////////////////////////////////////////////////////////////
  /*
  ... (بلوك الـ DEBUG القديم تبع handleForgotPassword موجود عندك ومعلّق، ما لمسته)
  */
  ///////////////////////////////////////////////////////////////////////////

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
      let userDocId = null;

      if (role === "patient") {
        try {
          const p = await getDoc(doc(db, "patients", `Ph_${id}`));
          if (p.exists()) {
            user = p.data();
            userDocId = p.id;
          }
        } catch {}
      }

      if (!user && /^B-\d+$/i.test(id)) {
        try {
          let snap = await getDocs(
            query(collection(db, "Phar_Nahdi"), where("BranchID", "==", id))
          );
          if (!snap.empty) {
            user = snap.docs[0].data();
            userDocId = snap.docs[0].id;
          }

          if (!user) {
            snap = await getDocs(
              query(collection(db, "pharmacies"), where("BranchID", "==", id))
            );
            if (!snap.empty) {
              user = snap.docs[0].data();
              userDocId = snap.docs[0].id;
            }
          }
        } catch {}
      }

      if (!user) {
        // Search using all doctor ID fields
        for (const f of idFields) {
          try {
            const q = query(collection(db, coll), where(f, "==", id));
            const snap = await getDocs(q);

            if (!snap.empty) {
              user = snap.docs[0].data();
              userDocId = snap.docs[0].id;
              break;
            }
          } catch (e) {
            console.warn("Query error on field:", f, e);
          }
        }
      }

      if (!user) {
        setMsg("❌ ID or password incorrect.");
        return;
      }

      console.log("🔐 Verifying password for role:", role);

      let verified = false;
      // FORCE tempPassword for doctors
      console.log("LOGIN DEBUG → doctor:", {
        enteredPassword: pass,
        tempPassword: user.tempPassword,
        password: user.password,
        passwordHash: user.passwordHash,
      });

      // ========= Doctor login logic (مع صلاحية ٢٤ ساعة للتمبرري) =========
      if (role === "doctor") {
        // 0) If password empty → show message
        if (!pass) {
          setMsg("Please enter your password.");
          return;
        }

        const tempMeta = user.tempPassword || null;

        // 1) تمبرري باسورد موجودة وفعّالة
        if (tempMeta && tempMeta.valid) {
          const expiresAtMs = Number(tempMeta.expiresAtMs || 0);
          const nowMs = Date.now();

          // انتهت مدة الـ ٢٤ ساعة أو قيمة الانتهاء مفقودة
          if (!expiresAtMs || nowMs > expiresAtMs) {
            setMsg("❌ Temporary password has expired");
            return;
          }

          // التمبرري لسه صالحة → نتحقق من الباسورد باستخدام الهاش
          if (user.passwordHash) {
            const ok = await verifyPasswordSHA256(pass, user.passwordHash);
            if (!ok) {
              setMsg("❌ ID or password incorrect.");
              return;
            }
            verified = true;
          } else if (user.password) {
            // احتياط لو كان موجود password كهاش قديم
            const ok = await verifyPasswordSHA256(pass, user.password);
            if (!ok) {
              setMsg("❌ ID or password incorrect.");
              return;
            }
            verified = true;
          } else {
            setMsg("❌ This doctor account has no password.");
            return;
          }
        }

        // 2) ما عنده تمبرري فعّالة → نتعامل معه كـ باسورد دائمة
        else if (user.password) {
          const ok = await verifyPasswordSHA256(pass, user.password);
          if (!ok) {
            setMsg("❌ ID or password incorrect.");
            return;
          }
          verified = true;
        }

        // 3) fallback: لو عنده فقط passwordHash
        else if (user.passwordHash) {
          const ok = await verifyPasswordSHA256(pass, user.passwordHash);
          if (!ok) {
            setMsg("❌ ID or password incorrect.");
            return;
          }
          verified = true;
        } else {
          setMsg("❌ This doctor account has no password.");
          return;
        }
      }

      // 2) PBKDF2 hashing
      else if (!verified && "passwordHash" in user && "passwordSalt" in user) {
        if (!pass) {
          setMsg("Please enter your password.");
          return;
        }

        const stored = String(user.passwordHash);
        const iter = Number(user.passwordIter) || 100_000;

        let derived = "";
        if (/^[a-f0-9]{64}$/i.test(stored)) {
          derived = await pbkdf2Hex(pass, user.passwordSalt, iter);
        } else {
          derived = await pbkdf2Hash(pass, user.passwordSalt, iter);
        }

        if (derived !== stored) {
          setMsg("❌ ID or password incorrect.");
          return;
        }

        verified = true;
      }

      // 3) Logistics SHA256
      /*else if (!verified && role === "logistics" && user.passwordHash) {
        if (!pass) {
          setMsg("Please enter your password.");
          return;
        }

        const ok = await verifyPasswordSHA256(pass, user.passwordHash);
        if (!ok) {
          setMsg("❌ ID or password incorrect.");
          return;
        }
        verified = true;
      }*/
     /////////////////////////////////////////////////////////////////
     // 3) Logistics SHA256 (stored in `password`)
else if (!verified && role === "logistics" && user.password) {
  if (!pass) {
    setMsg("Please enter your password.");
    return;
  }

  const stored = String(user.password).trim();

  // hashed SHA256 (64 hex) – نفس اللي نخزّنه من LogisticsHeader
  if (/^[a-f0-9]{64}$/i.test(stored)) {
    const ok = await verifyPasswordSHA256(pass, stored);
    if (!ok) {
      setMsg("❌ ID or password incorrect.");
      return;
    }
    verified = true;
  }
  else if (pass === stored) {
    // دعم قديم لو كان الباسورد نص عادي
    verified = true;
  } else {
    setMsg("❌ ID or password incorrect.");
    return;
  }
}


      // 4) Plain / sha256 password
      //else if (!verified && "password" in user) {
      else if (!verified && "password" in user && role !== "logistics") {
        if (!pass) {
          setMsg("Please enter your password.");
          return;
        }

        const stored = String(user.password).trim();

        // hashed SHA256 (64 hex)
        if (/^[a-f0-9]{64}$/i.test(stored)) {
          const ok = await verifyPasswordSHA256(pass, stored);
          if (!ok) {
            setMsg("❌ ID or password incorrect.");
            return;
          }
          verified = true;
        }

        // plain text (legacy)
        else if (pass === stored) {
          verified = true;
        } else {
          setMsg("❌ ID or password incorrect.");
          return;
        }
      }

      // 5) No password fields
      else if (!verified) {
        setMsg("❌ This account has no password.");
        return;
      }

      const displayName = user.name || user.companyName || id;

      if (role === "pharmacy") {
        localStorage.setItem("userRole", "pharmacy");
        localStorage.setItem("userId", userDocId || id);
        if (user.BranchID) {
          localStorage.setItem("pharmacyBranchId", user.BranchID);
        }
      } else if (role === "logistics") {
        const welcomeLogistics = {
          logisticsId: user.LogisticsID || user.logisticsId || id,
          companyName: user.companyName || "",
          vehicleId: user.vehicleId || "",
        };

        localStorage.setItem("userRole", "logistics");
        localStorage.setItem("userId", welcomeLogistics.logisticsId);
        localStorage.setItem(
          "welcome_logistics",
          JSON.stringify(welcomeLogistics)
        );
      } else {
        localStorage.setItem("userId", id);
        localStorage.setItem("userRole", role);
      }

      setMsg(`✅ Logged in as ${role}. Welcome ${displayName}!`);

      if (role === "doctor") {
        const welcomeDoctor = {
          DoctorID: user.DoctorID || id,
          name: user.name || "",
          healthFacility:
            user.healthFacility || user.healthFacilityName || "",
          speciality: user.speciality || user.specialization || "",
          phone: user.phone || "",
        };

        localStorage.setItem(
          "welcome_doctor",
          JSON.stringify(welcomeDoctor)
        );
        navigate("/doctor", { replace: true });
        setLoading(false);
        return;
      } else if (role === "pharmacy") navigate("/pharmacy", { replace: true });
      else if (role === "patient") navigate("/patient", { replace: true });
      else if (role === "logistics") navigate("/logistics", { replace: true });
      else navigate("/", { replace: true });
    } catch (err) {
      console.error(err);
      setMsg(`⚠️ Error: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      const nidAscii = toEnglishDigits(String(nationalId ?? "")).trim();
      if (!isValidNationalIdStrict(nidAscii)) {
        throw new Error(
          "National ID must be exactly 10 digits starting with 1 or 2."
        );
      }

      const phoneRaw = String(phone ?? "");
      const phoneCheck = validateAndNormalizePhone(phoneRaw);

      const pass = String(password ?? "").trim();
      const pass2 = String(confirmPassword ?? "").trim();
      const nm = String(name ?? "").trim();
      const g = String(gender ?? "").trim();
      const c = String(city ?? "").trim();
      const d = String(
        district === "__OTHER__"
          ? districtOther ?? ""
          : district ?? ""
      ).trim();

      const bdateStr = String(birthDate ?? "").trim();
      let bdObj;
      {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bdateStr);
        if (!m) throw new Error("Invalid birth date.");
        const y = Number(m[1]),
          mo = Number(m[2]),
          dy = Number(m[3]);
        bdObj = new Date(Date.UTC(y, mo - 1, dy, 0, 0, 0));
      }
      if (Number.isNaN(bdObj.getTime()))
        throw new Error("Invalid birth date.");

      const maxBirth = new Date(Date.UTC(2007, 11, 31, 23, 59, 59));
      if (bdObj > maxBirth)
        throw new Error("Birth date must be 2007 or earlier.");

      if (!phoneCheck.ok) throw new Error(phoneCheck.reason || "Invalid phone.");
      const phoneNorm = phoneCheck.normalized;

      if (
        !nidAscii ||
        !phoneRaw ||
        !pass ||
        !pass2 ||
        !nm ||
        !g ||
        !bdateStr ||
        !c ||
        !d
      ) {
        throw new Error("Please fill all fields.");
      }
      if (!["Male", "Female"].includes(g))
        throw new Error("Gender must be Male or Female.");

      const pw = passwordStrength(pass);
      const meetsPolicy =
        pw.len8 && pw.hasLower && pw.hasUpper && pw.hasDigit;
      if (!meetsPolicy)
        throw new Error(
          "Password must be at least 8 chars and include lowercase, uppercase, and a digit."
        );
      if (pass !== pass2) throw new Error("Passwords do not match.");

      const docId = `Ph_${nidAscii}`;

      const existsSnap = await getDoc(doc(db, "patients", docId));
      if (existsSnap.exists())
        throw new Error(
          "An account with this National ID already exists."
        );

      const phoneQ = query(
        collection(db, "patients"),
        where("contact", "==", phoneNorm)
      );
      const phoneSnap = await getDocs(phoneQ);
      if (!phoneSnap.empty)
        throw new Error("This phone number is already registered.");

      const saltB64 = genSaltBase64(16);
      const hashB64 = await pbkdf2Hash(pass, saltB64, 100_000);

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
      setNameErr("");
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
      console.error("signup error:", err);
      setMsg(`❌ ${err?.message || err}`);
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
        <div
          style={{
            display: "grid",
            placeItems: "center",
            marginBottom: 16,
          }}
        >
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

        <h2
          style={{
            margin: 0,
            color: TD.ink,
            fontSize: 22,
            fontWeight: 800,
          }}
        >
          {title}
        </h2>
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
              onChange={(e) => {
                const val = e.target.value;
                if (hasArabic(val)) return;
                setAccountId(val);
              }}
              onPaste={(e) => {
                const paste = e.clipboardData.getData("text");
                if (hasArabic(paste)) {
                  e.preventDefault();
                  return;
                }
              }}
              placeholder="DoctorID / PharmacyID / NationalID / LogisticID"
              style={inputBase}
              onFocus={(e) =>
                Object.assign(e.currentTarget.style, inputFocus(false))
              }
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
                onChange={(e) => {
                  const val = e.target.value;
                  if (hasArabic(val)) return;
                  setPassword(val);
                }}
                onPaste={(e) => {
                  const paste = e.clipboardData.getData("text");
                  if (hasArabic(paste)) {
                    e.preventDefault();
                    return;
                  }
                }}
                placeholder="••••••••"
                style={{ ...inputBase, paddingRight: 44 }}
                onFocus={(e) =>
                  Object.assign(e.currentTarget.style, inputFocus(false))
                }
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
              <label
                htmlFor="remember"
                style={{ fontSize: 13.5, color: "#333" }}
              >
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
              onMouseDown={(e) =>
                (e.currentTarget.style.transform = "scale(.99)")
              }
              onMouseUp={(e) =>
                (e.currentTarget.style.transform = "scale(1)")
              }
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center",
                gap: 8,
                margin: "14px 0 10px",
              }}
            >
              <span style={{ height: 1, background: "#eee" }} />
              <span style={{ color: "#888", fontSize: 12 }}>or</span>
              <span style={{ height: 1, background: "#eee" }} />
            </div>

            <button
              type="button"
              onClick={handleAdminMetaMaskLogin}
              disabled={adminLoading}
              style={{
                ...buttonStyle,
                background: `linear-gradient(135deg, ${TD.primary}, ${TD.teal})`,
                boxShadow: "0 8px 20px rgba(82,185,196,.25)",
              }}
              onMouseDown={(e) =>
                (e.currentTarget.style.transform = "scale(.99)")
              }
              onMouseUp={(e) =>
                (e.currentTarget.style.transform = "scale(1)")
              }
            >
              {adminLoading
                ? "Connecting Wallet..."
                : "Admin – Sign in with MetaMask"}
            </button>

            {adminMsg && (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: adminMsg.startsWith("✅")
                    ? "rgba(16,185,129,.08)"
                    : "rgba(239,68,68,.08)",
                  color: adminMsg.startsWith("✅") ? "#065f46" : "#7f1d1d",
                  border: `1px solid ${
                    adminMsg.startsWith("✅")
                      ? "rgba(16,185,129,.25)"
                      : "rgba(239,68,68,.25)"
                  }`,
                  fontSize: 13.5,
                }}
              >
                {adminMsg}
              </div>
            )}

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
                <a
                  href="#signup"
                  onClick={() => setMode("signup")}
                  style={linkStyle}
                >
                  Create account
                </a>
              </span>

              <a
                href="#forgot"
                onClick={(e) => {
                  e.preventDefault();
                  setShowForgotPw(true);
                }}
                style={linkStyle}
              >
                Forgot password?
              </a>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSignUp}>
            {/* ========== National ID ========== */}
            <Label required>National ID</Label>
            <input
              value={nationalId}
              onChange={(e) => {
                const v = e.target.value;
                if (hasArabic(v)) return;

                if (v.length === 1 && v !== "1" && v !== "2") {
                  setNationalIdErr("Must start with 1 or 2");
                  return;
                }

                if (!/^[0-9]*$/.test(v)) {
                  setNationalIdErr("Digits 0-9 only");
                  return;
                }

                const live = isValidNationalIdLive(v);
                setNationalId(v);
                setNationalIdErr(live.ok ? "" : live.reason);
              }}
              onPaste={(e) => {
                const paste = e.clipboardData.getData("text");
                if (hasArabic(paste)) {
                  e.preventDefault();
                  return;
                }

                const cleaned = paste.trim().replace(/\s/g, "");
                if (cleaned.length > 0 && cleaned[0] !== "1" && cleaned[0] !== "2") {
                  e.preventDefault();
                  setNationalIdErr("Must start with 1 or 2");
                  return;
                }

                if (!/^[12][0-9]*$/.test(cleaned)) {
                  e.preventDefault();
                  setNationalIdErr("Must start with 1 or 2, followed by digits");
                  return;
                }
              }}
              placeholder="1xxxxxxxxx or 2xxxxxxxxx"
              style={{
                ...inputBase,
                ...inputCompact,
                ...(nationalIdErr
                  ? {
                      borderColor: TD.err,
                      boxShadow: "0 0 0 4px rgba(220,38,38,.08)",
                    }
                  : {}),
              }}
              onFocus={(e) =>
                Object.assign(e.currentTarget.style, inputFocus(!!nationalIdErr))
              }
              onBlur={(e) =>
                Object.assign(e.currentTarget.style, {
                  borderColor: "#DFE3E8",
                  boxShadow: "0 3px 14px rgba(0,0,0,.04)",
                })
              }
              required
              maxLength={10}
              inputMode="numeric"
              pattern="[12][0-9]{9}"
              title="Exactly 10 digits starting with 1 or 2"
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

                if (allowedControl.includes(e.key)) return;

                if (
                  nationalId.length === 0 &&
                  e.key !== "1" &&
                  e.key !== "2"
                ) {
                  e.preventDefault();
                  setNationalIdErr("Must start with 1 or 2");
                  return;
                }

                if (!/^[0-9]$/.test(e.key)) {
                  e.preventDefault();
                  return;
                }
              }}
            />
            {nationalIdErr && (
              <div
                style={{
                  marginTop: -6,
                  marginBottom: 8,
                  fontSize: 12,
                  color: "#b91c1c",
                }}
              >
                {nationalIdErr}
              </div>
            )}

            {/* ========== Phone ========== */}
            <Label required>Phone</Label>
            <div style={{ position: "relative" }}>
              <input
                value={phone}
                onChange={(e) => {
                  let val = e.target.value;

                  if (!val.startsWith("+966")) {
                    val = "+966" + val.replace(/^\+?966?/, "");
                  }

                  if (hasArabic(val)) return;

                  val = val.replace(/\s/g, "");

                  const afterPrefix = val.slice(4);
                  if (afterPrefix && !/^[0-9]*$/.test(afterPrefix)) return;

                  if (val.length > 13) return;

                  setPhone(val);
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const paste = e.clipboardData.getData("text").trim();
                  if (hasArabic(paste)) return;

                  let cleaned = paste.replace(/\s/g, "");

                  if (cleaned.startsWith("05")) {
                    setPhone("+966" + cleaned.slice(1));
                  } else if (cleaned.startsWith("5")) {
                    setPhone("+966" + cleaned);
                  } else if (cleaned.startsWith("+9665")) {
                    setPhone(cleaned);
                  } else if (cleaned.match(/^9665\d{8}$/)) {
                    setPhone("+" + cleaned);
                  } else {
                    setPhone(
                      "+966" + cleaned.replace(/^\+?966?5?/, "")
                    );
                  }
                }}
                placeholder="+966 5xxxxxxxx"
                style={{
                  ...inputBase,
                  ...inputCompact,
                  paddingLeft: "14px",
                }}
                onFocus={(e) => {
                  if (!phone || phone === "") {
                    setPhone("+966");
                  }
                  Object.assign(
                    e.currentTarget.style,
                    inputFocus(
                      !(
                        phone === "" ||
                        phone === "+966" ||
                        (phoneInfo.ok && !phoneTaken)
                      ) && !!phone
                    )
                  );
                }}
                onBlur={(e) => {
                  if (phone === "+966") {
                    setPhone("");
                  }
                  Object.assign(e.currentTarget.style, {
                    borderColor: "#DFE3E8",
                    boxShadow: "0 3px 14px rgba(0,0,0,.04)",
                  });
                }}
                required
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
                }}
              />
            </div>
            <div
              style={{ marginTop: -6, marginBottom: 8, fontSize: 12 }}
            >
              {(!phone || phone === "+966") && (
                <span style={{ color: "#888" }}>
                  Enter phone: +966 5xxxxxxxx (9 digits after +966)
                </span>
              )}
              {phone && phone !== "+966" && !phoneInfo.ok && (
                <span style={{ color: "#b91c1c" }}>
                  {phoneInfo.reason}
                </span>
              )}
              {phone && phone !== "+966" && phoneInfo.ok && !phoneTaken && (
                <span style={{ color: "#065f46" }}>
                  ✓ Valid phone number
                  {phoneChecking && " • checking..."}
                </span>
              )}
              {phone && phoneInfo.ok && phoneTaken && (
                <span style={{ color: "#b91c1c" }}>
                  Already registered
                </span>
              )}
            </div>

            {/* ========== Full name ========== */}
            <Label required>Full name</Label>
            <input
              value={name}
              onChange={(e) => {
                const val = e.target.value;
                if (hasArabic(val)) return;

                if (!/^[A-Za-z\s]*$/.test(val)) {
                  setNameErr("Letters only (no numbers or symbols)");
                  return;
                }

                if (val.length > 50) {
                  setNameErr("Maximum 50 characters");
                  return;
                }

                setName(val);
                setNameErr("");
              }}
              onPaste={(e) => {
                const paste = e.clipboardData.getData("text");
                if (hasArabic(paste)) {
                  e.preventDefault();
                  return;
                }
                if (!/^[A-Za-z\s]*$/.test(paste)) {
                  e.preventDefault();
                  setNameErr("Letters only (no numbers or symbols)");
                  return;
                }
              }}
              placeholder="Full name (letters only, max 50 chars)"
              style={{
                ...inputBase,
                ...inputCompact,
                ...(nameErr
                  ? {
                      borderColor: TD.err,
                      boxShadow: "0 0 0 4px rgba(220,38,38,.08)",
                    }
                  : {}),
              }}
              onFocus={(e) =>
                Object.assign(e.currentTarget.style, inputFocus(!!nameErr))
              }
              onBlur={(e) =>
                Object.assign(e.currentTarget.style, {
                  borderColor: "#DFE3E8",
                  boxShadow: "0 3px 14px rgba(0,0,0,.04)",
                })
              }
              required
              maxLength={50}
            />
            {nameErr && (
              <div
                style={{
                  marginTop: -6,
                  marginBottom: 8,
                  fontSize: 12,
                  color: "#b91c1c",
                }}
              >
                {nameErr}
              </div>
            )}
            {!nameErr && name.length > 0 && (
              <div
                style={{
                  marginTop: -6,
                  marginBottom: 8,
                  fontSize: 11,
                  color: "#888",
                  textAlign: "right",
                }}
              >
                {name.length}/50 characters
              </div>
            )}

            {/* ========== Gender + Birth date ========== */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <Label required>Gender</Label>
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
                <Label required>Birth date</Label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBirthDate(v);
                    if (v) {
                      const bd = new Date(v);
                      const maxBirth = new Date("2007-12-31T23:59:59");
                      setBirthDateErr(
                        bd > maxBirth
                          ? "Birth date must be 2007 or earlier."
                          : ""
                      );
                    } else {
                      setBirthDateErr("");
                    }
                  }}
                  style={{
                    ...inputBase,
                    ...inputCompact,
                    ...(birthDateErr
                      ? {
                          borderColor: TD.err,
                          boxShadow: "0 0 0 4px rgba(220,38,38,.08)",
                        }
                      : {}),
                  }}
                  onFocus={(e) =>
                    Object.assign(
                      e.currentTarget.style,
                      inputFocus(!!birthDateErr)
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
                {birthDateErr && (
                  <div
                    style={{
                      marginTop: -6,
                      marginBottom: 8,
                      fontSize: 12,
                      color: "#b91c1c",
                    }}
                  >
                    {birthDateErr}
                  </div>
                )}
              </div>
            </div>

            {/* ========== City + District ========== */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <Label required>City</Label>
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
                <Label required>District</Label>
                <Select
                  name="district"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  required
                  disabled={!city}
                  placeholder={
                    city ? "Select a district…" : "Choose city first"
                  }
                >
                  {(city ? DISTRICTS_BY_CITY[city] || [] : []).map((d) => (
                    <option
                      key={d}
                      value={d === "Other…" ? "__OTHER__" : d}
                    >
                      {d}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {district === "__OTHER__" && (
              <div>
                <Label required>District (Other)</Label>
                <input
                  value={districtOther}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (hasArabic(val)) return;
                    if (val.length <= 15) {
                      setDistrictOther(val);
                    }
                  }}
                  onPaste={(e) => {
                    const paste = e.clipboardData.getData("text");
                    if (hasArabic(paste)) {
                      e.preventDefault();
                      return;
                    }
                  }}
                  placeholder="Type district name (max 15 characters)"
                  style={{ ...inputBase, ...inputCompact }}
                  onFocus={(e) =>
                    Object.assign(
                      e.currentTarget.style,
                      inputFocus(false)
                    )
                  }
                  onBlur={(e) =>
                    Object.assign(e.currentTarget.style, {
                      borderColor: "#DFE3E8",
                      boxShadow: "0 3px 14px rgba(0,0,0,.04)",
                    })
                  }
                  required
                  maxLength={15}
                />
                <div
                  style={{
                    marginTop: -6,
                    marginBottom: 8,
                    fontSize: 11,
                    color: "#888",
                    textAlign: "right",
                  }}
                >
                  {districtOther.length}/15 characters
                </div>
              </div>
            )}

            {/* ========== Password + Strength ========== */}
            <Label required>Password</Label>
            <div style={{ position: "relative" }}>
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  const val = e.target.value;
                  if (hasArabic(val)) return;
                  setPassword(val);
                }}
                onPaste={(e) => {
                  const paste = e.clipboardData.getData("text");
                  if (hasArabic(paste)) {
                    e.preventDefault();
                    return;
                  }
                }}
                placeholder="••••••••"
                style={{ ...inputBase, ...inputCompact, paddingRight: 44 }}
                onFocus={(e) =>
                  Object.assign(e.currentTarget.style, inputFocus(false))
                }
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
              <div style={{ marginTop: 8, marginBottom: 8 }}>
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <PwRule ok={/[A-Z]/.test(password)} label="Uppercase (A–Z)" />
                  <PwRule ok={/[a-z]/.test(password)} label="Lowercase (a–z)" />
                  <PwRule ok={/\d/.test(password)} label="Digit (0–9)" />
                  <PwRule
                    ok={/[^A-Za-z0-9]/.test(password)}
                    label="Symbol (!@#$…)"
                  />
                  <PwRule
                    ok={password.length >= 8}
                    label="Length ≥ 8"
                  />
                </ul>
              </div>
            )}

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
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    marginTop: 6,
                  }}
                >
                  <span style={{ fontSize: 12, color: "#555" }}>
                    Strength:{" "}
                    <strong style={{ color: pwInfo.color }}>
                      {pwInfo.label}
                    </strong>
                  </span>
                  <span style={{ fontSize: 12, color: "#666" }}>
                    (min 8 chars, include a–z, A–Z, 0–9)
                  </span>
                </div>
              </div>
            )}

            {/* ========== Confirm Password ========== */}
            <Label required>Confirm Password</Label>
            <div style={{ position: "relative" }}>
              <input
                type={showPwConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  const val = e.target.value;
                  if (hasArabic(val)) return;
                  setConfirmPassword(val);
                }}
                onPaste={(e) => {
                  const paste = e.clipboardData.getData("text");
                  if (hasArabic(paste)) {
                    e.preventDefault();
                    return;
                  }
                }}
                placeholder="••••••••"
                style={{ ...inputBase, ...inputCompact, paddingRight: 44 }}
                onFocus={(e) =>
                  Object.assign(e.currentTarget.style, inputFocus(false))
                }
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
                aria-label={
                  showPwConfirm ? "Hide password" : "Show password"
                }
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
              onMouseDown={(e) =>
                (e.currentTarget.style.transform = "scale(.99)")
              }
              onMouseUp={(e) =>
                (e.currentTarget.style.transform = "scale(1)")
              }
            >
              {loading ? "Creating..." : "Create account"}
            </button>

            <div style={{ marginTop: 12, fontSize: 14 }}>
              Already have an account?{" "}
              <a
                href="#signin"
                onClick={() => setMode("signin")}
                style={linkStyle}
              >
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
                msg.startsWith("🎉") || msg.startsWith("✅")
                  ? "#065f46"
                  : "#7f1d1d",
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

      {/* Forgot Password Popup */}
      {showForgotPw && (
        <>
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.4)",
              zIndex: 50,
            }}
            onClick={() => setShowForgotPw(false)}
          />
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              display: "grid",
              placeItems: "center",
              padding: "0 16px",
            }}
          >
            <div
              style={{
                width: "min(92vw, 420px)",
                background: "#fff",
                padding: 24,
                borderRadius: 18,
                boxShadow: "0 18px 42px rgba(0,0,0,0.18)",
                border: "1px solid rgba(0,0,0,.04)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    color: TD.ink,
                    fontSize: 20,
                    fontWeight: 700,
                  }}
                >
                  Reset Password
                </h3>
                <button
                  onClick={() => setShowForgotPw(false)}
                  style={{
                    width: 32,
                    height: 32,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 8,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: TD.gray,
                  }}
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              <p
                style={{
                  marginTop: 0,
                  marginBottom: 16,
                  color: TD.gray,
                  fontSize: 14,
                }}
              >
                Enter your ID and we'll send a password reset link to your
                registered email.
              </p>

              <form onSubmit={handleForgotPassword}>
                <Label>Your ID</Label>
                <input
                  value={forgotId}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (hasArabic(val)) return;
                    setForgotId(val);
                  }}
                  onPaste={(e) => {
                    const paste = e.clipboardData.getData("text");
                    if (hasArabic(paste)) {
                      e.preventDefault();
                      return;
                    }
                  }}
                  placeholder="DoctorID / PharmacyID / NationalID / LogisticID"
                  style={inputBase}
                  onFocus={(e) =>
                    Object.assign(e.currentTarget.style, inputFocus(false))
                  }
                  onBlur={(e) =>
                    Object.assign(e.currentTarget.style, {
                      borderColor: "#DFE3E8",
                      boxShadow: "0 3px 14px rgba(0,0,0,.04)",
                    })
                  }
                  required
                  autoFocus
                />

                {forgotMsg && (
                  <div
                    style={{
                      marginTop: -6,
                      marginBottom: 12,
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: forgotMsg.startsWith("✅")
                        ? "rgba(16,185,129,.08)"
                        : "rgba(239,68,68,.08)",
                      color: forgotMsg.startsWith("✅")
                        ? "#065f46"
                        : "#7f1d1d",
                      border: `1px solid ${
                        forgotMsg.startsWith("✅")
                          ? "rgba(16,185,129,.25)"
                          : "rgba(239,68,68,.25)"
                      }`,
                      fontSize: 13,
                    }}
                  >
                    {forgotMsg}
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => setShowForgotPw(false)}
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #DFE3E8",
                      background: "#fff",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: 14,
                      color: TD.gray,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    style={{
                      flex: 1,
                      ...buttonStyle,
                      margin: 0,
                      filter: forgotLoading
                        ? "grayscale(30%) brightness(.9)"
                        : undefined,
                    }}
                    onMouseDown={(e) =>
                      (e.currentTarget.style.transform = "scale(.99)")
                    }
                    onMouseUp={(e) =>
                      (e.currentTarget.style.transform = "scale(1)")
                    }
                  >
                    {forgotLoading ? "Sending..." : "Send Reset Link"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PwRule({ ok, label }) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12.5,
        color: ok ? TD.ok : TD.gray,
      }}
    >
      {ok ? <CheckCircle size={16} /> : <Circle size={16} />}
      <span>{label}</span>
    </li>
  );
}
