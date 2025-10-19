// src/pages/PharmacyShell.jsx
"use client";
import React, { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";
import { db } from "../firebase";
import {
  collection, doc, getDoc, getDocs, query, where,
  limit as fsLimit, updateDoc, deleteField
} from "firebase/firestore";
import { ClipboardList, PackageCheck, Clock, User, LogOut, X } from "lucide-react";

const C = { primary: "#B08CC1", ink: "#4A2C59" };

function pickStr(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}
function normalizePharmacy(raw) {
  if (!raw) return null;
  return {
    name: pickStr(raw, ["name"]),
    pharmacyName: pickStr(raw, ["pharmacyName", "name"]),
    PharmacyID: pickStr(raw, ["PharmacyID"]),
    phone: pickStr(raw, ["phone"]),
    licenseNumber: pickStr(raw, ["licenseNumber"]),
    crNumber: pickStr(raw, ["crNumber"]),
    BranchID: pickStr(raw, ["BranchID"]),
    contact: pickStr(raw, ["contact"]),
    address: pickStr(raw, ["address"]),
    location: pickStr(raw, ["location"]),
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

export default function PharmacyShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const isPharmacyArea = location.pathname.startsWith("/pharmacy");

  const [open, setOpen] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [pharmacy, setPharmacy] = useState(null);
  const [pharmacyDocId, setPharmacyDocId] = useState(null);

  useEffect(() => {
    if (!isPharmacyArea) return;
    (async () => {
      const role = localStorage.getItem("userRole");
      const userId = localStorage.getItem("userId");
      if (role !== "pharmacy" || !userId) {
        setPharmacy(null);
        setPharmacyDocId(null);
        setOpen(false);
        setShowAccount(false);
        return;
      }
      try {
        const s = await getDoc(doc(db, "pharmacies", String(userId)));
        if (s.exists()) {
          setPharmacy(normalizePharmacy(s.data()));
          setPharmacyDocId(s.id);
          return;
        }
      } catch {}
      try {
        const qs = await getDocs(
          query(collection(db, "pharmacies"), where("PharmacyID", "==", String(userId)), fsLimit(1))
        );
        if (!qs.empty) {
          const d = qs.docs[0];
          setPharmacy(normalizePharmacy(d.data()));
          setPharmacyDocId(d.id);
          return;
        }
      } catch {}
      setPharmacy(null);
      setPharmacyDocId(null);
    })();
  }, [isPharmacyArea]);

  function signOut() {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userId");
    sessionStorage.removeItem("td_patient");
    navigate("/auth"); // عدّليها لو عندك صفحة login خاصة بالصيدلية
  }

  const isPickActive =
    location.pathname === "/pharmacy" ||
    location.pathname === "/pharmacy/" ||
    location.pathname.startsWith("/pharmacy/pickup");
  const isDelivActive = location.pathname.startsWith("/pharmacy/delivery");
  const isPendActive  = location.pathname.startsWith("/pharmacy/pending");

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header hideMenu={false} onMenuClick={() => setOpen(true)} />

      <div className="flex-1">
        <Outlet />
      </div>

      <Footer />

      {isPharmacyArea && (
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
              <DrawerItem active={isPickActive} onClick={() => { navigate("/pharmacy"); setOpen(false); }}>
                <ClipboardList size={18} />
                <span>Pick Up Orders</span>
              </DrawerItem>

              <DrawerItem active={isDelivActive} onClick={() => { navigate("/pharmacy/delivery"); setOpen(false); }}>
                <PackageCheck size={18} />
                <span>Delivery Orders</span>
              </DrawerItem>

              <DrawerItem active={isPendActive} onClick={() => { navigate("/pharmacy/pending"); setOpen(false); }}>
                <Clock size={18} />
                <span>Pending Orders</span>
              </DrawerItem>

              <DrawerItem
                onClick={() => { if (pharmacyDocId) { setShowAccount(true); setOpen(false); } }}
                variant={pharmacyDocId ? "solid" : "disabled"}
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

      {showAccount && pharmacyDocId && (
        <AccountModal
          pharmacy={pharmacy}
          pharmacyDocId={pharmacyDocId}
          onClose={() => setShowAccount(false)}
          onSaved={(d) => setPharmacy((p) => ({ ...p, ...d }))}
        />
      )}
    </div>
  );
}

function DrawerItem({ children, onClick, active = false, variant = "solid" }) {
  const base =
    "w-full mb-3 inline-flex items-center gap-3 px-3 py-3 rounded-xl font-medium transition-colors";
  const styles =
    variant === "disabled"
      ? "opacity-50 cursor-not-allowed bg-white/25 text-white"
      : active
      ? "bg-white text-[#5B3A70]"
      : variant === "ghost"
      ? "text-white/90 hover:bg-white/10"
      : "bg-white/25 text-white hover:bg-white/35";
  return (
    <button onClick={onClick} className={`${base} ${styles}`} disabled={variant === "disabled"}>
      {children}
    </button>
  );
}

function AccountModal({ pharmacy, pharmacyDocId, onClose, onSaved }) {
  const [phone, setPhone] = useState(pharmacy?.phone || "");
  const [phoneInfo, setPhoneInfo] = useState({ ok: false, reason: "", normalized: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => setPhoneInfo(validateAndNormalizePhone(phone)), [phone]);
  const canSave = phoneInfo.ok && !saving;

  async function save() {
    const pInfo = validateAndNormalizePhone(phone);
    if (!pInfo.ok) return setMsg(pInfo.reason || "Invalid phone.");
    if (!pharmacyDocId) return setMsg("Pharmacy record not found.");
    try {
      setSaving(true);
      setMsg("");
      const payload = { phone: pInfo.normalized, updatedAt: new Date(), phoneLocal: deleteField() };
      await updateDoc(doc(db, "pharmacies", pharmacyDocId), payload);
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
            <Row label="Pharmacy" value={pharmacy?.pharmacyName || pharmacy?.name || "—"} />
            <Row label="Pharmacy ID" value={pharmacy?.BranchID || "—"} />
           
    
            <Row label="Address" value={pharmacy?.address || "—"} />
        

            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Phone <span className="text-rose-600">*</span>
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05xxxxxxxx أو +9665xxxxxxxx"
                inputMode="tel"
                pattern="[+0-9]*"
                dir="ltr"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent"
                style={{ outlineColor: C.primary }}
                onKeyDown={(e) => { if (e.key === " " || /[٠-٩۰-۹]/.test(e.key)) e.preventDefault(); }}
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
