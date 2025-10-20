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
   0) Local mapping (no DB changes)
   ========================= */
const DOCTOR_MAP = {
  "0x4F5b09D9940a1fF83463De89BD25C216fBd86E5C": {
    name: "Khalid Altamimi",
    facility: "Dr. Sulaiman Al Habib Hospital",
  },
};

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

async function sha256HexPrefixed(input) {
  const enc = new TextEncoder();
  const bytes = enc.encode(String(input ?? ""));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return "0x" + hex;
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

/* =========================
   Prescriptions fetch (robust)
   ========================= */
async function fetchPrescriptionsSmart(foundDocId, nid) {
  const out = new Map();
  let lastError = "";

  try {
    const col = collection(db, "prescriptions");
    const hashWith0x = await sha256HexPrefixed(nid);
    const hashNo0x = hashWith0x.replace(/^0x/i, "");

    const queries = [
      fsQuery(col, where("patientNationalIdHash", "==", hashWith0x), fsLimit(50)),
      fsQuery(col, where("patientNationalIdHash", "==", hashNo0x), fsLimit(50)),
      fsQuery(col, where("patientNationalId", "==", String(nid)), fsLimit(50)),
      fsQuery(col, where("patientNationalID", "==", String(nid)), fsLimit(50)),
      fsQuery(col, where("nationalId", "==", String(nid)), fsLimit(50)),
      fsQuery(col, where("nationalID", "==", String(nid)), fsLimit(50)),
      fsQuery(col, where("patientId", "==", String(foundDocId)), fsLimit(50)),
      fsQuery(col, where("patientDocId", "==", String(foundDocId)), fsLimit(50)),
      fsQuery(col, where("patientRef", "==", String(foundDocId)), fsLimit(50)),
    ];

    for (const q of queries) {
      try {
        const snap = await getDocs(q);
        if (!snap.empty) snap.docs.forEach((d) => out.set(d.id, { id: d.id, ...d.data() }));
      } catch (e) {
        lastError = e?.message || String(e);
      }
    }
  } catch (e) {
    lastError = e?.message || String(e);
    console.error("RX fetch failed:", e);
  }

  const items = Array.from(out.values()).sort(
    (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
  );

  return { items, blocked: false, error: lastError };
}

/* ========= Doctor lookups ========= */
const __doctorCacheById = new Map();     // "Dr-1" => {name, facility}
const __doctorCacheByCode = new Map();   // "Dr-001" => {name, facility}
const __doctorCacheByName = new Map();   // "Khalid Altamimi" => {name, facility}

async function fetchDoctorByDocId(docId) {
  if (!docId) return null;
  if (__doctorCacheById.has(docId)) return __doctorCacheById.get(docId);
  try {
    const ref = doc(db, "doctors", String(docId));
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const d = snap.data();
      const meta = {
        name: d.name || d.fullName || d.doctorName || "",
        facility:
          d.healthFacility || d.facility || d.hospitalName || (d.hospital && d.hospital.name) || "",
      };
      __doctorCacheById.set(docId, meta);
      return meta;
    }
  } catch {}
  return null;
}

async function fetchDoctorByCode(code) {
  if (!code) return null;
  if (__doctorCacheByCode.has(code)) return __doctorCacheByCode.get(code);
  try {
    const col = collection(db, "doctors");
    const q = fsQuery(col, where("DoctorID", "==", String(code)), fsLimit(1));
    const qs = await getDocs(q);
    if (!qs.empty) {
      const d = qs.docs[0].data();
      const meta = {
        name: d.name || d.fullName || d.doctorName || "",
        facility:
          d.healthFacility || d.facility || d.hospitalName || (d.hospital && d.hospital.name) || "",
      };
      __doctorCacheByCode.set(code, meta);
      return meta;
    }
  } catch {}
  return null;
}

async function fetchDoctorByName(name) {
  if (!name) return null;
  if (__doctorCacheByName.has(name)) return __doctorCacheByName.get(name);
  try {
    const col = collection(db, "doctors");
    const q = fsQuery(col, where("name", "==", String(name)), fsLimit(1));
    const qs = await getDocs(q);
    if (!qs.empty) {
      const d = qs.docs[0].data();
      const meta = {
        name: d.name || d.fullName || d.doctorName || "",
        facility:
          d.healthFacility || d.facility || d.hospitalName || (d.hospital && d.hospital.name) || "",
      };
      __doctorCacheByName.set(name, meta);
      return meta;
    }
  } catch {}
  return null;
}

/* ============ Hydrate doctor + facility ============ */
async function hydrateNames(items) {
  const out = [];
  for (const p of items) {
    // Gather current values from RX
    let doctorName =
      p.doctorName ||
      p.doctorFullName ||
      p.prescriberName ||
      p.createdByName ||
      p.practitionerName ||
      p.practitionerFullName ||
      "";

    let facilityName =
      p.facilityName ||
      p.facility ||
      p.healthFacility ||
      p.healthcareFacility ||
      p.clinicName ||
      p.hospitalName ||
      p.locationName ||
      p.pharmacyName ||
      (p.facility && p.facility.name) ||
      (p.hospital && p.hospital.name) ||
      "";

    // Try DOCTOR_MAP (e.g., wallet address)
    if ((!doctorName || !facilityName) && p.doctorId) {
      const m = DOCTOR_MAP[String(p.doctorId)];
      if (m) {
        if (!doctorName) doctorName = m.name || "";
        if (!facilityName) facilityName = m.facility || "";
      }
    }

    // Try by explicit IDs/codes from RX
    if (!doctorName || !facilityName) {
      const idCandidates = [
        p.doctorId,      // e.g., "Dr-1"
        p.doctorRef,
        p.createdBy,     // sometimes holds "Dr-1"
      ].filter(Boolean);

      for (const idc of idCandidates) {
        const meta = await fetchDoctorByDocId(idc);
        if (meta) {
          if (!doctorName) doctorName = meta.name || "";
          if (!facilityName) facilityName = meta.facility || "";
          if (doctorName && facilityName) break;
        }
      }
    }

    if (!doctorName || !facilityName) {
      const codeCandidates = [
        p.doctorCode,    // e.g., "Dr-001" (matches DoctorID)
        p.prescriberId,  // if you store DoctorID here
      ].filter(Boolean);

      for (const code of codeCandidates) {
        const meta = await fetchDoctorByCode(code);
        if (meta) {
          if (!doctorName) doctorName = meta.name || "";
          if (!facilityName) facilityName = meta.facility || "";
          if (doctorName && facilityName) break;
        }
      }
    }

    // Last resort: match by name (common in your data)
    if ((!facilityName || !doctorName) && doctorName) {
      const meta = await fetchDoctorByName(doctorName);
      if (meta) {
        if (!doctorName) doctorName = meta.name || "";
        if (!facilityName) facilityName = meta.facility || "";
      }
    }

    out.push({
      ...p,
      _doctorName: doctorName || "—",
      _facilityName: facilityName || "—",
    });
  }
  return out;
}

/* =========================
   UI helpers
   ========================= */
const TD = {
  brand: {
    ink: "#334155",
    sub: "#64748b",
    soft: "#F5F3FF",
    primary: "#B08CC1",
    successBg: "#F0FDF4",
    successText: "#166534",
    successBorder: "#BBE5C8",
    dangerBg: "#FEF2F2",
    dangerText: "#991B1B",
    dangerBorder: "#FECACA",
  },
};

const maskNid = (nid) => {
  const s = String(nid || "");
  if (s.length < 3) return "";
  return "*" + s.slice(-3);
};

const fmtDate = (ts) => {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (!isNaN(d))
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {}
  return "—";
};

const fmtDateTime = (ts) => {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (!isNaN(d)) {
      const datePart = d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const timePart = d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      return `${datePart} - ${timePart}`;
    }
  } catch {}
  return "—";
};

