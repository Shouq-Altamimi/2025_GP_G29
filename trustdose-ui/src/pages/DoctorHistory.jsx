"use client";

import React, { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  query,
  where,
  limit as fsLimit,
} from "firebase/firestore";

import {
  History,
  Search,
  ChevronDown,
  ChevronUp,
  User,
  Building2,
  Calendar,
  FileText,
  Pill,
} from "lucide-react";

const C = {
  primary: "#B08CC1",
  primaryDark: "#9F76B4",
  teal: "#52B9C4",
  ink: "#4A2C59",
  gray: "#64748b",
  line: "#E5E7EB",
  bg: "#F8FAFC",
  pale: "#F6F1FA",
};

function pillStyle(active) {
  return {
    background: active ? "rgba(82,185,196,0.18)" : "#fff",
    borderColor: active ? "rgba(82,185,196,0.55)" : C.line,
    color: C.ink,
  };
}
// ✅ Regex للحروف العربية + الرموز/الأرقام العربية
const ARABIC_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0660-\u0669\u06F0-\u06F9\u060C\u061B\u061F]/g;

// ينظّف النص من العربي
function stripArabic(text) {
  return String(text || "").replace(ARABIC_RE, "");
}

// يمنع الكتابة العربية أثناء الإدخال
function isArabicCharInput(e) {
  const k = e.key || "";
  // إذا ضغط Enter/Backspace/Arrow... لا تمنع
  if (k.length !== 1) return false;
  return ARABIC_RE.test(k);
}

function fmtDate(v) {
  try {
    if (!v) return "-";
    if (typeof v?.toDate === "function") return v.toDate().toLocaleString("en-GB");
    if (typeof v === "number") return new Date(v).toLocaleString("en-GB");
    return String(v);
  } catch {
    return "-";
  }
}

function safeStr(v) {
  if (v == null) return "";
  return String(v);
}

/** ✅ يعتمد على الحقل الحقيقي عندكم: sensitivity: "Sensitive" */
function isSensitiveRx(r) {
  const s = String(r?.sensitivity ?? "").trim().toLowerCase();
  if (!s) return false;
  return s === "sensitive" || s === "true" || s === "1" || s === "yes";
}

function RowItem({ icon, label, value }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <div className="mt-[2px] text-slate-500">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs" style={{ color: C.gray }}>
          {label}
        </div>
        <div
          className="text-sm font-semibold truncate"
          style={{ color: C.ink }}
          title={value || "-"}
        >
          {value || "-"}
        </div>
      </div>
    </div>
  );
}

function SensitiveBadge({ sensitive }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full border"
      style={{
        background: sensitive ? "rgba(220,38,38,0.08)" : "rgba(16,185,129,0.08)",
        borderColor: sensitive ? "rgba(220,38,38,0.30)" : "rgba(16,185,129,0.30)",
        color: sensitive ? "#991B1B" : "#065F46",
      }}
    >
      <Pill size={14} />
      {sensitive ? "Sensitive" : "Non-sensitive"}
    </span>
  );
}

/** ✅ patientDisplayId عندكم مثل 7890
 * نحاول نجيب بياناته من patients بحيث patientId == patientDisplayId
 */
async function fetchPatientsMap(patientDisplayIds) {
  const ids = Array.from(new Set(patientDisplayIds.filter(Boolean).map(String)));
  const map = new Map();
  if (ids.length === 0) return map;

  const chunk = (arr, n) => {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };

  for (const batch of chunk(ids, 10)) {
    const qy = query(collection(db, "patients"), where("patientId", "in", batch));
    const snap = await getDocs(qy);
    snap.forEach((d) => {
      const data = d.data() || {};
      const pid = String(
        data.patientId || data.PatientID || data.patientDisplayId || ""
      );
      if (!pid) return;
      map.set(pid, {
        name: data.name || data.patientName || "",
        phone: data.phone || data.patientPhone || "",
      });
    });
  }

  return map;
}

