// src/pages/Dashboard.jsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { CalendarDays } from "lucide-react";
import { db } from "../firebase";

const C = {
  primary: "#B08CC1",
  teal: "#52B9C4",
  ink: "#4A2C59",
  gray: "#666",
};

function Pill({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-xl text-sm font-semibold border transition"
      style={{
        background: active ? "rgba(176,140,193,0.18)" : "#fff",
        borderColor: active ? "rgba(176,140,193,0.55)" : "#E5E7EB",
        color: C.ink,
      }}
    >
      {children}
    </button>
  );
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeekSunday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  return d;
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function startOfYear() {
  const d = new Date();
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function toEnGB(v) {
  try {
    if (!v) return "";
    if (typeof v?.toDate === "function") return v.toDate().toLocaleString("en-GB");
    if (v instanceof Date) return v.toLocaleString("en-GB");
    if (typeof v === "number") return new Date(v).toLocaleString("en-GB");
  } catch {}
  return "";
}

export default function Dashboard() {
  const navigate = useNavigate();

  const role = (localStorage.getItem("userRole") || "").toLowerCase();
  const userId = localStorage.getItem("userId") || "";

  // حماية: اذا مافيه جلسة
  useEffect(() => {
    if (!role || !userId) navigate("/auth");
  }, [role, userId, navigate]);

  const [period, setPeriod] = useState("Daily");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const rangeStartDate = useMemo(() => {
    if (period === "Daily") return startOfToday();
    if (period === "Weekly") return startOfWeekSunday();
    if (period === "Monthly") return startOfMonth();
    return startOfYear(); // Annually
  }, [period]);

  // ✅ Query: prescriptions for this doctor within period
  useEffect(() => {
  if (!userId) return;

  setLoading(true);

  const startTs = Timestamp.fromDate(rangeStartDate);

  const qy = query(
    collection(db, "prescriptions"),
    where("doctorId", "==", userId),
    where("updatedAt", ">=", startTs),
    orderBy("updatedAt", "desc")
  );

  const unsub = onSnapshot(
    qy,
    (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    },
    () => {
      setItems([]);
      setLoading(false);
    }
  );

  return () => unsub();
}, [userId, rangeStartDate]);


  return (
    <div className="min-h-[calc(100vh-140px)] px-6 py-6">
      <div className="rounded-3xl border bg-white p-5 shadow-sm">
        {/* Period pills */}
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-2xl grid place-items-center"
            style={{ background: "rgba(176,140,193,0.18)", color: C.ink }}
          >
            <CalendarDays size={18} />
          </div>

          <div className="text-lg font-semibold" style={{ color: C.ink }}>
            Period
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Pill active={period === "Daily"} onClick={() => setPeriod("Daily")}>
            Daily
          </Pill>
          <Pill active={period === "Weekly"} onClick={() => setPeriod("Weekly")}>
            Weekly
          </Pill>
          <Pill active={period === "Monthly"} onClick={() => setPeriod("Monthly")}>
            Monthly
          </Pill>
          <Pill active={period === "Annually"} onClick={() => setPeriod("Annually")}>
            Annually
          </Pill>
        </div>

        {/* List */}
        <div className="mt-5">
          {loading ? (
            <div className="text-sm" style={{ color: C.gray }}>
              Loading prescriptions...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border bg-white p-5 text-center text-sm text-gray-500">
              No prescriptions in this period.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((p) => (
                <div
                  key={p.id}
                  className="rounded-2xl border p-4 hover:bg-gray-50 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-800 truncate">
                        {p.medicineName || p.medicineLabel || "Prescription"}
                        {p.patientName ? ` — ${p.patientName}` : ""}
                      </div>

                      <div className="text-xs mt-1" style={{ color: C.gray }}>
                        {p.prescriptionID ? `ID: ${p.prescriptionID}` : `Doc: ${p.id}`}
                        {typeof p.prescriptionNum !== "undefined"
                          ? ` · #${p.prescriptionNum}`
                          : ""}
                        {p.sensitivity ? ` · ${p.sensitivity}` : ""}
                      </div>

                      <div className="text-xs mt-1 text-gray-500">
                        {toEnGB(p.createdAt || p.updatedAt)}
                      </div>

                      {p.status && (
                        <div className="mt-2 inline-flex text-xs px-2 py-1 rounded-full border">
                          Status: <span className="ml-1 font-semibold">{String(p.status)}</span>
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 text-xs text-gray-400">{p.patientDisplayId || ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* (اختياري) تشوفين وش المختار + من متى يبدأ */}
        <div className="mt-5 text-sm" style={{ color: C.gray }}>
          Selected:{" "}
          <span className="font-semibold" style={{ color: C.ink }}>
            {period}
          </span>{" "}
          · From:{" "}
          <span className="font-semibold" style={{ color: C.ink }}>
            {toEnGB(rangeStartDate)}
          </span>
        </div>
      </div>
    </div>
  );
}