const computeStatus = (p) => (p?.dispensed ? "Dispensed" : "Not Dispensed");

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

/* ============ Welcome Header ============ */
function WelcomeHeader({ name }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 16,
      }}
    >
      <img
        src="/Images/TrustDose-pill.png"
        alt="TrustDose pill"
        style={{ width: 60, height: 60, objectFit: "contain" }}
      />
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: TD.brand.ink }}>
          Welcome, {name || "there"}
        </div>
        <div style={{ color: TD.brand.sub, marginTop: 2 }}>Wishing you good health.</div>
      </div>
    </div>
  );
}

/* =========================
   Page
   ========================= */
export default function PatientPage() {
  const [nid, setNid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [patient, setPatient] = useState(null);
  const [rx, setRx] = useState({ items: [], blocked: false, error: "" });
  const [openIds, setOpenIds] = useState({});

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
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const found = await fetchPatientByFlexibleId(nid);
        if (!found) throw new Error("Patient not found. Please log in again.");
        const pres = await fetchPrescriptionsSmart(found.id, nid);
        pres.items = await hydrateNames(pres.items);
        setPatient(found.data);
        setRx(pres);
      } catch (e) {
        setErr(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [nid]);

  const fullName = useMemo(() => patient?.name || "-", [patient]);
  const toggleOpen = (id) => setOpenIds((s) => ({ ...s, [id]: !s[id] }));

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 20 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {loading && <div>Loading...</div>}
        {!loading && err && <div style={{ color: "red" }}>{err}</div>}

        {!loading && !err && (
          <>
            <WelcomeHeader name={fullName} />

            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Prescriptions</h2>

            {!rx.items.length && (
              <div style={{ color: "#6b7280", fontSize: 14, marginBottom: 8 }}>
                No prescriptions found for this patient.
                {rx.error ? ` (${rx.error})` : ""}
              </div>
            )}

            {rx.items.map((p) => {
              const status = computeStatus(p);
              const createdDate = fmtDate(p.createdAt);
              const createdFull = fmtDateTime(p.createdAt);
              const isOpen = !!openIds[p.id];

              const facility = p._facilityName || "—";
              const doctor = p._doctorName || "—";

              const medTitle = p.medicineLabel || p.medicineName || "Prescription";
              const rxNumber =
                p.prescriptionID ||
                p.prescriptionId ||
                p.rxNumber ||
                p.prescriptionNumber ||
                p.id;

              const statusStyles =
                status === "Dispensed"
                  ? { bg: TD.brand.successBg, text: TD.brand.successText, border: TD.brand.successBorder }
                  : { bg: TD.brand.dangerBg, text: TD.brand.dangerText, border: TD.brand.dangerBorder };

              return (
                <div
                  key={p.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 16,
                    overflow: "hidden",
                    background: "#fff",
                    marginBottom: 18,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 16px",
                      background: "#ffffff",
                      borderBottom: "1px solid #e5e7eb",
                      borderTopLeftRadius: 16,
                      borderTopRightRadius: 16,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <img
                        src="/Images/TrustDose_logo.png"
                        alt="TrustDose Logo"
                        style={{ height: 100, objectFit: "contain" }}
                      />
                      <div
                        style={{
                          background: "#ffffff",
                          color: "#000000",
                          borderRadius: 999,
                          padding: "10px 16px",
                          fontWeight: 700,
                          border: "none",
                          boxShadow: "none",
                        }}
                      >
                        Medical Prescription
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        background: "#ffffff",
                        color: "#000000",
                        padding: "8px 14px",
                        borderRadius: 8,
                        border: "none",
                        boxShadow: "none",
                      }}
                    >
                      Date issued: <span>{createdDate}</span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 12,
                      padding: 16,
                      alignItems: "center",
                      borderBottom: isOpen ? "1px solid #e5e7eb" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div
                        style={{
                          background: statusStyles.bg,
                          color: statusStyles.text,
                          border: `1px solid ${statusStyles.border}`,
                          padding: "4px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {status}
                      </div>

                      <div style={{ color: TD.brand.sub, fontSize: 14 }}>
                        Prescription No.:{" "}
                        <span style={{ color: TD.brand.ink, fontWeight: 700 }}>{rxNumber}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleOpen(p.id)}
                      style={{
                        background: TD.brand.primary,
                        color: "white",
                        border: "none",
                        padding: "8px 14px",
                        borderRadius: 10,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {isOpen ? "Hide details" : "View details"}
                    </button>
                  </div>

                  {isOpen && (
                    <div style={{ display: "grid", gap: 12, padding: 16, background: "#fff" }}>
                      <div style={{ fontWeight: 700, color: "#374151", marginBottom: 4 }}>
                        Prescription Details
                      </div>

                      <Row label="Patient Name" value={fullName} />
                      <Row label="National ID" value={maskNid(p.patientNationalID || p.nationalID)} />
                      <Row label="Healthcare Facility" value={facility} />
                      <Row label="Doctor Name" value={doctor} />
                      <Row label="Date & Time" value={createdFull} />

                      <div
                        style={{
                          marginTop: 10,
                          paddingTop: 10,
                          borderTop: "1px dashed #e5e7eb",
                          display: "grid",
                          gap: 6,
                        }}
                      >
                        <div style={{ fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                          Medicine Name: <span style={{ fontWeight: 700 }}>{medTitle}</span>
                        </div>
                        <Row label="Dosage" value={p.dosage || p.dose || "—"} />
                        <Row label="Frequency" value={p.frequency || p.timesPerDay || "—"} />
                        <Row label="Duration" value={p.durationDays ?? "—"} />

                        {p.sensitivity && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ color: "#6b7280", width: 170 }}>Sensitivity</div>
                            <div
                              style={{
                                fontSize: 13,
                                padding: "4px 10px",
                                borderRadius: 999,
                                fontWeight: 700,
                                border: "1px solid",
                                borderColor:
                                  p.sensitivity === "Sensitive"
                                    ? TD.brand.dangerBorder
                                    : TD.brand.successBorder,
                                background:
                                  p.sensitivity === "Sensitive"
                                    ? TD.brand.dangerBg
                                    : TD.brand.successBg,
                                color:
                                  p.sensitivity === "Sensitive"
                                    ? TD.brand.dangerText
                                    : TD.brand.successText,
                              }}
                            >
                              {p.sensitivity === "Sensitive"
                                ? "Sensitive - (Delivery)"
                                : "Non-Sensitive - (Pickup)"}
                            </div>
                          </div>
                        )}

                        {p.notes && <Row label="Notes" value={p.notes} />}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
