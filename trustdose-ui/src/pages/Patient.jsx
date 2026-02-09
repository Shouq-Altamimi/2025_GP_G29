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
  const hex = [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

async function hydrateNames(items) {
  const out = [];

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
    const doctorName =
      p.doctorName ||
      p.doctorFullName ||
      p.createdByName ||
      "";

    let facilityName = "—";

    try {
      if (p.doctorId) {
        const doctorsCol = collection(db, "doctors");
        const q = fsQuery(doctorsCol, where("walletAddress", "==", p.doctorId), fsLimit(1));
        const snap = await getDocs(q);

        if (!snap.empty) {
          const d = snap.docs[0].data();
          facilityName =
            d.facility ||
            d.healthFacility ||
            d.facilityName ||
            d.healthcareFacility ||
            d.hospitalName ||
            "Dr. Sulaiman Al Habib Hospital";
        }
      }
    } catch (e) {
      console.log("doctor facility fetch failed", e);
    }

    out.push({
      ...p,
      _doctorName: doctorName,
      _facilityName: facilityName,
      _pharmacyName: globalPharmacyName,
    });
  }

  return out;
}

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
      <div
        style={{
          color: "#6b7280",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </div>
      <div style={{ fontWeight: 600, wordBreak: "break-word" }}>{value ?? "-"}</div>
    </div>
  );
}

function WelcomeHeader({ name }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <img
        src="/Images/TrustDose-pill.png"
        alt="TrustDose pill"
        style={{ width: 64, height: "auto", objectFit: "contain" }}
      />
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: TD.brand.ink }}>
          Welcome, {name || "there"}
        </div>
        <div style={{ color: TD.brand.sub, marginTop: 2 }}>Wishing you good health.</div>
      </div>
    </div>
  );
}

function normalizeSensitivity(raw) {
  const v = String(raw ?? "").trim().toLowerCase();

  // Sensitive
  if (v === "sensitive" || v === "true" || v === "1" || v === "yes" || v === "delivery") {
    return "Sensitive";
  }

  // Non-Sensitive
  if (
    v === "non-sensitive" ||
    v === "nonsensitive" ||
    v === "not sensitive" ||
    v === "false" ||
    v === "0" ||
    v === "no" ||
    v === "pickup"
  ) {
    return "Non-Sensitive";
  }

  return "";
}

