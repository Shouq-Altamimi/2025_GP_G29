// src/pages/PharmacyHistory.jsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  limit,
  query,
  startAfter,
} from "firebase/firestore";
import { db } from "../firebase";

import {
  History,
  Search,
  Calendar,
  User,
  Stethoscope,
  Building2,
  Truck,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Pill,
} from "lucide-react";

const C = {
  primary: "#B08CC1",
  teal: "#52B9C4",
  ink: "#4A2C59",
  gray: "#64748b",
  line: "#E5E7EB",
  bg: "#F8FAFC",
};

const PAGE_SIZE = 10;

const LOGISTICS_NAME = "Dr. Sulaiman Al Habib Logistics";

function pillStyle(active) {
  return {
    background: active ? "rgba(82,185,196,0.18)" : "#fff",
    borderColor: active ? "rgba(82,185,196,0.55)" : C.line,
    color: C.ink,
  };
}

function fmtDate(v) {
  try {
    if (!v) return "-";
    if (typeof v?.toDate === "function") return v.toDate().toLocaleString("en-GB");
    if (typeof v === "number") return new Date(v).toLocaleString("en-GB");
    return "-";
  } catch {
    return "-";
  }
}

function safeStr(v) {
  if (v == null) return "";
  return String(v);
}

function isSensitive(rx) {
  const s = String(rx?.sensitivity || rx?.sensitive || "").toLowerCase();
  return s === "sensitive" || rx?.isSensitive === true;
}

const ARABIC_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0660-\u0669\u06F0-\u06F9\u060C\u061B\u061F]/g;

function stripArabic(text) {
  return String(text || "").replace(ARABIC_RE, "");
}

function isArabicCharInput(e) {
  const k = e.key || "";
  if (k.length !== 1) return false;
  return ARABIC_RE.test(k);
}

function deliveryStatus(rx) {
  const delivered = rx?.deliveryConfirmed === true || rx?.deliveryConfirmedAt;
  const logisticsAccepted = rx?.logisticsAccepted === true || rx?.logisticsAcceptedAt;
  const acceptDelivery = rx?.acceptDelivery === true || rx?.acceptDeliveryAt;

  if (delivered) return { label: "Delivered", icon: <CheckCircle2 size={16} />, tone: "ok" };
  if (logisticsAccepted) return { label: "With Logistics", icon: <Truck size={16} />, tone: "info" };
  if (acceptDelivery) return { label: "Accepted for Delivery", icon: <Clock size={16} />, tone: "warn" };
  return { label: "Not shipped yet", icon: <Clock size={16} />, tone: "muted" };
}

function toneBadge(tone) {
  if (tone === "ok") return { bg: "rgba(16,185,129,0.12)", bd: "rgba(16,185,129,0.35)", tx: "#065f46" };
  if (tone === "info") return { bg: "rgba(82,185,196,0.14)", bd: "rgba(82,185,196,0.45)", tx: C.ink };
  if (tone === "warn") return { bg: "rgba(245,158,11,0.12)", bd: "rgba(245,158,11,0.35)", tx: "#7c2d12" };
  return { bg: "rgba(100,116,139,0.10)", bd: "rgba(100,116,139,0.25)", tx: C.gray };
}

function RowItem({ icon, label, value }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <div className="mt-[2px] text-slate-500">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs" style={{ color: C.gray }}>{label}</div>
        <div className="text-sm font-semibold truncate" style={{ color: C.ink }}>
          {value || "-"}
        </div>
      </div>
    </div>
  );
}

