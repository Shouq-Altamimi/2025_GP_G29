"use client";
import React, { useMemo, useState } from "react";
import {
  FileText, AlertCircle, CheckCircle2, Search, ClipboardList,
} from "lucide-react";

const MEDICINE_CATALOG = [
  "Panadol","Paracetamol","Amoxicillin","Metformin","Atorvastatin",
  "Omeprazole","Losartan","Insulin","Ibuprofen","Azithromycin","Vitamin D","Cough Syrup",
];

export default function Doctor() {
  const [route] = useState("Search");

  // بحث
  const [q, setQ] = useState("");
  const [searchMsg, setSearchMsg] = useState("");

  // Rx
  const [rxMsg, setRxMsg] = useState("");

  // حالة المريض
  const [searched, setSearched] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [, setRxs] = useState([]);

  const patients = [
    { id: "1000000001", name: "Salem", age: 42, heightCm: 176, weightKg: 82 },
    { id: "1000000002", name: "Maha", age: 34, heightCm: 164, weightKg: 60 },
  ];

  // نموذج الوصفة
  const [medicine, setMedicine] = useState("");
  const [dose, setDose] = useState("");
  const [timesPerDay, setTimesPerDay] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const medSuggestions = useMemo(() => {
    const query = medicine.trim().toLowerCase();
    if (!query) return [];
    return MEDICINE_CATALOG.filter((m) => m.toLowerCase().includes(query)).slice(0, 6);
  }, [medicine]);

  const fmtNow = () => new Date().toISOString().replace("T", " ").slice(0, 16);

  function runSearch() {
    const id = q.trim();
    if (!/^\d{10}$/.test(id)) {
      setSearchMsg("National ID must be 10 digits (numbers only).");
      setSelectedPatient(null);
      setSearched(false);
      return;
    }
    const existing = patients.find((p) => p.id === id);
    const patient = existing ?? { id, name: "", age: "", heightCm: "", weightKg: "" };
    setSelectedPatient(patient);
    setSearched(true);
    setSearchMsg("");
  }

  function createRx() {
    if (!selectedPatient) { setRxMsg("Please search for a patient first."); return; }
    if (!medicine || !dose || !timesPerDay || !durationDays) {
      setRxMsg("Please fill all required fields."); return;
    }
    const newRx = {
      ref: `RX-${Math.floor(Math.random()*100000).toString().padStart(5,"0")}`,
      patientId: selectedPatient.id,
      medicine, dose, timesPerDay, durationDays, reason, notes,
      status: "Created",
      createdAt: fmtNow(),
    };
    setRxs((prev) => [newRx, ...prev]);
    setMedicine(""); setDose(""); setTimesPerDay(""); setDurationDays("");
    setReason(""); setNotes("");
    setRxMsg(`${newRx.ref} successfully created.`);
  }

  return (
    <main className="flex-1 mx-auto w-full max-w-7xl px-6 md:px-8 py-8 md:py-10">
      {route === "Search" && (
        <section className="space-y-6">
          {/* Search */}
          <section className="td-card">
            <h2 className="td-title"><Search size={18} /> Search Patients</h2>
            <div className="flex gap-2">
              <input
                className="td-input"
                placeholder="Enter 10-digit National ID"
                value={q}
                inputMode="numeric" pattern="[0-9]*" maxLength={10}
                onChange={(e) => setQ(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
              <button onClick={runSearch} className="td-btn">
                <span className="inline-flex items-center gap-2">
                  <Search size={18} /> Search
                </span>
              </button>
            </div>
            {!!searchMsg && (
              <div className="mt-3 text-sm flex items-center gap-2 text-rose-600">
                <AlertCircle size={16} /> {searchMsg}
              </div>
            )}
          </section>

          {/* Patient Info + Rx */}
          {searched && selectedPatient && (
            <>
              {/* Patient Info — رجّعناه بطاقات */}
              <section className="td-card">
                <h2 className="td-title"><ClipboardList size={18} /> Patient Info</h2>

                {/* صف 1: 3 بطاقات */}
                <div className="td-info-grid cols-3">
                  <Info label="Name" value={selectedPatient.name || "—"} />
                  <Info label="National ID" value={selectedPatient.id} bold />
                  <Info label="Age" value={selectedPatient.age || "—"} />
                </div>

                {/* صف 2: 2 بطاقات */}
                <div className="mt-3 td-info-grid cols-2">
                  <Info label="Height" value={selectedPatient.heightCm ? `${selectedPatient.heightCm} cm` : "—"} />
                  <Info label="Weight" value={selectedPatient.weightKg ? `${selectedPatient.weightKg} kg` : "—"} />
                </div>

                {/* زر الوصفات السابقة في النهاية */}
                <div className="mt-5 flex justify-end">
                  <button className="td-btn">View Previous Prescriptions</button>
                </div>
              </section>

              {/* Create Prescription */}
              <section className="td-card">
                <h2 className="td-title"><FileText size={18} /> Create Prescription</h2>

                {!!rxMsg && (
                  <div className={`mt-3 text-sm flex items-center gap-2 ${rxMsg.includes("successfully") ? "text-emerald-600" : "text-rose-600"}`}>
                    {rxMsg.includes("successfully") ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}
                    {rxMsg}
                  </div>
                )}

                {/* medicine + suggestions */}
                <div className="relative mb-3">
                  <input
                    className="td-input"
                    placeholder="Search medicine name"
                    value={medicine}
                    onChange={(e) => { setMedicine(e.target.value); setShowSuggestions(true); }}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  />
                  {showSuggestions && medSuggestions.length > 0 && (
                    <div
                      className="absolute z-10 bg-white border rounded-xl shadow w-full max-h-44 overflow-y-auto mt-1"
                      style={{ borderColor: "var(--td-line)" }}
                    >
                      {medSuggestions.map((m) => (
                        <button
                          type="button" key={m}
                          onClick={() => { setMedicine(m); setShowSuggestions(false); }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50"
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* selects */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <Select value={dose} onChange={setDose} placeholder="Dosage"
                          options={["5 mg","10 mg","20 mg","50 mg","100 mg","1 tablet","2 tablets","1 capsule","5 mL","10 mL"]} />
                  <Select value={timesPerDay} onChange={setTimesPerDay} placeholder="Times per Day"
                          options={["Once daily (OD)","Twice daily (BID)","Three times daily (TID)","Four times daily (QID)"]} />
                  <Select value={durationDays} onChange={setDurationDays} placeholder="Duration"
                          options={["3 days","5 days","7 days","10 days","14 days","1 month"]} />
                </div>

                <input className="td-input mb-3" placeholder="Reason for prescription"
                       value={reason} onChange={(e) => setReason(e.target.value)} />
                <textarea className="td-input h-32 mb-4" placeholder="Notes"
                          value={notes} onChange={(e) => setNotes(e.target.value)} />

                <div className="flex items-center justify-start gap-3 mt-1">
                  <button onClick={createRx} className="td-btn">Create Prescription</button>
                </div>
              </section>
            </>
          )}
        </section>
      )}
    </main>
  );
}

/* ---------- Helpers ---------- */

function Info({ label, value, bold = false }) {
  return (
    <div className="td-info-card">
      <div className="td-info-label">{label}</div>
      <div className={`td-info-value ${bold ? "font-semibold" : ""}`}>{value}</div>
    </div>
  );
}

function Select({ value, onChange, placeholder, options }) {
  return (
    <select className="td-input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled hidden>{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
