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
  Search,
  ChevronDown,
  ChevronUp,
  User,
  Building2,
  CalendarDays,
  Hash,
  FileText,
} from "lucide-react";

const C = {
  primary: "#B08CC1",
  primaryDark: "#9F76B4",
  teal: "#52B9C4",
  ink: "#4A2C59",
  pale: "#F6F1FA",
};

function fmtTs(v) {
  try {
    if (!v) return "-";
    if (typeof v?.toDate === "function") {
      const d = v.toDate();
      return d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
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

function Chip({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-xl border text-sm font-medium transition"
      style={{
        background: active ? "rgba(82,185,196,0.12)" : "#fff",
        borderColor: active ? "rgba(82,185,196,0.5)" : "#E5E7EB",
        color: active ? C.ink : "#374151",
      }}
    >
      {children}
    </button>
  );
}

function BadgeSensitive({ sensitive }) {
  return (
    <span
      className="text-xs px-3 py-1 rounded-full border font-semibold"
      style={{
        background: sensitive ? "#FEF2F2" : "#F0FDF4",
        borderColor: sensitive ? "#FECACA" : "#BBF7D0",
        color: sensitive ? "#991B1B" : "#166534",
      }}
    >
      {sensitive ? "Sensitive" : "Non-sensitive"}
    </span>
  );
}

function PillBadge({ icon: Icon, children }) {
  return (
    <span className="text-xs px-3 py-1 rounded-full border bg-gray-50 text-gray-700 inline-flex items-center gap-2">
      <Icon size={14} />
      {children}
    </span>
  );
}

function KV({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-9 w-9 rounded-xl grid place-items-center bg-gray-50 border">
        <Icon size={16} className="text-gray-700" />
      </div>
      <div>
        <div className="text-xs text-gray-500 font-medium">{label}</div>
        <div className="text-sm font-semibold text-gray-900 whitespace-pre-wrap">
          {value ? String(value) : "—"}
        </div>
      </div>
    </div>
  );
}

/** ✅ patientDisplayId عندكم مثل 7890
 * نحاول نجيب بياناته من patients بحيث patientId == patientDisplayId
 * (إذا عندكم حقل مختلف بالpatients خبريني أبدله بسطر واحد)
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
      const pid = String(data.patientId || data.PatientID || data.patientDisplayId || "");
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
        const doctorNameLS = (localStorage.getItem("userName") || "").trim();

        if (role !== "doctor" || !doctorNameLS) {
          setRows([]);
          setLoading(false);
          return;
        }

        const presRef = collection(db, "prescriptions");

        // ✅ بدون orderBy لتجنب index، بنرتب محلياً
        const q1 = query(
          presRef,
          where("doctorName", "==", doctorNameLS),
          fsLimit(400)
        );

        const s1 = await getDocs(q1);

        const list = s1.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const ta = a?.createdAt?.toMillis?.() ?? 0;
            const tb = b?.createdAt?.toMillis?.() ?? 0;
            return tb - ta;
          });

        setRows(list);

        // ✅ patientDisplayId الحقيقي
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
    let base = rows;

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
    <div className="px-6 py-10">
      <div className="max-w-6xl mx-auto">
        {/* Header card */}
        <div className="rounded-3xl bg-white border shadow-sm px-6 py-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xl font-semibold" style={{ color: C.ink }}>
                Prescription History
              </div>
              <div className="text-sm text-gray-500">Sorted from newest to oldest</div>
            </div>

            <div className="flex items-center gap-2">
              <Chip active={tab === "all"} onClick={() => setTab("all")}>
                All
              </Chip>
              <Chip active={tab === "sensitive"} onClick={() => setTab("sensitive")}>
                Sensitive
              </Chip>
              <Chip active={tab === "nonsensitive"} onClick={() => setTab("nonsensitive")}>
                Non-sensitive
              </Chip>
            </div>
          </div>

          <div className="relative w-full sm:w-[460px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              placeholder="Search (patient / id / rx...)"
              className="w-full pl-10 pr-3 py-3 border rounded-2xl focus:ring-2 focus:border-transparent"
              style={{ outlineColor: C.primary }}
            />
          </div>
        </div>

        {err && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 p-4">
            {err}
          </div>
        )}

        {loading ? (
          <div className="mt-6 text-gray-600">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="mt-6 rounded-3xl bg-white border p-7 text-gray-600">
            No prescriptions found for this doctor.
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {filtered.map((r) => {
              const show = openId === r.id;

              const sensitive = isSensitiveRx(r);
              const title = r.medicineLabel || r.medicineName || "Prescription";

              const pid = String(r.patientDisplayId || "");
              const patientInlineName = r.patientName || "";
              const patientInlinePhone = r.patientPhone || "";
              const patientFromDB = pid ? patientsById.get(pid) : null;

              const patientName = patientInlineName || patientFromDB?.name || "";
              const patientPhone = patientInlinePhone || patientFromDB?.phone || "";

              const ticket = r.prescriptionID || r.rxId || r.rxNo || r.ticketNo;

              return (
                <div key={r.id} className="rounded-3xl bg-white border shadow-sm overflow-hidden">
                  <div className="p-6 flex items-start justify-between gap-5">
                    <div className="min-w-0 w-full">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-bold truncate" style={{ color: C.ink }}>
                          {title}
                        </div>

                        <BadgeSensitive sensitive={sensitive} />

                        <PillBadge icon={CalendarDays}>{fmtTs(r.createdAt)}</PillBadge>

                        
                      </div>

                      {/* ✅ Patient + Facility فقط */}
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <KV
                          icon={User}
                          label="Patient"
                          value={
                            patientName
                              ? `${patientName}${pid ? ` (${pid})` : ""}`
                              : pid || "—"
                          }
                        />
                        <KV icon={Building2} label="Facility" value={r.doctorFacility} />
                      </div>
                    </div>

                    <button
                      onClick={() => setOpenId(show ? null : r.id)}
                      className="shrink-0 px-4 py-2.5 rounded-2xl border hover:bg-gray-50 font-semibold flex items-center gap-2"
                      style={{ color: C.ink }}
                    >
                      {show ? "Less" : "More"}
                      {show ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>

                  {/* Details (Doctor-only) */}
                  {show && (
                    <div className="border-t bg-white p-6">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                        <KV icon={FileText} label="Dosage" value={r.dosage} />
                        <KV icon={FileText} label="Form" value={r.dosageForm} />
                        <KV icon={FileText} label="Frequency" value={r.frequency} />
                      </div>

                      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-5">
                        <KV icon={FileText} label="Duration" value={r.durationDays} />
                        <KV icon={FileText} label="Medical Condition" value={r.medicalCondition} />
                        <KV icon={FileText} label="Notes" value={r.notes} />
                      </div>

                      <div className="mt-5">
                        <KV icon={User} label="Patient Phone" value={patientPhone} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
