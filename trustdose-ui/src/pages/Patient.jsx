// src/pages/Patient.jsx
"use client";
import React, { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query as fsQuery,
  where,
  limit as fsLimit,
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

async function fetchPatientByFlexibleId(nid) {
  try {
    const ref1 = doc(db, "patients", String(nid));
    const snap1 = await getDoc(ref1);
    if (snap1.exists()) return { id: ref1.id, data: snap1.data() };
  } catch {}
  try {
    const ref2 = doc(db, "patients", `Ph_${nid}`);
    const snap2 = await getDoc(ref2);
    if (snap2.exists()) return { id: ref2.id, data: snap2.data() };
  } catch {}
  try {
    const col = collection(db, "patients");
    const variants = [
      fsQuery(col, where("nationalID", "==", String(nid)), fsLimit(1)),
      fsQuery(col, where("nationalId", "==", String(nid)), fsLimit(1)),
    ];
    for (const q of variants) {
      const qs = await getDocs(q);
      if (!qs.empty) {
        const d = qs.docs[0];
        return { id: d.id, data: d.data() };
      }
    }
  } catch {}
  return null;
}

async function fetchPrescriptionsSmart(foundDocId, nid) {
  try {
    const col = collection(db, "prescriptions");

    const q1 = fsQuery(col, where("patientDocId", "==", String(foundDocId)), fsLimit(50));
    const s1 = await getDocs(q1);
    if (!s1.empty) return { items: s1.docs.map((d) => ({ id: d.id, ...d.data() })), blocked: false };

    const q2 = fsQuery(col, where("patientDisplayId", "==", String(nid)), fsLimit(50));
    const s2 = await getDocs(q2);
    if (!s2.empty) return { items: s2.docs.map((d) => ({ id: d.id, ...d.data() })), blocked: false };

    const q3 = fsQuery(col, where("nationalID", "==", String(nid)), fsLimit(50));
    const s3 = await getDocs(q3);
    if (!s3.empty) return { items: s3.docs.map((d) => ({ id: d.id, ...d.data() })), blocked: false };

    return { items: [], blocked: false };
  } catch (e) {
    return { items: [], blocked: true, error: e?.message || String(e) };
  }
}

/* =========================
   UI Components
   ========================= */
function Card({ title, children, footer }) {
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
      {footer}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "170px 1fr",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ color: "#6b7280" }}>{label}</div>
      <div style={{ fontWeight: 600, wordBreak: "break-word" }}>{value ?? "-"}</div>
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
  const [rx, setRx] = useState({ items: [], blocked: false, error: "" });

  useEffect(() => {
    const id = resolveNidFromAnywhere();
    if (!id) {
      setErr("No saved patient session. Please log in first.");
      setLoading(false);
      return;
    }
    setNid(id);
  }, []);

  useEffect(() => {
    if (!nid) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const found = await fetchPatientByFlexibleId(nid);
        if (!found) throw new Error("Patient not found. Please log in again.");

        const pres = await fetchPrescriptionsSmart(found.id, nid);

        if (!cancelled) {
          setPatient(found.data);
          setRx(pres);
        }
      } catch (e) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nid]);

  const fullName = useMemo(() => patient?.name || "-", [patient]);
  const phoneValue = useMemo(() => {
    if (!patient) return "-";
    if (patient.contact && typeof patient.contact === "object") {
      return patient.contact.phone || patient.contact.mobile || "-";
    }
    return patient.contact || "-";
  }, [patient]);
  const locationDistrictOnly = useMemo(() => {
    if (!patient?.Location) return "-";
    const parts = String(patient.Location).split(",");
    return (parts[1] || parts[0] || "-").trim();
  }, [patient]);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", paddingTop: 20 }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 12px" }}>
        {!loading && !err && patient && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <img
              src="/Images/TrustDose-pill.png"
              alt="TrustDose Capsule"
              style={{ width: 75, height: "auto", display: "block" }}
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

        {loading && <div style={{ padding: 16, color: "#64748b" }}>Loading…</div>}
        {!loading && err && (
          <div style={{ padding: 16, color: "#dc2626", fontWeight: 600 }}>{err}</div>
        )}

        {!loading && !err && patient && (
          <>
            <Card title="Patient Profile">
              <div style={{ display: "grid", gap: 10 }}>
                <Row label="Full name" value={fullName} />
                <Row label="National ID" value={patient.nationalID || patient.nationalId || "-"} />
                <Row label="Phone" value={phoneValue} />
                <Row
                  label="Gender"
                  value={patient.gender === "M" ? "Male" : patient.gender === "F" ? "Female" : "-"}
                />
                <Row label="Location" value={locationDistrictOnly} />
              </div>
            </Card>

            <div style={{ height: 12 }} />
            <Card
              title="Prescriptions"
              footer={
                rx.blocked ? (
                  <div
                    style={{
                      marginTop: 12,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "#fff7ed",
                      color: "#9a3412",
                      border: "1px solid #fed7aa",
                      fontSize: 12,
                    }}
                  >
                    Prescriptions might be hidden by Firestore Rules (no read).
                  </div>
                ) : null
              }
            >
              {rx.items.length === 0 ? (
                <div style={{ color: "#6b7280" }}>
                  {rx.blocked ? "—" : "No prescriptions found."}
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {rx.items.map((item) => (
                    <div
                      key={item.id}
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
                          {item.medicineName || item.medicine || "Prescription"}
                        </div>
                        <div style={{ color: "#64748b", fontSize: 13 }}>
                          {item.ref || item.id}
                        </div>
                      </div>

                      <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                        <Row label="Dose" value={item.dosage || item.dose} />
                        <Row label="Frequency" value={item.frequency || item.timesPerDay} />
                        <Row label="Duration (days)" value={item.durationDays} />
                        <Row label="Status" value={item.status || (item.dispensed ? "Dispensed" : "-")} />
                        {item.notes && <Row label="Notes" value={item.notes} />}
                        {item.onchainTx && <Row label="Tx Hash" value={item.onchainTx} />}
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