export default function PatientPage() {
  const [nid, setNid] = useState(null);
  const [logisticsName, setLogisticsName] = useState("—");
  const [logisticsPhone, setLogisticsPhone] = useState("—");

  useEffect(() => {
    (async () => {
      try {
        const col = collection(db, "logistics");
        const snap = await getDocs(col);
        if (!snap.empty) {
          const first = snap.docs[0].data();

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
          if (first.phone) {
            setLogisticsPhone(String(first.phone));
            console.log("📞 logisticsPhone =", first.phone);
          }
        } else {
          console.log("⚠️ no logistics docs found");
        }
      } catch (e) {
        console.log("logistics fetch failed", e);
      }
    })();
  }, []);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [patient, setPatient] = useState(null);
  const [rx, setRx] = useState({ items: [], blocked: false, error: "" });
  const [openIds, setOpenIds] = useState({});
  const [showEmailAlert, setShowEmailAlert] = useState(false);

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
        pres.items = pres.items.map((p) => ({ ...p, _logisticsName: logisticsName }));

        setPatient(found.data);
        setShowEmailAlert(!found.data.email);

        setRx(pres);
        setPage(1);
      } catch (e) {
        setErr(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [nid]);

  const fullName = useMemo(() => patient?.name || "-", [patient]);
  const toggleOpen = (id) => setOpenIds((s) => ({ ...s, [id]: !s[id] }));

  const openProfile = () => window.dispatchEvent(new Event("openPatientProfile"));

    // ✅ دمج الوصفات: نجمع كل الأدوية تحت نفس رقم الوصفة
  const groupedRx = useMemo(() => {
    const map = new Map();

    const getKey = (p) =>
      String(
        p.prescriptionID ||
          p.prescriptionId ||
          p.rxNumber ||
          p.prescriptionNumber ||
          p.id // fallback
      );

    for (const p of rx.items || []) {
      const key = getKey(p);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }

    const out = Array.from(map.entries()).map(([key, meds]) => {
      // ترتيب الأدوية داخل نفس الوصفة (اختياري)
      meds.sort((a, b) =>
        String(a.medicineLabel || a.medicineName || "").localeCompare(
          String(b.medicineLabel || b.medicineName || "")
        )
      );

      // نخلي "base" أحدث سجل داخل المجموعة (علشان التاريخ وغيره يكون منطقي)
      const base =
        meds.reduce((best, cur) => {
          const bt = best?.createdAt?.toMillis?.() || 0;
          const ct = cur?.createdAt?.toMillis?.() || 0;
          return ct > bt ? cur : best;
        }, meds[0]) || meds[0] || {};

      // حالة الوصفة: إذا أي دواء dispensed نعتبر الوصفة dispensed
      const anyDispensed = meds.some((m) => m?.dispensed);

      return {
        ...base,
        id: key,      // ✅ مهم: نخلي id هو رقم الوصفة علشان toggleOpen يشتغل على المجموعة
        meds,         // ✅ هنا الأدوية المدموجة
        dispensed: anyDispensed,
        _medCount: meds.length,
      };
    });

    // ترتيب الوصفات من الأحدث
    out.sort(
      (a, b) =>
        (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
    );

    return out;
  }, [rx.items]);

 /* const total = rx.items.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (safePage - 1) * PER_PAGE;
  const endIdx = Math.min(startIdx + PER_PAGE, total);
  const pageItems = rx.items.slice(startIdx, endIdx);
*/

  const total = groupedRx.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (safePage - 1) * PER_PAGE;
  const endIdx = Math.min(startIdx + PER_PAGE, total);
  const pageItems = groupedRx.slice(startIdx, endIdx);

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

  function getCurrentStep(p) {
    if (p.deliveryConfirmed) return 5;
    if (p.dispensed) return 4;
    if (p.logisticsAccepted) return 3;
    if (p.acceptDelivery) return 2;
    return 1;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        display: "flex",
        flexDirection: "column",
      }}
    >

      {showEmailAlert && (
        <div style={{ margin: "0 24px 16px 24px" }}>
          <div
            style={{
              background: "#fff5cc",
              color: "#8a6d3b",
              padding: "12px",
              borderRadius: "10px",
              textAlign: "center",
              border: "1px solid #ffe8a1",
              fontWeight: 500,
            }}
          >
            ⚠️ Please verify your email so you can change your password later.&nbsp;
            <button
              type="button"
              onClick={openProfile}
              style={{
                fontWeight: 700,
                color: TD.brand.primary,
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
              aria-label="Open My Profile"
            >
              Open My Profile
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: "28px 24px",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          flex: 1,
        }}
      >
        {loading && <div>Loading...</div>}
        {!loading && err && <div style={{ color: "red" }}>{err}</div>}

        {!loading && !err && (
          <>
            <WelcomeHeader name={fullName} />
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Prescriptions</h2>

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
                const dispensedAt =
                  p.dispensedAt?.toDate
                    ? p.dispensedAt
                    : p.dispensedOn?.toDate
                    ? p.dispensedOn
                    : p.fulfilledAt?.toDate
                    ? p.fulfilledAt
                    : null;

                const isOpen = !!openIds[p.id];

                const facility = p._facilityName || "—";
                const doctor = p._doctorName || "—";
                const pharmacy = p._pharmacyName || "—";
                const logistics = p._logisticsName || "—";
//const medSensitivity = normalizeSensitivity(m.sensitivity);
//const groupSensitivity = normalizeSensitivity(groupSensitivityRaw);
const groupSensitivityRaw =
  p.sensitivity ?? (p.meds || []).find((mm) => mm.sensitivity)?.sensitivity;

const groupSensitivity = normalizeSensitivity(groupSensitivityRaw);



                const medTitle =
                  p.medicineLabel || p.micineName || p.medicineName || "Prescription";
                const rxNumber =
                  p.prescriptionID ||
                  p.prescriptionId ||
                  p.rxNumber ||
                  p.prescriptionNumber ||
                  p.id;

                const statusStyles =
                  status === "Dispensed"
                    ? {
                        bg: TD.brand.successBg,
                        text: TD.brand.successText,
                        border: TD.brand.successBorder,
                      }
                    : {
                        bg: TD.brand.dangerBg,
                        text: TD.brand.dangerText,
                        border: TD.brand.dangerBorder,
                      };

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
                        <img
                          src="/Images/TrustDose_logo.png"
                          alt="TrustDose Logo"
                          style={{ height: 28 }}
                        />
                        <div style={{ fontWeight: 700, color: "#000" }}>Medical Prescription</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#000" }}>
                        Date issued: <span>{createdDate}</span>
                      </div>
                    </div>

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

                    {isOpen && (
                      <div style={{ display: "grid", gap: 12, padding: 16 }}>
                        <div style={{ fontWeight: 700, color: "#374151" }}>Prescription Details</div>

                        <Row label="Patient Name" value={fullName} />

                        <Row label="National ID" value={maskNid(nid)} />

                        <Row label="Healthcare Facility" value={facility} />
                        <Row label="Doctor Name" value={doctor} />
                        <Row label="Pharmacy Name" value={pharmacy} />

                        <Row
                          label="Dispensed At"
                          value={dispensedAt ? fmtDateTime(dispensedAt) : "—"}
                        />
                        <Row label="Date & Time Consultation" value={createdFull} />

                        <div style={{ borderTop: "1px dashed #e5e7eb", paddingTop: 10 }}>
  {(p.meds || [p]).slice(0, 2).map((m, idx) => {
    const title =
      m.medicineLabel || m.micineName || m.medicineName || "Prescription";
const medSensitivity = normalizeSensitivity(m.sensitivity) || "Non-Sensitive";

    return (
      <div
        key={idx}
        style={{
          borderTop: idx === 0 ? "none" : "1px dashed #e5e7eb",
          paddingTop: idx === 0 ? 0 : 12,
          marginTop: idx === 0 ? 0 : 12,
        }}
      >
        <div style={{ fontWeight: 600, color: "#374151", marginBottom: 6 }}>
          Medicine {idx + 1}:{" "}
          <span style={{ fontWeight: 700 }}>{title}</span>
        </div>

        <Row label="Dosage" value={m.dosage || m.dose || "—"} />
        <Row label="Frequency" value={m.frequency || m.timesPerDay || "—"} />
        <Row label="Duration" value={m.durationDays ?? "—"} />
        
    {medSensitivity && (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
    <div style={{ color: "#6b7280", width: 220 }}>Sensitivity</div>
    <div
      style={{
        fontSize: 13,
        padding: "4px 10px",
        borderRadius: 999,
        fontWeight: 700,
        border: "1px solid",
        borderColor:
          medSensitivity === "Sensitive"
            ? TD.brand.dangerBorder
            : TD.brand.successBorder,
        background:
          medSensitivity === "Sensitive"
            ? TD.brand.dangerBg
            : TD.brand.successBg,
        color:
          medSensitivity === "Sensitive"
            ? TD.brand.dangerText
            : TD.brand.successText,
      }}
    >
      {medSensitivity === "Sensitive"
        ? "Sensitive — (Delivery)"
        : "Non-Sensitive — (Pickup)"}
    </div>
  </div>
)}

      </div>
    );
  })}
</div>



                          {groupSensitivity === "Sensitive" && (
                            <div
                              style={{
                                marginTop: 14,
                                paddingTop: 14,
                                borderTop: "1px solid #e5e7eb",
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 700,
                                  color: "#374151",
                                  marginBottom: 10,
                                  fontSize: 16,
                                }}
                              >
                                Logistics Provider Details
                              </div>

                              <Row label="Logistics Provider" value={logisticsName || logistics || "—"} />
                              <Row label="Logistics Phone" value={logisticsPhone || "—"} />
                            </div>
                          )}

                          {groupSensitivity === "Sensitive" &&
                            (() => {
                              const step = getCurrentStep(p);

                              const green = "#52B9C4";
                              const purple = "#B08CC1";
                              const gray = "#e5e7eb";

                              const colorFor = (s) => {
                                if (step >= s) return green;
                                if (step + 1 === s) return purple;
                                return gray;
                              };

                              const circleStyle = (s) => ({
                                width: 40,
                                height: 40,
                                borderRadius: "50%",
                                background: colorFor(s),
                                border: `4px solid ${colorFor(s)}`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "0.3s",
                                margin: "0 auto",
                              });

                              const dotStyle = (s) => ({
                                width: 12,
                                height: 12,
                                borderRadius: "50%",
                                background: step >= s || step + 1 === s ? "white" : "#a3a3a3",
                              });

                              const lineStyle = (s) => ({
                                height: 4,
                                flex: 1,
                                background: colorFor(s),
                                transition: "0.3s",
                                margin: "0 10px",
                              });

                              const labelStyle = {
                                marginTop: 8,
                                fontSize: 12,
                                textAlign: "center",
                              };

                              const step4Label = "Your medicine is safely on the way";

                              return (
                                <div style={{ marginTop: 28 }}>
                                  <div
                                    style={{
                                      fontWeight: 700,
                                      fontSize: 16,
                                      marginBottom: 18,
                                      color: TD.brand.ink,
                                    }}
                                  >
                                    Delivery Status
                                  </div>

                                  <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                                    <div style={{ width: "120px" }}>
                                      <div style={circleStyle(1)}>
                                        <div style={dotStyle(1)}></div>
                                      </div>
                                      <div style={labelStyle}>Order Placed</div>
                                    </div>

                                    <div style={lineStyle(2)}></div>

                                    <div style={{ width: "120px" }}>
                                      <div style={circleStyle(2)}>
                                        <div style={dotStyle(2)}></div>
                                      </div>
                                      <div style={labelStyle}>Accepted by Pharmacy</div>
                                    </div>

                                    <div style={lineStyle(3)}></div>

                                    <div style={{ width: "120px" }}>
                                      <div style={circleStyle(3)}>
                                        <div style={dotStyle(3)}></div>
                                      </div>
                                      <div style={labelStyle}>
                                        Accepted by <br /> Logistics Provider
                                      </div>
                                    </div>

                                    <div style={lineStyle(4)}></div>

                                    <div style={{ width: "120px" }}>
                                      <div style={circleStyle(4)}>
                                        <div style={dotStyle(4)}></div>
                                      </div>
                                      <div style={labelStyle}>{step4Label}</div>
                                    </div>

                                    <div style={lineStyle(5)}></div>

                                    <div style={{ width: "120px" }}>
                                      <div style={circleStyle(5)}>
                                        <div style={dotStyle(5)}></div>
                                      </div>
                                      <div style={labelStyle}>Delivered safely to you</div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                          {p.notes && <Row label="Notes" value={p.notes} />}
                        </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ flex: 1 }} />

            <PaginationBar />
          </>
        )}
      </div>
    </div>
  );
}
