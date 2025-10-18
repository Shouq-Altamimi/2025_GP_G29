// src/pages/Shell.jsx
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
  updateDoc,
} from "firebase/firestore";
import { FilePlus2, User, LogOut, X } from "lucide-react";

const C = { primary: "#B08CC1", ink: "#4A2C59", border: "#E5E7EB" };

export default function Shell() {
  const location = useLocation();
  const navigate = useNavigate();

  const isPatientPage = location.pathname.includes("/patient");
  const isDoctorPage =
    location.pathname.startsWith("/doctor") ||
    location.pathname.startsWith("/prescriptions");

  // === drawer state ===
  const [open, setOpen] = useState(false);

  // doctor info (for My Account modal)
  const [doctor, setDoctor] = useState(null);
  const [doctorDocId, setDoctorDocId] = useState(null);
  const [showAccount, setShowAccount] = useState(false);

  useEffect(() => {
    if (!isDoctorPage) return;
    (async () => {
      const userId = localStorage.getItem("userId");
      if (!userId) return;

      // try doc id == userId
      try {
        const s = await getDoc(doc(db, "doctors", String(userId)));
        if (s.exists()) {
          setDoctor(s.data());
          setDoctorDocId(s.id);
          return;
        }
      } catch {}

      // fallback DoctorID == userId
      const col = collection(db, "doctors");
      const qy = query(col, where("DoctorID", "==", String(userId)), fsLimit(1));
      const qs = await getDocs(qy);
      if (!qs.empty) {
        setDoctor(qs.docs[0].data());
        setDoctorDocId(qs.docs[0].id);
      }
    })();
  }, [isDoctorPage]);

  function signOut() {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userId");
    localStorage.removeItem("TD_PATIENT_NID");
    sessionStorage.removeItem("td_patient");
    navigate("/auth");
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header
        hideMenu={isPatientPage}
        onMenuClick={() => isDoctorPage && setOpen(true)} // يفتح الدروَر فقط بصفحات الدكتور
      />

      {/* المحتوى + الدروَر */}
      <div className="flex-1">
        <Outlet />
      </div>

      <Footer />

      {/* ===== Doctor Drawer (ينزلق من اليسار) ===== */}
      {isDoctorPage && (
        <>
          {/* خلفية التعتيم */}
          <div
            onClick={() => setOpen(false)}
            className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
              open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
          />
          {/* اللوحة المنزلِقة */}
          <aside
            className="fixed top-0 left-0 z-50 h-full w-[290px] shadow-2xl"
            style={{
              transform: open ? "translateX(0)" : "translateX(-100%)",
              transition: "transform 180ms ease",
              background:
                "linear-gradient(180deg, rgba(176,140,193,0.95) 0%, rgba(146,137,186,0.95) 45%, rgba(82,185,196,0.92) 100%)",
              backdropFilter: "blur(2px)",
            }}
          >
            {/* رأس الدروَر */}
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-2">
                <img src="/Images/TrustDose_logo.png" alt="TrustDose" className="h-7 w-auto" />
              </div>
              <button
                onClick={() => setOpen(false)}
                className="h-9 w-9 grid place-items-center rounded-lg hover:bg-white/20 text-white"
                aria-label="Close sidebar"
              >
                <X size={18} />
              </button>
            </div>

            {/* القائمة */}
            <nav className="px-3">
              <DrawerItem
                active={location.pathname.startsWith("/doctor")}
                onClick={() => {
                  navigate("/doctor");
                  setOpen(false);
                }}
              >
                <FilePlus2 className="shrink-0" size={18} />
                <span>Create Prescription</span>
              </DrawerItem>

              <DrawerItem
                onClick={() => {
                  setShowAccount(true);
                  setOpen(false);
                }}
              >
                <User className="shrink-0" size={18} />
                <span>My Account</span>
              </DrawerItem>

              <DrawerItem onClick={signOut} variant="ghost">
                <LogOut className="shrink-0" size={18} />
                <span>Sign out</span>
              </DrawerItem>
            </nav>
          </aside>
        </>
      )}

      {/* ===== My Account Modal (وسطي) ===== */}
      {showAccount && (
        <AccountModal
          doctor={doctor}
          doctorDocId={doctorDocId}
          onClose={() => setShowAccount(false)}
          onSaved={(d) => setDoctor((prev) => ({ ...prev, ...d }))}
        />
      )}
    </div>
  );
}

/* ===== عناصر مساعدة للدروَر ===== */
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

/* ===== مودال الحساب ===== */
function AccountModal({ doctor, doctorDocId, onClose, onSaved }) {
  const [phone, setPhone] = useState(doctor?.phone || doctor?.phoneNumber || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    const digits = String(phone || "").trim();
    if (!/^\+?\d{8,15}$/.test(digits)) {
      setMsg("Enter a valid phone number (8–15 digits).");
      return;
    }
    if (!doctorDocId) {
      setMsg("Doctor record not found.");
      return;
    }
    try {
      setSaving(true);
      setMsg("");
      await updateDoc(doc(db, "doctors", doctorDocId), {
        phone: digits,
        updatedAt: new Date(),
      });
      onSaved?.({ phone: digits });
      setMsg("Saved ✓");
      setTimeout(() => onClose?.(), 500);
    } catch (e) {
      setMsg(e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 grid place-items-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold" style={{ color: C.ink }}>
              My Account
            </h3>
            <button
              onClick={onClose}
              className="h-8 w-8 grid place-items-center rounded-lg hover:bg-gray-100"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3 text-sm">
            <Row label="Name" value={doctor?.name || "—"} />
            <Row label="Speciality" value={doctor?.speciality || "—"} />
            <Row label="License No." value={doctor?.licenseNumber || "—"} />
            <Row label="Doctor ID" value={doctor?.DoctorID || "—"} />

            <div>
              <label className="block text-sm text-gray-700 mb-1">Mobile</label>
              <input
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent"
                style={{ outlineColor: C.primary }}
                placeholder="+9665XXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            {!!msg && <div className="text-sm">{msg}</div>}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-white"
              style={{ background: C.primary }}
            >
              {saving ? "Saving..." : "Save"}
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
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}
