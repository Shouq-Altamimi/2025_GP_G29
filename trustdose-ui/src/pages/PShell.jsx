// src/pages/PShell.jsx
"use client";
import React, { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";
import { db } from "../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit as fsLimit,
} from "firebase/firestore";
import { User, LogOut, X } from "lucide-react";

const C = { primary: "#B08CC1", ink: "#4A2C59" };

/* =========================
   Helpers
   ========================= */
function pickStr(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

// 📍 استرجاع بيانات المريض
function normalizePatient(raw) {
  if (!raw) return null;

  const fullName   = pickStr(raw, ["fullName", "name", "fullname"]);
  const nationalId = pickStr(raw, ["nationalId", "nationalID", "nid", "NID"]);
  const phone      = pickStr(raw, ["phone", "mobile", "contact"]);

  // نعرض فقط الحي بدون المدينة
  const location = pickStr(raw, ["locationDistrict", "district"]);

  // تحويل الجنس إلى Female/Male
  let gender = pickStr(raw, ["gender", "sex"]);
  if (gender) {
    const g = gender.trim().toLowerCase();
    if (g === "f" || g === "female" || g === "أنثى" || g === "انثى") gender = "Female";
    else if (g === "m" || g === "male" || g === "ذكر") gender = "Male";
  }

  return { fullName, nationalId, phone, gender, location };
}

function resolvePatientId() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const urlId = sp.get("id");
    if (urlId && String(urlId).trim()) return String(urlId).trim();
  } catch {}
  const role = localStorage.getItem("userRole");
  const userId = localStorage.getItem("userId");
  if (role === "patient" && userId) return String(userId).trim();
  try {
    const cached = JSON.parse(sessionStorage.getItem("td_patient") || "null");
    if (cached?.nid) return String(cached.nid).trim();
  } catch {}
  return null;
}

/* =========================
   PShell (Patient)
   ========================= */
export default function PShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const isPatientPage = location.pathname.startsWith("/patient");

  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [patient, setPatient] = useState(null);
  const [patientDocId, setPatientDocId] = useState(null);

  useEffect(() => {
    (async () => {
      const pid = resolvePatientId();
      if (!pid) {
        setPatient(null);
        setPatientDocId(null);
        return;
      }

      try {
        const s = await getDoc(doc(db, "patients", String(pid)));
        if (s.exists()) {
          setPatient(normalizePatient(s.data()));
          setPatientDocId(s.id);
          return;
        }
      } catch {}

      try {
        const col = collection(db, "patients");
        const q1 = query(col, where("nationalId", "==", String(pid)), fsLimit(1));
        const r1 = await getDocs(q1);
        if (!r1.empty) {
          const d = r1.docs[0];
          setPatient(normalizePatient(d.data()));
          setPatientDocId(d.id);
          return;
        }
      } catch {}

      try {
        const col = collection(db, "patients");
        const q2 = query(col, where("nationalID", "==", String(pid)), fsLimit(1));
        const r2 = await getDocs(q2);
        if (!r2.empty) {
          const d = r2.docs[0];
          setPatient(normalizePatient(d.data()));
          setPatientDocId(d.id);
          return;
        }
      } catch {}

      setPatient(null);
      setPatientDocId(null);
    })();
  }, []);

  function signOut() {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userId");
    sessionStorage.removeItem("td_patient");
    navigate("/auth");
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header
        hideMenu={false}
        onMenuClick={() => {
          if (isPatientPage && patientDocId) setOpen(true);
        }}
      />

      {/* فقط الصفحات الفرعية */}
      <div className="flex-1">
        <Outlet />
      </div>

      <Footer />

      {/* ====== Sidebar ====== */}
      {isPatientPage && patientDocId && (
        <>
          <div
            onClick={() => setOpen(false)}
            className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
              open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
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
                aria-label="Close sidebar"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="px-3">
              <DrawerItem
                onClick={() => {
                  setShowProfile(true);
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

      {/* ====== Modal: My Profile ====== */}
      {showProfile && (
        <PatientProfileModal
          patient={patient}
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
  );
}

/* =========================
   Components
   ========================= */
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

function PatientProfileModal({ patient, onClose }) {
  const P = {
    fullName: patient?.fullName || "—",
    nationalId: patient?.nationalId || "—",
    phone: patient?.phone || "—",
    gender: patient?.gender || "—",
    location: patient?.location || "—",
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 grid place-items-center px-4">
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

          <div className="space-y-3 text-sm">
            <Row label="Full Name" value={P.fullName} />
            <Row label="National ID" value={P.nationalId} />
            <Row label="Phone" value={P.phone} />
            <Row label="Gender" value={P.gender} />
            <Row label="Location" value={P.location} />
          </div>

          <div className="mt-4 flex items-center justify-end">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border">
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800 text-right">{value}</span>
    </div>
  );
}
