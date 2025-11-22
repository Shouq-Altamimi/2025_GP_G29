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
   0) Local mapping 
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

/* =========================
   Fetch patient by ID
   ========================= */
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
      fsQuery(col, where("nationalId", "==", String(nid)), fsLimit(1)),
      fsQuery(col, where("nationalID", "==", String(nid)), fsLimit(1)),
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
   Fetch prescriptions
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

/* =========================
   Hydrate doctor & pharmacist info 
   ========================= */
/*async function hydrateNames(items) {
  const out = [];
  for (const p of items) {
    const doctorName =
      p.doctorName ||
      p.doctorFullName ||
      p.prescriberName ||
      p.createdByName ||
      p.practitionerName ||
      p.practitionerFullName ||
      (p.doctor && p.doctor.name) ||
      "";

   const facilityName =
  p.doctorFacility ||
  p.facilityName ||
  p.facility ||
  p.healthFacility ||
  p.healthcareFacility ||
  p.clinicName ||
  p.hospitalName ||
  p.locationName ||
  p.pharmacyName ||
  p?.doctor?.facility ||
  p?.doctor?.hospital ||
  p?.doctor?.facilityName ||
  (p.facility && p.facility.name) ||
  (p.hospital && p.hospital.name) ||
  "";


    // Pharmacist + Pharmacy fallbacks
    const pharmacistName =
      p.pharmacistName ||
      p.dispensedBy ||
      p.verifiedBy ||
      (p.pharmacist && p.pharmacist.name) ||
      "";

    const pharmacyName =
      p.pharmacyName ||
      p.pharmacyFacility ||
      p.pharmacy ||
      p.dispenseLocation ||
      "";

    out.push({
      ...p,
      _doctorName: doctorName || "—",
      _facilityName: facilityName || "—",
      _pharmacistName: pharmacistName || "—",
      _pharmacyName: pharmacyName || "—",
    });
  }
  return out;
}*/

async function hydrateNames(items) {
  const out = [];

  // ========== نجيب أول صيدلية ==========
  let globalPharmacyName = "—";
  try {
    const col = collection(db, "pharmacies");
    const snap = await getDocs(col);
    if (!snap.empty) {
      const first = snap.docs[0].data();
      if (first.name) globalPharmacyName = first.name;
    }
  } catch (e) {
    console.log("pharmacy fetch failed", e);
  }

  for (const p of items) {

    // ========== Doctor Name (من الوصفة فقط) ==========
    const doctorName =
      p.doctorName ||
      p.doctorFullName ||
      p.createdByName ||
      "";

    // ========== Healthcare Facility (من doctors collection) ==========
    let facilityName = "—";

    try {
      if (p.doctorId) {
        const doctorsCol = collection(db, "doctors");
        const q = fsQuery(doctorsCol, where("walletAddress", "==", p.doctorId), fsLimit(1));
        const snap = await getDocs(q);

        if (!snap.empty) {
          const d = snap.docs[0].data();
          if (d.facility) facilityName = d.facility;   // ← facility الحقيقي من الداتابيس
        }
      }
    } catch (e) {
      console.log("doctor facility fetch failed", e);
    }

    // ========== Push النهائي ==========
    out.push({
      ...p,
      _doctorName: doctorName,
      _facilityName: facilityName,       // ← Healthcare Facility
      _pharmacyName: globalPharmacyName,  // ← Pharmacy Name فقط
      // 🚫 _pharmacistName محذوف
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
      return d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
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
        gridTemplateColumns: "220px 1fr",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </div>
      <div style={{ fontWeight: 600, wordBreak: "break-word" }}>{value ?? "-"}</div>
    </div>
  );
}

function WelcomeHeader({ name }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <img src="/Images/TrustDose-pill.png" alt="TrustDose pill" style={{ width: 64, height: "auto", objectFit: "contain" }} />
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: TD.brand.ink }}>Welcome, {name || "there"}</div>
        <div style={{ color: TD.brand.sub, marginTop: 2 }}>Wishing you good health.</div>
      </div>
    </div>
  );
}

/* =========================
   Patient Page
   ========================= */
