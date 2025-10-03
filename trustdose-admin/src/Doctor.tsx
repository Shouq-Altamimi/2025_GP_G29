// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect } from "react";
import { db } from "./firebase";


import {
  collection,
  query as qref,
  where,
  getDocs,
  onSnapshot,
  orderBy,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

/** ===== Catalog (names only) ===== */
const MEDICINE_CATALOG = [
  "Panadol",
  "Amoxicillin",
  "Metformin",
  "Atorvastatin",
  "Omeprazole",
  "Losartan",
  "Insulin",
  "Ibuprofen",
  "Paracetamol",
  "Azithromycin",
  "Vitamin D",
  "Cough Syrup",
];

const ROUTES = ["New Prescription", "Statistics"] as string[];

export default function DoctorHomePage() {
  const [route, setRoute] = useState("New Prescription");

  // ===== بحث المريض =====
  const [q, setQ] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [msg, setMsg] = useState("");

  // ===== إنشاء وصفة =====
  const [medicine, setMedicine] = useState("");
  const [dose, setDose] = useState("");
  const [timesPerDay, setTimesPerDay] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [notes, setNotes] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  // ===== وصفات المريض (تنعرض بالهيستوري) =====
  const [rxs, setRxs] = useState<any[]>([]);

  const medSuggestions = useMemo(() => {
    const s = (medicine || "").trim().toLowerCase();
    if (!s) return [];
    return MEDICINE_CATALOG.filter((m) => m.toLowerCase().includes(s)).slice(0, 8);
  }, [medicine]);

  const patientRxs = useMemo(() => {
    if (!selectedPatient?.id) return [];
    return rxs.filter((r) => r.patientId === selectedPatient.id);
  }, [rxs, selectedPatient]);

  /** ========== البحث في Firestore بالـ nationalID ========== */
  async function runSearch() {
    try {
      setMsg("");
      const id = toEnglishDigits(q).replace(/[^0-9]/g, "");
      if (!id) {
        setSelectedPatient(null);
        return;
      }

      const patientsCol = collection(db, "patients");
      const snap = await getDocs(qref(patientsCol, where("nationalID", "==", id)));

      if (snap.empty) {
        setSelectedPatient({ id, notFound: true });
        setMsg("No patient found with this National ID");
        return;
      }

      const doc = snap.docs[0];
      const data = doc.data();

      const patientObj = {
        id: data.nationalID || id,
        name: data.name || "-",
        gender: data.gender || "-",
        contact: data.contact || "-",
        birthdate: fmtDate(data.birthdate),
        location: data.Location || "-",
        _docId: doc.id,
      };

      setSelectedPatient(patientObj);
      setMsg("");
    } catch (err) {
      console.error(err);
      setMsg("Error while searching. Please try again.");
    }
  }

  /** ========== الاشتراك في وصفات المريض من Firestore ========== */
  useEffect(() => {
    if (!selectedPatient?.id) return;

    const presCol = collection(db, "prescriptions");
    const qry = qref(
      presCol,
      where("patientId", "==", selectedPatient.id),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qry,
      (snap) => {
        const list = snap.docs.map((d) => {
          const x = d.data() || {};
          return {
            ref: x.ref || d.id,
            patientId: x.patientId,
            patientName: x.patientName || "",
            medicine: x.medicine,
            dose: x.dose,
            timesPerDay: x.timesPerDay,
            durationDays: x.durationDays,
            status: x.status || "Created",
            createdAt: fmtDate(x.createdAt) || fmtNow(),
            notes: x.notes || "",
          };
        });
        setRxs((prev) => {
          const others = prev.filter((r) => r.patientId !== selectedPatient.id);
          return [...list, ...others];
        });
      },
      (e) => console.error(e)
    );

    return () => unsub();
  }, [selectedPatient?.id]);

  /** ========== إنشاء وصفة وإرسالها لـ Firestore ========== */
  async function createRx() {
    if (!selectedPatient?.id) return setMsg("Select patient first");
    if (!medicine) return setMsg("Enter a medicine name");
    if (!dose || !timesPerDay || !durationDays)
      return setMsg("Please select dosage, times per day, and duration");

    const refCode = `RX-${Math.floor(Math.random() * 100000)
      .toString()
      .padStart(5, "0")}`;

    const newRx = {
      ref: refCode,
      patientId: selectedPatient.id,
      patientName: selectedPatient.name || "",
      medicine,
      dose,
      timesPerDay,
      durationDays,
      status: "Created",
      createdAt: serverTimestamp(),
      notes: (notes || "").trim(),
    };

    try {
      await addDoc(collection(db, "prescriptions"), newRx);
      setMedicine("");
      setDose("");
      setTimesPerDay("");
      setDurationDays("");
      setNotes("");
      setShowSuggestions(false);
      setMsg(`${refCode} created`);
    } catch (e) {
      console.error(e);
      setMsg("Failed to create prescription. Try again.");
    }
  }

  return (
    <div className="min-h-screen flex bg-slate-50 text-[color:#3b2550]">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-gradient-to-b from-[#B08CC1] to-[#52B9C4] text-white p-5">
        <div className="font-extrabold tracking-wide">TrustDose — Doctor</div>
        <nav className="mt-5 space-y-2">
          {ROUTES.map((r) => (
            <button
              key={r}
              onClick={() => setRoute(r)}
              className={
                "w-full text-left px-3 py-2 rounded-lg transition border font-medium " +
                (route === r
                  ? "bg-white text-[#3b2550] border-[#3b2550]"
                  : "bg-white text-[#3b2550] hover:bg-gray-100 border-gray-300")
              }
            >
              {r}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 space-y-5">
        {route === "New Prescription" && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">New Prescription</h1>

            {/* Search */}
            <div className="bg-white border rounded-xl p-4 shadow-sm">
              <div className="font-medium">Search Patients</div>
              <div className="flex gap-2 mt-2 items-center">
                <input
                  className="h-10 px-3 rounded-lg border flex-1"
                  placeholder="Enter National ID"
                  value={q}
                  onChange={(e) => setQ(toEnglishDigits(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      runSearch();
                    }
                  }}
                  type="text"
                  dir="ltr"
                  inputMode="numeric"
                />
                <button
                  onClick={runSearch}
                  className="h-10 px-4 rounded-lg bg-[#3b2550] text-white hover:opacity-90"
                >
                  Search
                </button>
              </div>
              {!!msg && (
                <div
                  className={
                    "mt-2 text-sm " +
                    (msg.includes("created") ? "text-emerald-600" : "text-rose-600")
                  }
                >
                  {msg}
                </div>
              )}
            </div>

            {/* Patient Info + Create Rx */}
            {selectedPatient && (
              <div className="space-y-4">
                {/* Patient Info */}
                <div className="bg-white border rounded-xl p-4 shadow-sm space-y-3">
                  <div className="font-semibold">Patient Info</div>
                  <div className="grid auto-cols-fr sm:grid-cols-4 gap-2 text-sm">
                    <Info label="Name" value={selectedPatient.name ?? "-"} />
                    <Info label="National ID" value={selectedPatient.id} />
                    <Info label="Gender" value={selectedPatient.gender ?? "-"} />
                    <Info label="Contact" value={selectedPatient.contact ?? "-"} />
                    <Info label="Birthdate" value={selectedPatient.birthdate ?? "-"} />
                    <Info label="Location" value={selectedPatient.location ?? "-"} />
                  </div>
                  <button
                    onClick={() => setRoute("History")}
                    className="h-10 px-4 rounded-lg bg-[#3b2550] text-white hover:opacity-90"
                  >
                    View Previous Prescriptions
                  </button>
                </div>

                {/* Create Prescription */}
                <div className="bg-white border rounded-xl p-4 shadow-sm space-y-3">
                  <div className="font-semibold">Create Prescription</div>

                  <input
                    className="h-10 px-3 rounded-lg border w-full"
                    placeholder="Enter medicine name"
                    value={medicine}
                    onChange={(e) => {
                      setMedicine(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 100)}
                  />

                  {showSuggestions && medSuggestions.length > 0 && (
                    <div className="border rounded-md bg-white shadow-sm max-h-40 overflow-y-auto">
                      {medSuggestions.map((d) => (
                        <div
                          key={d}
                          onClick={() => {
                            setMedicine(d);
                            setShowSuggestions(false);
                          }}
                          className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                        >
                          {d}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid md:grid-cols-3 gap-2">
                    <select
                      className="h-10 px-2 rounded-lg border"
                      value={dose}
                      onChange={(e) => setDose(e.target.value)}
                    >
                      <option value="" disabled hidden>
                        Dosage
                      </option>
                      {[
                        "5 mg",
                        "10 mg",
                        "20 mg",
                        "50 mg",
                        "100 mg",
                        "1 tablet",
                        "2 tablets",
                        "1 capsule",
                        "5 mL",
                        "10 mL",
                      ].map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>

                    <select
                      className="h-10 px-2 rounded-lg border"
                      value={timesPerDay}
                      onChange={(e) => setTimesPerDay(e.target.value)}
                    >
                      <option value="" disabled hidden>
                        Times per Day
                      </option>
                      {[
                        "Once daily (OD)",
                        "Twice daily (BID)",
                        "Three times daily (TID)",
                        "Four times daily (QID)",
                      ].map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>

                    <select
                      className="h-10 px-2 rounded-lg border"
                      value={durationDays}
                      onChange={(e) => setDurationDays(e.target.value)}
                    >
                      <option value="" disabled hidden>
                        Duration
                      </option>
                      {["3 days", "5 days", "7 days", "10 days", "14 days", "1 month"].map(
                        (o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  <textarea
                    className="w-full h-24 mt-1 rounded-lg border px-3 py-2"
                    placeholder="Notes (optional)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />

                  <div className="flex gap-2">
                    <button
                      onClick={createRx}
                      className="h-10 px-4 rounded-lg bg-[#3b2550] text-white hover:opacity-90"
                    >
                      Create Prescription
                    </button>
                    {!!msg && (
                      <span
                        className={
                          "self-center text-sm " +
                          (msg.includes("created") ? "text-emerald-600" : "text-rose-600")
                        }
                      >
                        {msg}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {route === "Statistics" && (
          <div className="space-y-3">
            <h1 className="text-2xl font-bold">Statistics</h1>
            <div className="flex gap-2">
              {["Daily", "Weekly", "Monthly", "Yearly"].map((r) => (
                <button
                  key={r}
                  className="h-9 px-4 rounded-lg border bg-white text-[#3b2550] hover:bg-gray-100 font-medium"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {route === "History" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">Prescription History</h1>
              <button
                onClick={() => setRoute("New Prescription")}
                className="h-9 px-3 rounded-lg border bg-white hover:bg-gray-50"
              >
                ← Back
              </button>
            </div>

            {!selectedPatient ? (
              <div className="p-4 rounded-lg border bg-white text-gray-600">
                Select a patient from “New Prescription” first.
              </div>
            ) : (
              <div className="bg-white border rounded-xl p-4 shadow-sm">
                <div className="text-sm text-gray-600 mb-2">
                  Patient: <b>{selectedPatient.name ?? "-"}</b> — ID:{" "}
                  <b>{selectedPatient.id}</b>
                </div>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 text-left">Ref</th>
                        <th className="p-2 text-left">Created</th>
                        <th className="p-2 text-left">Medicine</th>
                        <th className="p-2 text-left">Dose</th>
                        <th className="p-2 text-left">x/day</th>
                        <th className="p-2 text-left">Duration</th>
                        <th className="p-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patientRxs.length === 0 ? (
                        <tr>
                          <td className="p-2 text-gray-500" colSpan={7}>
                            No prescriptions.
                          </td>
                        </tr>
                      ) : (
                        patientRxs.map((r) => (
                          <tr key={r.ref} className="border-t hover:bg-gray-50">
                            <td className="p-2">{r.ref}</td>
                            <td className="p-2">{r.createdAt}</td>
                            <td className="p-2">{r.medicine}</td>
                            <td className="p-2">{r.dose}</td>
                            <td className="p-2">{r.timesPerDay}</td>
                            <td className="p-2">{r.durationDays}</td>
                            <td className="p-2">
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700">
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/* ========= helpers ========= */
function Info({ label, value }) {
  return (
    <div>
      <div className="text-gray-500 text-xs">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function toEnglishDigits(s: string) {
  const arabicIndic = "٠١٢٣٤٥٦٧٨٩";
  const persianIndic = "۰۱۲۳۴۵۶۷۸۹";
  return (s || "")
    .replace(/[٠-٩۰-۹]/g, (d) => {
      const ai = arabicIndic.indexOf(d);
      if (ai > -1) return String(ai);
      const pi = persianIndic.indexOf(d);
      if (pi > -1) return String(pi);
      return d;
    })
    .replace(/[٫٬, ]/g, "");
}

function fmtNow() {
  return new Date().toISOString().replace("T", " ").slice(0, 16);
}

function fmtDate(x: any) {
  try {
    const d = x?.toDate ? x.toDate() : x ? new Date(x) : null;
    if (!d || isNaN(+d)) return "-";
    return d.toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return "-";
  }
}