export default function DoctorHistory() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  const [qText, setQText] = useState("");
  const [openId, setOpenId] = useState(null);
  const [tab, setTab] = useState("all"); // all | sensitive | nonsensitive
  const [patientsById, setPatientsById] = useState(new Map());

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        setLoading(true);

        const role = localStorage.getItem("userRole");
        const doctorAccessId = (localStorage.getItem("userId") || "").trim(); // Dr-031

        if (role !== "doctor" || !doctorAccessId) {
          setRows([]);
          return;
        }

        // 1) Get doctor profile first (to know wallet/docId + name)
        const doctorSnap = await getDocs(
          query(
            collection(db, "doctors"),
            where("doctorId", "==", doctorAccessId),
            fsLimit(1)
          )
        );

        if (doctorSnap.empty) {
          setRows([]);
          setErr("Doctor record not found (doctors.doctorId mismatch).");
          return;
        }

        const doctorDoc = doctorSnap.docs[0];
        const doctorWalletOrDocId = doctorDoc.id; // غالبًا 0x...
        const doctorName = String(doctorDoc.data()?.name || "").trim();

        const presRef = collection(db, "prescriptions");

        // 2) Primary: match by doctorId (wallet) الموجود في prescriptions
        let presSnap = await getDocs(
          query(presRef, where("doctorId", "==", doctorWalletOrDocId), fsLimit(400))
        );

        // 3) Fallback: match by doctorName (لو بعض الوصفات القديمة محفوظة بالاسم)
        if (presSnap.empty && doctorName) {
          presSnap = await getDocs(
            query(presRef, where("doctorName", "==", doctorName), fsLimit(400))
          );
        }

        const list = presSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const ta = a?.createdAt?.toMillis?.() ?? 0;
            const tb = b?.createdAt?.toMillis?.() ?? 0;
            return tb - ta;
          });

        setRows(list);

        // patient lookup (باستخدام patientDisplayId)
        const ids = list.map((r) => r.patientDisplayId).filter(Boolean);
        const map = await fetchPatientsMap(ids);
        setPatientsById(map);
      } catch (e) {
        console.error(e);
        setErr(e?.message || "Failed to load prescriptions.");
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    let base = rows || [];

    base = base.filter((r) => {
      const sens = isSensitiveRx(r);
      if (tab === "sensitive") return sens;
      if (tab === "nonsensitive") return !sens;
      return true;
    });

    if (!t) return base;

    return base.filter((r) => {
      const pid = String(r.patientDisplayId || "");
      const p = patientsById.get(pid);

      const hay = [
        r.medicineLabel,
        r.medicineName,
        r.dosage,
        r.dosageForm,
        r.durationDays,
        r.frequency,
        r.notes,
        r.medicalCondition,
        r.doctorFacility,
        pid,
        r.patientName,
        r.patientPhone,
        p?.name,
        p?.phone,
        r.prescriptionID,
      ]
        .map(safeStr)
        .join(" ")
        .toLowerCase();

      return hay.includes(t);
    });
  }, [rows, qText, tab, patientsById]);

  return (
    <div style={{ background: C.bg }}>
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6 py-6">
        {/* Header card (نفس ستايل PharmacyHistory) */}
        <div
          className="rounded-3xl border bg-white p-5 shadow-sm"
          style={{ borderColor: C.line }}
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div
                className="h-11 w-11 rounded-2xl grid place-items-center"
                style={{ background: "rgba(176,140,193,0.18)", color: C.ink }}
              >
                <History size={18} />
              </div>

              <div>
                <div className="text-lg font-extrabold" style={{ color: C.ink }}>
                  Prescription History
                </div>
                <div className="text-sm" style={{ color: C.gray }}>
                  Sorted from newest → oldest
                </div>
              </div>
            </div>

            {/* Filter pills (نفس pills) */}
            <div className="flex items-center gap-2">
              <button
                className="px-4 py-2 rounded-xl text-sm font-semibold border transition"
                style={pillStyle(tab === "all")}
                onClick={() => setTab("all")}
              >
                All
              </button>
              <button
                className="px-4 py-2 rounded-xl text-sm font-semibold border transition"
                style={pillStyle(tab === "sensitive")}
                onClick={() => setTab("sensitive")}
              >
                Sensitive
              </button>
              <button
                className="px-4 py-2 rounded-xl text-sm font-semibold border transition"
                style={pillStyle(tab === "nonsensitive")}
                onClick={() => setTab("nonsensitive")}
              >
                Non-sensitive
              </button>
            </div>
          </div>

          {/* Search (بنفس شكل الكروت) */}
          <div className="mt-4 relative w-full sm:w-[520px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2"
              size={18}
              style={{ color: C.gray }}
            />
            <input
  value={qText}
  onChange={(e) => setQText(stripArabic(e.target.value))}
  onKeyDown={(e) => {
    if (isArabicCharInput(e)) e.preventDefault();
  }}
  onPaste={(e) => {
    const paste = e.clipboardData.getData("text");
    const cleaned = stripArabic(paste);
    if (cleaned !== paste) {
      e.preventDefault();
      setQText((prev) => (prev + cleaned).slice(0, 200)); // اختياري: حد للطول
    }
  }}
  placeholder="Search (name/rx...etc)"
  className="w-full pl-10 pr-3 py-3 rounded-2xl border focus:outline-none focus:ring-2"
  style={{ borderColor: C.line, outlineColor: C.primary }}
/>

          </div>
        </div>

        {/* Error */}
        {err && (
          <div
            className="mt-5 rounded-2xl border p-4 text-sm"
            style={{
              borderColor: "rgba(220,38,38,0.25)",
              background: "rgba(220,38,38,0.06)",
              color: "#991B1B",
            }}
          >
            {err}
          </div>
        )}

        {/* List */}
        <div className="mt-5 space-y-4">
          {loading ? (
            <div
              className="rounded-2xl border bg-white p-6 text-sm"
              style={{ borderColor: C.line, color: C.gray }}
            >
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div
              className="rounded-2xl border bg-white p-6 text-sm"
              style={{ borderColor: C.line, color: C.gray }}
            >
              No prescriptions found for this doctor.
            </div>
          ) : (
            filtered.map((r) => {
              const show = openId === r.id;
              const sensitive = isSensitiveRx(r);

              const title = r.medicineLabel || r.medicineName || "Prescription";
              const date = r?.createdAt || r?.updatedAt;

              const pid = String(r.patientDisplayId || "");
              const patientInlineName = r.patientName || "";
              const patientInlinePhone = r.patientPhone || "";
              const patientFromDB = pid ? patientsById.get(pid) : null;

              const patientName = patientInlineName || patientFromDB?.name || "";
              const patientPhone = patientInlinePhone || patientFromDB?.phone || "";

              return (
                <div
                  key={r.id}
                  className="rounded-3xl border bg-white shadow-sm overflow-hidden"
                  style={{ borderColor: C.line }}
                >
                  {/* Top row */}
                  <div className="p-4 md:p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 w-full">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-lg font-extrabold truncate" style={{ color: C.ink }}>
                            {title}
                          </div>

                          <SensitiveBadge sensitive={sensitive} />

                          {/* Date badge (نفس ستايل PharmacyHistory) */}
                          <span
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full border"
                            style={{
                              background: "rgba(176,140,193,0.10)",
                              borderColor: "rgba(176,140,193,0.28)",
                              color: C.ink,
                            }}
                          >
                            <Calendar size={14} />
                            {fmtDate(date)}
                          </span>
                        </div>

                        {/* ✅ Patient + Facility */}
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <RowItem
                            icon={<User size={16} />}
                            label="Patient"
                            value={
                              patientName
                                ? `${patientName}${pid ? ` (${pid})` : ""}`
                                : pid || "—"
                            }
                          />
                          <RowItem
                            icon={<Building2 size={16} />}
                            label="Facility"
                            value={r.doctorFacility || "-"}
                          />
                        </div>
                      </div>

                      {/* Expand */}
                      <button
                        onClick={() => setOpenId(show ? null : r.id)}
                        className="shrink-0 px-4 py-2 rounded-xl border text-sm font-semibold hover:bg-slate-50"
                        style={{ borderColor: C.line, color: C.ink }}
                      >
                        {show ? (
                          <span className="inline-flex items-center gap-2">
                            Less <ChevronUp size={16} />
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            More <ChevronDown size={16} />
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Details */}
                  {show && (
                    <div className="border-t" style={{ borderColor: C.line }}>
                      <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <RowItem icon={<FileText size={16} />} label="Dosage" value={r.dosage || "-"} />
                        <RowItem icon={<Pill size={16} />} label="Form" value={r.dosageForm || "-"} />
                        <RowItem icon={<FileText size={16} />} label="Frequency" value={r.frequency || "-"} />

                        <RowItem icon={<FileText size={16} />} label="Duration" value={r.durationDays || "-"} />
                        <RowItem icon={<FileText size={16} />} label="Medical Condition" value={r.medicalCondition || "-"} />
                        <RowItem icon={<User size={16} />} label="Patient Phone" value={patientPhone || "-"} />

                        <div className="md:col-span-3">
                          <div className="text-xs" style={{ color: C.gray }}>
                            Notes
                          </div>
                          <div className="text-sm font-semibold" style={{ color: C.ink }}>
                            {r.notes ? String(r.notes) : "-"}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