export default function PatientPage() {
  const [nid, setNid] = useState(null);
    // ========== Get logistics company name once from Firebase ==========
  const [logisticsName, setLogisticsName] = useState("—");
/////////////////////////////////////////////////////////////////

  useEffect(() => {
    (async () => {
      try {
        const col = collection(db, "logistics");
        const snap = await getDocs(col);
        if (!snap.empty) {
          const first = snap.docs[0].data();

          // نحاول نقرأ أكثر من اسم حقل عشان نغطي كل الحالات
          const name =
            first.companyName ||
            first.name ||
            first.company ||
            first.logisticsName ||
            first.title;

          if (name) {
            setLogisticsName(String(name));
            console.log("🚚 logisticsName =", name);
          } else {
            console.log("⚠️ logistics doc found but no name-like field", first);
          }
        } else {
          console.log("⚠️ no logistics docs found");
        }
      } catch (e) {
        console.log("logistics fetch failed", e);
      }
    })();
  }, []);

/////////////////////////////////////////////////////////////////////////////
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [patient, setPatient] = useState(null);
  const [rx, setRx] = useState({ items: [], blocked: false, error: "" });
  const [openIds, setOpenIds] = useState({});
  const [showEmailAlert, setShowEmailAlert] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const PER_PAGE = 3;

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
        pres.items = pres.items.map(p => ({ ...p, _logisticsName: logisticsName }));

        setPatient(found.data);

        // Show alert if the patient has no email saved
        setShowEmailAlert(!found.data.email);

        setRx(pres);
        setPage(1); // reset page when data changes
      } catch (e) {
        setErr(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [nid]);

  const fullName = useMemo(() => patient?.name || "-", [patient]);
  const toggleOpen = (id) => setOpenIds((s) => ({ ...s, [id]: !s[id] }));

  // ✅ زر My Profile يفتح مودال PShell عن طريق حدث Window
  const openProfile = () => window.dispatchEvent(new Event("openPatientProfile"));

  // Pagination derived values
  const total = rx.items.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (safePage - 1) * PER_PAGE;
  const endIdx = Math.min(startIdx + PER_PAGE, total);
  const pageItems = rx.items.slice(startIdx, endIdx);

  // Pagination bar (will be pinned to bottom via flex)
  const PaginationBar = () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginTop: 28,
      }}
    >
      <div style={{ color: TD.brand.ink }}>
        Showing <b>{pageItems.length}</b> out of <b>{total}</b> prescriptions
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ color: TD.brand.sub }}>
          Page <b>{safePage}</b> of <b>{totalPages}</b>
        </div>

        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={safePage <= 1}
          style={{
            border: "1px solid #e5e7eb",
            background: safePage <= 1 ? "#f3f4f6" : "#ffffff",
            color: safePage <= 1 ? "#9ca3af" : "#374151",
            padding: "8px 14px",
            borderRadius: 12,
            cursor: safePage <= 1 ? "not-allowed" : "pointer",
          }}
        >
          ← Prev
        </button>

        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={safePage >= totalPages}
          style={{
            background: TD.brand.primary,
            color: "white",
            border: "none",
            padding: "8px 16px",
            borderRadius: 12,
            cursor: safePage >= totalPages ? "not-allowed" : "pointer",
            opacity: safePage >= totalPages ? 0.6 : 1,
            fontWeight: 700,
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );

  return (
    // ===== Page wrapper as flex column to pin pagination to bottom =====
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Email alert (optional) */}
      {showEmailAlert && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            background: "transparent",
            marginTop: 0,
            paddingTop: 0,
          }}
        >
          <div
            style={{
              background: "#fff5cc",
              color: "#8a6d3b",
              border: "1px solid #ffe8a1",
              borderRadius: 12,
              padding: "12px 24px",
              marginTop: 12,
              maxWidth: 1000,
              width: "90%",
              textAlign: "center",
              fontWeight: 500,
            }}
          >
