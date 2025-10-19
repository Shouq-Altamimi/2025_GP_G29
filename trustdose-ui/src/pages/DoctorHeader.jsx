// src/pages/Shell.jsx
"use client";
import React, { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";
import { db } from "../firebase.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit as fsLimit,
  updateDoc,
  deleteField,
} from "firebase/firestore";
import { FilePlus2, User, LogOut, X } from "lucide-react";

const C = { primary: "#B08CC1", ink: "#4A2C59" };

function pickStr(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function normalizeDoctor(raw) {
  if (!raw) return null;
  return {
    name: pickStr(raw, ["name"]),
    healthFacility: pickStr(raw, ["healthFacility"]),
    speciality: pickStr(raw, ["speciality"]),
    licenseNumber: pickStr(raw, ["licenseNumber"]),
    DoctorID: pickStr(raw, ["DoctorID"]),
    phone: pickStr(raw, ["phone"]),
  };
}

function validateAndNormalizePhone(raw) {
  const original = String(raw || "").trim();
  if (/\s/.test(original)) return { ok: false, reason: "No spaces allowed." };
  if (/[٠-٩۰-۹]/.test(original)) return { ok: false, reason: "English digits only (0-9)." };
  if (!/^\+?[0-9]+$/.test(original))
    return { ok: false, reason: "Digits 0-9 only (and optional leading +)." };
  if (/^05\d{8}$/.test(original)) {
    const last8 = original.slice(2);
    return { ok: true, normalized: `+9665${last8}` };
  }
  if (/^\+9665\d{8}$/.test(original)) return { ok: true, normalized: original };
  return { ok: false, reason: "Must start with 05 or +9665 followed by 8 digits." };
}

export default function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const isPatientPage = location.pathname.includes("/patient");
  const isDoctorPage =
    location.pathname.startsWith("/doctor") ||
    location.pathname.startsWith("/prescriptions");

  const [open, setOpen] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [doctor, setDoctor] = useState(null);
  const [doctorDocId, setDoctorDocId] = useState(null);

  useEffect(() => {
    if (!isDoctorPage) return;

    (async () => {
      const role = localStorage.getItem("userRole");
      const userDoctorID = localStorage.getItem("userId");

      if (role !== "doctor" || !userDoctorID) {
        setDoctor(null);
        setDoctorDocId(null);
        setOpen(false);
        setShowAccount(false);
        sessionStorage.removeItem("td_doctor");
        return;
      }

      try {
        // 👇 نعتمد حصريًا على DoctorID
        const qy = query(
          collection(db, "doctors"),
          where("DoctorID", "==", String(userDoctorID)),
          fsLimit(1)
        );
        const qs = await getDocs(qy);

        if (!qs.empty) {
          const d = qs.docs[0];
          const norm = normalizeDoctor(d.data());
          setDoctor(norm);
          setDoctorDocId(d.id);

          sessionStorage.setItem(
            "td_doctor",
            JSON.stringify({
              DoctorID: norm?.DoctorID || String(userDoctorID),
              name: norm?.name || "",
              phone: norm?.phone || "",
              healthFacility: norm?.healthFacility || "",
              speciality: norm?.speciality || "",
            })
          );
          return;
        }

        // لو ما لقينا شي بهوية DoctorID — نفرّغ
        setDoctor(null);
        setDoctorDocId(null);
        sessionStorage.removeItem("td_doctor");
      } catch (e) {
        console.error("Load doctor by DoctorID failed:", e);
        setDoctor(null);
        setDoctorDocId(null);
        sessionStorage.removeItem("td_doctor");
      }
    })();
  }, [isDoctorPage]);

  function signOut() {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userId");
    sessionStorage.removeItem("td_patient");
    sessionStorage.removeItem("td_doctor");
    navigate("/auth");
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header
        hideMenu={isPatientPage}
        onMenuClick={() => {
          if (isDoctorPage && doctorDocId) setOpen(true);
        }}
      />
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />

      {isDoctorPage && doctorDocId && (
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
                active={location.pathname.startsWith("/doctor")}
                onClick={() => {
                  navigate("/doctor");
                  setOpen(false);
                }}
              >
                <FilePlus2 size={18} />
                <span>Create Prescription</span>
              </DrawerItem>

              <DrawerItem
                onClick={() => {
                  setShowAccount(true);
                  setOpen(false);
                }}
              >
                <User size={18} />
                <span>My Account</span>
              </DrawerItem>

              <DrawerItem onClick={signOut} variant="ghost">
                <LogOut size={18} />
                <span>Sign out</span>
              </DrawerItem>
            </nav>
          </aside>
        </>
      )}

      {showAccount && doctorDocId && (
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

function AccountModal({ doctor, doctorDocId, onClose, onSaved }) {
  const [phone, setPhone] = useState(doctor?.phone || "");
  const [phoneInfo, setPhoneInfo] = useState({ ok: false, reason: "", normalized: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => setPhoneInfo(validateAndNormalizePhone(phone)), [phone]);
  const canSave = phoneInfo.ok && !saving;

  async function save() {
    const pInfo = validateAndNormalizePhone(phone);
    if (!pInfo.ok) {
      setMsg(pInfo.reason || "Invalid phone.");
      return;
    }
    if (!doctorDocId) {
      setMsg("Doctor record not found.");
      return;
    }
    try {
      setSaving(true);
      setMsg("");
      const payload = { phone: pInfo.normalized, updatedAt: new Date(), phoneLocal: deleteField() };
      await updateDoc(doc(db, "doctors", doctorDocId), payload);
      onSaved?.({ phone: payload.phone });
      setMsg("Saved ✓");
      setTimeout(() => onClose?.(), 600);
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
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3 text-sm">
            <Row label="Name" value={doctor?.name || "—"} />
            <Row label="Health Facility" value={doctor?.healthFacility || "—"} />
            <Row label="Speciality" value={(doctor?.speciality || "—").trim()} />
            <Row label="Doctor ID" value={doctor?.DoctorID || "—"} />
            <Row label="License No." value={doctor?.licenseNumber || "—"} />

            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Phone <span className="text-rose-600">*</span>
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05xxxxxxxx or +9665xxxxxxxx (no spaces)"
                inputMode="tel"
                pattern="[+0-9]*"
                dir="ltr"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent"
                style={{ outlineColor: C.primary }}
                onKeyDown={(e) => {
                  if (e.key === " " || /[٠-٩۰-۹]/.test(e.key)) e.preventDefault();
                }}
              />
              <div style={{ marginTop: 6, fontSize: 12 }}>
                {!phone && <span style={{ color: "#888" }}>Enter phone starting with 05 or +9665</span>}
                {phone && !phoneInfo.ok && <span style={{ color: "#b91c1c" }}>{phoneInfo.reason}</span>}
              </div>
            </div>

            {!!msg && <div className="text-sm">{msg}</div>}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!canSave}
              className="px-4 py-2 rounded-lg text-white disabled:opacity-50"
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
      <span className="font-medium text-gray-800 text-right">{value}</span>
    </div>
  );
}
