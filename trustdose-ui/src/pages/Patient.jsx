// src/pages/Patient.jsx
"use client";
import React, { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
} from "firebase/firestore";

/* =========================
   Helpers
   ========================= */
const isNid = (v) => /^\d{10,12}$/.test(String(v || "").trim());
function resolveNidFromAnywhere() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const urlId = sp.get("id");
    if (isNid(urlId)) return urlId;
  } catch {}
  const nidFromTD = localStorage.getItem("TD_PATIENT_NID");
  if (isNid(nidFromTD)) return nidFromTD;
  const role = localStorage.getItem("userRole");
  const userId = localStorage.getItem("userId");
  if (role === "patient" && isNid(userId)) return userId;
  return null;
}

/* =========================
   UI Components
   ========================= */
function Card({ title, children }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
      }}
    >
      {title && <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>}
      {children}
    </div>
  );
}

function Row({ label, value, extra }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "170px 1fr auto",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ color: "#6b7280" }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value ?? "-"}</div>
      {extra}
    </div>
  );
}

/* =========================
   The Page
   ========================= */
export default function PatientPage() {
  const [nid, setNid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [patient, setPatient] = useState(null);
  const [prescriptions, setPrescriptions] = useState([]);

  // Hide menu icon ONLY on Patient page
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "td-patient-hide-menu";
    style.innerHTML = `
      button[aria-label="Toggle menu"],
      [aria-label="menu"],
      [data-testid="menu"],
      [data-role="menu-toggle"],
      .menu-icon,
      .menu-button,
      .hamburger,
      .hamburger-button,
      .navbar-toggle,
      .nav-toggle,
      .header-menu-toggle,
      .td-global-menu {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
    return () => document.getElementById("td-patient-hide-menu")?.remove();
  }, []);

  // Resolve NID
  useEffect(() => {
    const id = resolveNidFromAnywhere();
    if (!id) {
      setErr("No saved patient session. Please log in first.");
      setLoading(false);
      return;
    }
    setNid(id);
  }, []);

  // Fetch patient + prescriptions
  useEffect(() => {
    if (!nid) return;
    let cancelled = false;

    async function boot() {
      setLoading(true);
      setErr("");
      try {
        const pRef = doc(db, "patients", `Ph_${nid}`);
        const pSnap = await getDoc(pRef);
        if (!pSnap.exists()) {
          throw new Error("Patient not found. Please log in again.");
        }
        const pData = pSnap.data();

        let list = [];
        const q1 = query(
          collection(db, "prescriptions"),
          where("patientId", "==", nid),
          limit(50)
        );
        const s1 = await getDocs(q1);
        list = s1.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (list.length === 0) {
          const q2 = query(
            collection(db, "prescriptions"),
            where("nationalID", "==", nid),
            limit(50)
          );
          const s2 = await getDocs(q2);
          list = s2.docs.map((d) => ({ id: d.id, ...d.data() }));
        }

        if (!cancelled) {
          setPatient(pData);
          setPrescriptions(list);
        }
      } catch (e) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    boot();
    return () => (cancelled = true);
  }, [nid]);

  const fullName = useMemo(() => patient?.name || "-", [patient]);
  function handleResetPhone() {
    alert("Reset function will be implemented soon!");
  }

  /* =============== UI =============== */
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        paddingTop: 20,
      }}
    >
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 12px" }}>
        {/* ===== Greeting ===== */}
        {!loading && !err && patient && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: -1,
              marginBottom: 24,
            }}
          >
            {/* كبسولة من الصورة */}
            <img
              src="/Images/TrustDose-pill.png"
              alt="TrustDose Capsule"
              style={{
                width: 75,
                height: "auto",
                display: "block",
              }}
            />

            <div>
              <div style={{ fontWeight: 800, fontSize: 18, color: "#334155" }}>
                Welcome, {patient?.name || "Patient"}
              </div>
              <div style={{ fontSize: 14, color: "#64748b", marginTop: 2 }}>
                Wishing you good health.
              </div>
            </div>
          </div>
        )}

        {/* ===== Content ===== */}
        {loading && (
          <div style={{ padding: 16, color: "#64748b" }}>Loading…</div>
        )}

        {!loading && err && (
          <div style={{ padding: 16, color: "#dc2626", fontWeight: 600 }}>
            {err}
          </div>
        )}

        {!loading && !err && patient && (
          <>
            {/* Profile */}
            <Card title="Patient Profile">
              <div style={{ display: "grid", gap: 10 }}>
                <Row label="Full name" value={fullName} />
                <Row
                  label="National ID"
                  value={patient.nationalID || patient.nationalId}
                />
                <Row
                  label="Phone"
                  value={patient.contact}
                  extra={
                    <button
                      onClick={handleResetPhone}
                      style={{
                        border: "none",
                        borderRadius: 8,
                        background: "#B08CC1",
                        color: "#fff",
                        padding: "6px 14px",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "0.2s",
                      }}
                      onMouseOver={(e) =>
                        (e.target.style.background = "#9c79ae")
                      }
                      onMouseOut={(e) =>
                        (e.target.style.background = "#B08CC1")
                      }
                    >
                      Reset
                    </button>
                  }
                />
                <Row
                  label="Gender"
                  value={
                    patient.gender === "M"
                      ? "Male"
                      : patient.gender === "F"
                      ? "Female"
                      : "-"
                  }
                />
                <Row label="City" value={patient.locationCity} />
                <Row label="District" value={patient.locationDistrict} />
                <Row label="Location" value={patient.Location} />
              </div>
            </Card>

            {/* Prescriptions */}
            <div style={{ height: 12 }} />
            <Card title="Prescriptions">
              {prescriptions.length === 0 ? (
                <div style={{ color: "#6b7280" }}>No prescriptions found.</div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {prescriptions.map((rx) => (
                    <div
                      key={rx.id}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: 12,
                        background: "#fafafa",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>
                          {rx.medicine || rx.name || "Prescription"}
                        </div>
                        <div style={{ color: "#64748b", fontSize: 13 }}>
                          {rx.ref || rx.id}
                        </div>
                      </div>

                      <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                        <Row label="Dose" value={rx.dose} />
                        <Row label="Times/Day" value={rx.timesPerDay} />
                        <Row label="Duration (days)" value={rx.durationDays} />
                        <Row label="Status" value={rx.status || "-"} />
                        {rx.pharmacy?.name && (
                          <Row label="Pharmacy" value={rx.pharmacy.name} />
                        )}
                        {rx.city && <Row label="City" value={rx.city} />}
                        {rx.notes && <Row label="Notes" value={rx.notes} />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