⚠️ Please verify your email so you can change your password later. Open My Profile
{" "}
            <button
              type="button"
              onClick={openProfile}
              style={{
                fontWeight: 800,
                color: TD.brand.primary,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
              }}
              aria-label="Open My Profile"
            >
              My Profile
            </button>{" "}
          </div>
        </div>
      )}

      {/* ===== Main content container grows, pagination sits at bottom ===== */}
      <div
        style={{
            maxWidth: 1120,
            margin: "0 auto",
            padding: "28px 24px",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            flex: 1, // take remaining height
          }}
      >
        {loading && <div>Loading...</div>}
        {!loading && err && <div style={{ color: "red" }}>{err}</div>}

        {!loading && !err && (
          <>
            <WelcomeHeader name={fullName} />
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Prescriptions</h2>

            {/* Grid: two relaxed columns */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                columnGap: 28,
                rowGap: 28,
                alignItems: "start",
                justifyItems: "stretch",
              }}
            >
              {pageItems.map((p) => {
                const status = computeStatus(p);
                const createdDate = fmtDate(p.createdAt);
                const createdFull = fmtDateTime(p.createdAt);
                //const dispensedAt = p.dispensedAt || p.dispensedOn || p.fulfilledAt || null;
                const dispensedAt =
  p.dispensedAt?.toDate ? p.dispensedAt :
  p.dispensedOn?.toDate ? p.dispensedOn :
  p.fulfilledAt?.toDate ? p.fulfilledAt :
  null;

                const isOpen = !!openIds[p.id];

                const facility = p._facilityName || "—";
                const doctor = p._doctorName || "—";
                const pharmacy = p._pharmacyName || "—";
                const logistics = p._logisticsName || "—";

                const medTitle = p.medicineLabel || p.micineName || p.medicineName || "Prescription";
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
                      background: "#fff",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                      overflow: "hidden",
                    }}
                  >
                    {/* Header */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 16px",
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <img src="/Images/TrustDose_logo.png" alt="TrustDose Logo" style={{ height: 28 }} />
                        <div style={{ fontWeight: 700, color: "#000" }}>Medical Prescription</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#000" }}>
                        Date issued: <span>{createdDate}</span>
                      </div>
                    </div>

                    {/* Summary */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 12,
                        padding: "14px 16px",
                        alignItems: "center",
                        borderBottom: isOpen ? "1px solid #e5e7eb" : "none",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div
                          style={{
                            background: statusStyles.bg,
                            color: statusStyles.text,
                            border: `1px solid ${statusStyles.border}`,
                            padding: "3px 9px",
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
                          padding: "7px 12px",
                          borderRadius: 10,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {isOpen ? "Hide details" : "View details"}
                      </button>
                    </div>

                    {/* Details */}
                    {isOpen && (
                      <div style={{ display: "grid", gap: 12, padding: 16 }}>
                        <div style={{ fontWeight: 700, color: "#374151" }}>Prescription Details</div>

                        <Row label="Patient Name" value={fullName} />
                        <Row label="National ID" value={maskNid(p.patientNationalID || p.nationalID || p.nid)} />
                        <Row label="Healthcare Facility" value={facility} />
                        <Row label="Doctor Name" value={doctor} />
                        <Row label="Pharmacy Name" value={pharmacy} />
                        {p.sensitivity === "Sensitive" && (
<Row label="Logistics Company" value={logisticsName !== "—" ? logisticsName : (p.logisticsName || "Dr. Sulaiman Al Habib Logistics")} />
)}

                        <Row label="Dispensed At" value={dispensedAt ? fmtDateTime(dispensedAt) : "—"} />
                        <Row label="Date & Time Consultation" value={createdFull} />
                        

                        <div style={{ borderTop: "1px dashed #e5e7eb", paddingTop: 10 }}>
                          <div style={{ fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                            Medicine Name: <span style={{ fontWeight: 700 }}>{medTitle}</span>
                          </div>
                          <Row label="Dosage" value={p.dosage || p.dose || "—"} />
                          <Row label="Frequency" value={p.frequency || p.timesPerDay || "—"} />
                          <Row label="Duration" value={p.durationDays ?? "—"} />

                          {p.sensitivity && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ color: "#6b7280", width: 220 }}>Sensitivity</div>
                              <div
                                style={{
                                  fontSize: 13,
                                  padding: "4px 10px",
                                  borderRadius: 999,
                                  fontWeight: 700,
                                  border: "1px solid",
                                  borderColor:
                                    p.sensitivity === "Sensitive" ? TD.brand.dangerBorder : TD.brand.successBorder,
                                  background:
                                    p.sensitivity === "Sensitive" ? TD.brand.dangerBg : TD.brand.successBg,
                                  color:
                                    p.sensitivity === "Sensitive" ? TD.brand.dangerText : TD.brand.successText,
                                }}
                              >
                               {p.sensitivity === "Sensitive" ? (
                                 <>
     Sensitive — (Delivery)
    {p.acceptDelivery || p.logisticsAccepted || p.dispensed ? (
      <>
        {" "}
        •{" "}
        {p.logisticsAccepted === true && p.dispensed === true
          ? "Delivered to you"
          : p.acceptDelivery === true && p.dispensed === true
          ? "Handed to logistics"
          : p.logisticsAccepted === true
          ? "Accepted by logistics"
          : p.acceptDelivery === true
          ? "Accepted by pharmacy"
          : ""
        }
      </>
    ) : null}
  </>
) : (
  "Non-Sensitive — (Pickup)"
)}
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
            </div>

            {/* Spacer pushes pagination to the very bottom when content is short */}
            <div style={{ flex: 1 }} />

            {/* Bottom pagination (always at page end) */}
            <PaginationBar />
          </>
        )}
      </div>
    </div>
  );
}