export default function PharmacyHistory() {
  const [filter, setFilter] = useState("all"); 
  const [expanded, setExpanded] = useState(() => new Set());

  const [qText, setQText] = useState("");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [cursor, setCursor] = useState(null);     
  const [hasMore, setHasMore] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);

 
  async function loadPage(initial = false) {
    try {
      if (initial) {
        setLoading(true);
        setRows([]);
        setCursor(null);
        setHasMore(true);
      } else {
        setFetchingMore(true);
      }

      let localCursor = initial ? null : cursor;

      const COL = collection(db, "prescriptions");

      let keepGoing = true;
      let tempCursor = localCursor;
      let collected = [];
      let safety = 0;

      while (keepGoing && collected.length < PAGE_SIZE && safety < 8) {
        safety++;

        let qy = query(COL, orderBy("updatedAt", "desc"), limit(25));
        if (tempCursor) qy = query(COL, orderBy("updatedAt", "desc"), startAfter(tempCursor), limit(25));

        const snap = await getDocs(qy);

        if (snap.empty) {
          keepGoing = false;
          tempCursor = null;
          break;
        }

        tempCursor = snap.docs[snap.docs.length - 1];

        const page = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const dispensedOnly = page.filter((p) => p?.dispensed === true || p?.dispensedAt);

        collected = collected.concat(dispensedOnly);

        if (snap.docs.length < 25) keepGoing = false;
      }

      const nextBatch = collected.slice(0, PAGE_SIZE);

      setRows((prev) => (initial ? nextBatch : prev.concat(nextBatch)));
      setCursor(tempCursor);

      if (!tempCursor || nextBatch.length === 0) {
        setHasMore(false);
      } else {
        if (nextBatch.length < PAGE_SIZE) setHasMore(false);
      }
    } catch (e) {
      console.error("PharmacyHistory load error:", e);
      setHasMore(false);
    } finally {
      setLoading(false);
      setFetchingMore(false);
    }
  }

  useEffect(() => {
    loadPage(true);
  }, []);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    let base = rows || [];

    if (filter === "sensitive") base = base.filter((r) => isSensitive(r));
    if (filter === "nonsensitive") base = base.filter((r) => !isSensitive(r));

    if (!t) return base;

    return base.filter((rx) => {
      const med = rx?.medicineName || rx?.medicineLabel || "";
      const patient = rx?.patientDisplayId || rx?.patientId || rx?.nationalID || "";
      const doctor = rx?.doctorName || "";
      const facility = rx?.doctorFacility || "";
      const notes = rx?.notes || "";
      const dosage = rx?.dosage || "";
      const form = rx?.dosageForm || "";
      const freq = rx?.frequency || "";
      const pid = rx?.prescriptionID || rx?.rxId || rx?.rxNo || "";

      const hay = [
        med,
        patient,
        doctor,
        facility,
        notes,
        dosage,
        form,
        freq,
        pid,
      ]
        .map(safeStr)
        .join(" ")
        .toLowerCase();

      return hay.includes(t);
    });
  }, [rows, filter, qText]);

  function toggleExpand(id) {
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  return (
    <div style={{ background: C.bg }}>
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6 py-6">
        {/* Card header */}
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
                  Dispensed prescriptions (newest → oldest)
                </div>
              </div>
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-2">
              <button
                className="px-4 py-2 rounded-xl text-sm font-semibold border transition"
                style={pillStyle(filter === "all")}
                onClick={() => setFilter("all")}
              >
                All
              </button>
              <button
                className="px-4 py-2 rounded-xl text-sm font-semibold border transition"
                style={pillStyle(filter === "sensitive")}
                onClick={() => setFilter("sensitive")}
              >
                Sensitive
              </button>
              <button
                className="px-4 py-2 rounded-xl text-sm font-semibold border transition"
                style={pillStyle(filter === "nonsensitive")}
                onClick={() => setFilter("nonsensitive")}
              >
                Non-sensitive
              </button>
            </div>
          </div>

          {}
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
                  setQText((prev) => prev + cleaned);
                }
              }}
              placeholder="Search (name/rx...etc)"
              className="w-full pl-10 pr-3 py-3 rounded-2xl border focus:outline-none focus:ring-2"
              style={{
                borderColor: C.line,
                outlineColor: C.primary,
              }}
              onFocus={(e) => (e.target.style.boxShadow = `0 0 0 3px rgba(176,140,193,0.18)`)}
              onBlur={(e) => (e.target.style.boxShadow = "none")}
            />
          </div>
        </div>

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
              No dispensed prescriptions found.
              
            </div>
          ) : (
            filtered.map((rx) => {
              const expandedNow = expanded.has(rx.id);
              const sensitive = isSensitive(rx);

              const status = deliveryStatus(rx);
              const tb = toneBadge(status.tone);

              const med = rx?.medicineName || rx?.medicineLabel || "Prescription";
              const date = rx?.dispensedAt || rx?.updatedAt || rx?.createdAt;

              const patient = rx?.patientDisplayId || rx?.patientId || rx?.nationalID || "-";
              const doctor = rx?.doctorName || "-";
              const facility = rx?.doctorFacility || "-";

              return (
                <div
                  key={rx.id}
                  className="rounded-3xl border bg-white shadow-sm overflow-hidden"
                  style={{ borderColor: C.line }}
                >
                  {/* Top row */}
                  <div className="p-4 md:p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-lg font-extrabold truncate" style={{ color: C.ink }}>
                            {med}
                          </div>

                          {/* Sensitive badge */}
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

                          {/* Date badge */}
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

                          {/* Delivery badge */}
                          <span
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full border"
                            style={{
                              background: tb.bg,
                              borderColor: tb.bd,
                              color: tb.tx,
                            }}
                          >
                            {status.icon}
                            {status.label}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <RowItem icon={<User size={16} />} label="Patient" value={patient} />
                          <RowItem icon={<Stethoscope size={16} />} label="Doctor" value={doctor} />
                          <RowItem icon={<Building2 size={16} />} label="Facility" value={facility} />
                        </div>
                      </div>

                      {/* Expand */}
                      <button
                        onClick={() => toggleExpand(rx.id)}
                        className="shrink-0 px-4 py-2 rounded-xl border text-sm font-semibold hover:bg-slate-50"
                        style={{ borderColor: C.line, color: C.ink }}
                      >
                        {expandedNow ? (
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
                  {expandedNow && (
                    <div className="border-t" style={{ borderColor: C.line }}>
                      <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <RowItem icon={<Pill size={16} />} label="Dosage" value={rx?.dosage || "-"} />
                        <RowItem icon={<Pill size={16} />} label="Form" value={rx?.dosageForm || "-"} />
                        <RowItem icon={<Clock size={16} />} label="Frequency" value={rx?.frequency || "-"} />

                        <RowItem icon={<Clock size={16} />} label="Duration" value={rx?.durationDays || "-"} />
                        <RowItem icon={<Truck size={16} />} label="Logistics" value={LOGISTICS_NAME} />
                        <RowItem
                          icon={<CheckCircle2 size={16} />}
                          label="Delivery confirmed"
                          value={rx?.deliveryConfirmed === true ? "Yes" : "No"}
                        />

                        <div className="md:col-span-3">
                          <div className="text-xs" style={{ color: C.gray }}>Notes</div>
                          <div className="text-sm font-semibold" style={{ color: C.ink }}>
                            {rx?.notes ? String(rx.notes) : "-"}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* More */}
          {!loading && filtered.length > 0 && (
            <div className="pt-2">
              {hasMore ? (
                <button
                  onClick={() => loadPage(false)}
                  disabled={fetchingMore}
                  className="px-5 py-3 rounded-2xl font-bold text-white disabled:opacity-60"
                  style={{ background: C.primary }}
                >
                  {fetchingMore ? "Loading..." : "More"}
                </button>
              ) : (
                <button
                  disabled
                  className="px-5 py-3 rounded-2xl font-bold text-white opacity-70"
                  style={{ background: C.primary }}
                >
                  No more
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
