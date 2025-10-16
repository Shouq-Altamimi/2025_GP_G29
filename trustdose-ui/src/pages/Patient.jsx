// src/pages/Patient.jsx
"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
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

function Row({ label, value }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: 12 }}>
      <div style={{ color: "#6b7280" }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value ?? "-"}</div>
    </div>
  );
}

/* =========================
   The Page
   ========================= */
export default function PatientPage() {
  const navigate = useNavigate();
  const [nid, setNid] = useState(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [patient, setPatient] = useState(null);
  const [prescriptions, setPrescriptions] = useState([]);

  // Resolve NID once
  useEffect(() => {
    const id = resolveNidFromAnywhere();
    if (!id) {
      setErr("No saved patient session. Please log in first.");
      setLoading(false);
      return;
    }
    setNid(id);
  }, []);

  // Fetch data when we have NID
  useEffect(() => {
    if (!nid) return;

    let cancelled = false;

    async function boot() {
      setLoading(true);
      setErr("");

      try {
        // 1) Get patient doc
        const pRef = doc(db, "patients", `Ph_${nid}`);
        const pSnap = await getDoc(pRef);
        if (!pSnap.exists()) {
          throw new Error(
            "Patient not found. Please log in again with the correct National ID."
          );
        }
        const pData = pSnap.data();

        // 2) Get prescriptions (try patientId then nationalID)
        let list = [];
        try {
          const q1 = query(
            collection(db, "prescriptions"),
            where("patientId", "==", nid),
            // optional ordering if موجود
            // orderBy("createdAt", "desc"),
            limit(50)
          );
          const s1 = await getDocs(q1);
          list = s1.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch {}

        if (list.length === 0) {
          try {
            const q2 = query(
              collection(db, "prescriptions"),
              where("nationalID", "==", nid),
              limit(50)
            );
            const s2 = await getDocs(q2);
            list = s2.docs.map((d) => ({ id: d.id, ...d.data() }));
          } catch {}
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
    return () => {
      cancelled = true;
    };
  }, [nid]);

  const fullName = useMemo(() => patient?.name || "-", [patient]);

  function handleLogout() {
    try {
      localStorage.removeItem("TD_PATIENT_NID");
      localStorage.removeItem("sessionStatus");
      localStorage.removeItem("userRole");
      localStorage.removeItem("userId");
    } catch {}
    navigate("/auth", { replace: true });
  }

  /* =============== UI =============== */
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          borderBottom: "1px solid #e5e7eb",
          background: "#fff",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background:
                "linear-gradient(135deg, #B08CC1 0%, #52B9C4 100%)",
            }}
          />
          <div style={{ fontWeight: 800, fontSize: 18, color: "#334155" }}>
            TrustDose — Patient
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {nid && (
            <div style={{ fontSize: 13, color: "#64748b" }}>
              NID: <strong>{nid}</strong>
            </div>
          )}
          <button
            onClick={handleLogout}
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 600,
              color: "#334155",
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1000, margin: "16px auto", padding: "0 12px" }}>
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
                <Row label="National ID" value={patient.nationalID || patient.nationalId} />
                <Row label="Phone" value={patient.contact} />
                <Row
                  label="Gender"
                  value={patient.gender === "M" ? "Male" : patient.gender === "F" ? "Female" : "-"}
                />
                <Row label="City" value={patient.locationCity} />
                <Row label="District" value={patient.locationDistrict} />
                <Row label="Location (legacy)" value={patient.Location} />
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
