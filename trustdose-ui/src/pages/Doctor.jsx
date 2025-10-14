//db
// src/pages/Doctor.jsx  (أعلى الملف)
import React, { useMemo, useState } from "react";
import { db } from "../firebase";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import {
  FileText, AlertCircle, CheckCircle2, Search, ClipboardList,
  User, Calendar, Ruler, Weight, Pill, Clock, CalendarDays
} from "lucide-react";


const MEDICINE_CATALOG = [
  "Panadol","Paracetamol","Amoxicillin","Metformin","Atorvastatin",
  "Omeprazole","Losartan","Insulin","Ibuprofen","Azithromycin",
  "Vitamin D","Cough Syrup","Aspirin","Lisinopril","Simvastatin",
  "Levothyroxine","Metoprolol","Amlodipine","Albuterol","Gabapentin"
];

const DOSAGE_OPTIONS = [
  "5 mg","10 mg","20 mg","50 mg","100 mg","250 mg","500 mg",
  "1 tablet","2 tablets","1 capsule","5 mL","10 mL","15 mL"
];
const FREQUENCY_OPTIONS = [
  "Once daily (OD)","Twice daily (BID)","Three times daily (TID)",
  "Four times daily (QID)","Every 6 hours","Every 8 hours",
  "Every 12 hours"
];
const DURATION_OPTIONS = [
  "3 days","5 days","7 days","10 days","14 days","21 days",
  "30 days","1 month","2 months","3 months"
];

// —— لوحة ألوان رمادي-لافندر —— //
const C = {
  primary: "#B08CC1",
  primaryDark: "#9F76B4",
  ink: "#4A2C59",
  pale: "#F6F1FA",
};

export default function Doctor() {
  const [route] = useState("Search");
  const [q, setQ] = useState("");
  const [searchMsg, setSearchMsg] = useState("");
  const [rxMsg, setRxMsg] = useState("");
  const [searched, setSearched] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [prescriptions, setPrescriptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showPreviousPrescriptions, setShowPreviousPrescriptions] = useState(false);

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
    return MEDICINE_CATALOG.filter(m => m.toLowerCase().includes(query)).slice(0, 8);
  }, [medicine]);

  const fmtNow = () => new Date().toLocaleDateString('en-US', {
    year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'
  });
async function runSearch() {
  const id = q.trim();

  // 1) تحقق من الصحة: لازم 10 أرقام
  if (!/^\d{10}$/.test(id)) {
    setSearchMsg("National ID must be exactly 10 digits (numbers only).");
    setSelectedPatient(null);
    setSearched(false);
    return;
  }

  // 2) جلب من الداتابيس
  setIsLoading(true);
  setSearchMsg("");
  try {
    const rec = await fetchPatientByNationalId(id);

    if (rec) {
      const patient = mapPatient(rec, id);
      setSelectedPatient(patient);
      setSearched(true);
    } else {
      // 3) رقم صحيح لكن غير مسجّل
      setSelectedPatient(null); // لا نعرض كروت ولا نموذج
      setSearched(true);        // نُظهر الرسالة فقط
      setSearchMsg("The national ID you entered isn’t registered in our system.");
    }
  } catch (e) {
    console.error(e);
    setSelectedPatient(null);
    setSearched(false);
    setSearchMsg("Error fetching from database. Please try again.");
  } finally {
    setIsLoading(false);
  }
}

  function createRx() {
    if (!selectedPatient) { setRxMsg("Please search for a patient first."); return; }
    if (!medicine || !dose || !timesPerDay || !durationDays) {
      setRxMsg("Please fill all required medication fields."); return;
    }
    const newRx = {
      id:`RX-${Date.now()}`,
      ref:`RX-${Math.floor(Math.random()*100000).toString().padStart(5,"0")}`,
      patientId:selectedPatient.id,
      patientName:selectedPatient.name,
      medicine, dose, timesPerDay, durationDays, reason, notes,
      status:"Active", createdAt:fmtNow(), prescribedBy:"Dr. Ahmed Hassan"
    };
    setPrescriptions((prev) => [newRx, ...prev]);
    setMedicine(""); setDose(""); setTimesPerDay(""); setDurationDays("");
    setReason(""); setNotes("");
    setRxMsg(`Prescription ${newRx.ref} successfully created for ${selectedPatient.name}.`);
    setTimeout(() => setRxMsg(""), 5000);
  }

  function resetSearch() {
    setQ(""); setSelectedPatient(null); setSearched(false); setSearchMsg("");
    setPrescriptions([]); setShowPreviousPrescriptions(false);
  }

  return (
    <main className="flex-1 mx-auto w-full max-w-6xl px-4 md:px-6 py-6 md:py-8">
      {route === "Search" && (
        <section className="space-y-6">
          {/* Search */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Search size={20} style={{ color: C.primary }} />
              <span style={{ color: C.ink }}>Search Patients</span>
            </h2>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <input
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:border-transparent transition-all"
                  style={{ outlineColor: C.primary }}
                  placeholder="Enter 10-digit National ID"
                  value={q}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  onChange={(e) => setQ(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                />
                {q && (
                  <button
                    onClick={resetSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 hover:opacity-80"
                    style={{ color: C.ink }}
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                onClick={runSearch}
                disabled={isLoading}
                className="px-6 py-3 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-medium"
                style={{ backgroundColor: C.primary }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.primaryDark)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = C.primary)}
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Searching...
                  </>
                ) : (
                  <>
                    <Search size={18} /> Search
                  </>
                )}
              </button>
            </div>

            {!!searchMsg && (
              <div
                className={`mt-3 text-sm flex items-center gap-2 ${
                  searchMsg.includes("not found") ? "text-amber-700" : "text-rose-700"
                }`}
              >
                <AlertCircle size={16} /> {searchMsg}
              </div>
            )}
          </section>

          {/* Patient Info + Rx */}
          {searched && selectedPatient && (
            <>
              {/* Patient Info */}
              <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2" style={{ color: C.ink }}>
                    <ClipboardList size={20} style={{ color: C.primary }} />
                    Patient Information
                  </h2>
                  <button
                    onClick={resetSearch}
                    className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                  >
                    ✕ Clear Search
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <InfoCard icon={<User size={18} />} label="Name" value={selectedPatient.name} highlight={selectedPatient.name !== "Not Found"} />
                  <InfoCard icon={<Calendar size={18} />} label="National ID" value={selectedPatient.id} bold />
                  <InfoCard icon={<User size={18} />} label="Age" value={selectedPatient.age ? `${selectedPatient.age} years` : "—"} />
                  <InfoCard icon={<Pill size={18} />} label="Blood Type" value={selectedPatient.bloodType || "—"} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <InfoCard icon={<Ruler size={18} />} label="Height" value={selectedPatient.heightCm ? `${selectedPatient.heightCm} cm` : "—"} />
                  <InfoCard icon={<Weight size={18} />} label="Weight" value={selectedPatient.weightKg ? `${selectedPatient.weightKg} kg` : "—"} />
                </div>

                {selectedPatient.allergies && selectedPatient.allergies.length > 0 && (
                  <div className="mb-4 p-3 rounded-lg border" style={{ background: "#FFF7E6", borderColor: "#F5D7A2" }}>
                    <div className="flex items-center gap-2 font-medium mb-1" style={{ color: "#8A6D3B" }}>
                      <AlertCircle size={16} />
                      Allergies & Sensitivities
                    </div>
                    <div className="text-sm" style={{ color: "#8A6D3B" }}>
                      {selectedPatient.allergies.join(", ")}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-3 justify-between items-center mt-6 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setShowPreviousPrescriptions(!showPreviousPrescriptions)}
                    className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm"
                    style={{ background: "#F3F4F6", color: "#374151" }}
                  >
                    <FileText size={16} />
                    {showPreviousPrescriptions ? "Hide" : "View"} Previous Prescriptions
                    {prescriptions.length > 0 && (
                      <span className="text-xs px-2 py-1 rounded-full" style={{ background: C.pale, color: C.ink }}>
                        {prescriptions.length}
                      </span>
                    )}
                  </button>

                  {selectedPatient.name !== "Not Found" && (
                    <div className="text-sm text-gray-500">
                      Last visit: {new Date().toLocaleDateString()}
                    </div>
                  )}
                </div>
              </section>

              {/* Previous Prescriptions */}
              {showPreviousPrescriptions && prescriptions.length > 0 && (
                <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4" style={{ color: C.ink }}>Previous Prescriptions</h3>
                  <div className="space-y-3">
                    {prescriptions.map((rx) => (
                      <div key={rx.id} className="p-4 border border-gray-200 rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium text-gray-800">{rx.medicine}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              {rx.dose} • {rx.timesPerDay} • {rx.durationDays}
                            </div>
                            {rx.reason && (
                              <div className="text-sm text-gray-600 mt-1">Reason: {rx.reason}</div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-500">{rx.createdAt}</div>
                            <div className="text-xs font-medium mt-1" style={{ color: "#16A34A" }}>{rx.status}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Create Prescription */}
              <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2" style={{ color: C.ink }}>
                  <FileText size={20} style={{ color: C.primary }} />
                  Create New Prescription
                </h2>

                {!!rxMsg && (
                  <div
                    className={`p-3 rounded-lg mb-4 flex items-center gap-2 border`}
                    style={
                      rxMsg.includes("successfully")
                        ? { background: "#EFFAF1", color: "#166534", borderColor: "#BBE5C8" }
                        : { background: "#FEF2F2", color: "#991B1B", borderColor: "#FECACA" }
                    }
                  >
                    {rxMsg.includes("successfully") ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <AlertCircle size={18} />
                    )}
                    {rxMsg}
                  </div>
                )}

                <div className="space-y-4">
                  {/* Medication Search */}
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Medication <span className="text-rose-500">*</span></label>
                    <input
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:border-transparent transition-all"
                      style={{ outlineColor: C.primary }}
                      placeholder="Search medicine name..."
                      value={medicine}
                      onChange={(e) => { setMedicine(e.target.value); setShowSuggestions(true); }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    />
                    {showSuggestions && medSuggestions.length > 0 && (
                      <div
                        className="absolute z-10 bg-white border rounded-xl shadow-lg w-full max-h-60 overflow-y-auto mt-1"
                        style={{ borderColor: "#D1D5DB" }}
                      >
                        {medSuggestions.map((m) => (
                          <button
                            type="button"
                            key={m}
                            onClick={() => { setMedicine(m); setShowSuggestions(false); }}
                            className="w-full text-left px-4 py-3 border-b last:border-b-0 transition-colors"
                            style={{ borderColor: "#F3F4F6" }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.pale)}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                          >
                            <div className="font-medium text-gray-800">{m}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Medication Details */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <SelectField icon={<Pill size={16} />} label="Dosage" value={dose} onChange={setDose} placeholder="Select dosage" options={DOSAGE_OPTIONS} required />
                    <SelectField icon={<Clock size={16} />} label="Frequency" value={timesPerDay} onChange={setTimesPerDay} placeholder="Select frequency" options={FREQUENCY_OPTIONS} required />
                    <SelectField icon={<CalendarDays size={16} />} label="Duration" value={durationDays} onChange={setDurationDays} placeholder="Select duration" options={DURATION_OPTIONS} required />
                  </div>

                  {/* Reason & Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Prescription</label>
                    <input
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:border-transparent transition-all"
                      style={{ outlineColor: C.primary }}
                      placeholder="e.g., Hypertension, Diabetes, Infection..."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
                    <textarea
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:border-transparent transition-all h-32 resize-none"
                      style={{ outlineColor: C.primary }}
                      placeholder="Special instructions, precautions, or additional information..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-start gap-3 pt-2">
                    <button
                      onClick={createRx}
                      className="px-6 py-3 text-white rounded-xl transition-colors flex items-center gap-2 font-medium shadow-sm"
                      style={{ backgroundColor: C.primary }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.primaryDark)}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = C.primary)}
                    >
                      <FileText size={18} />
                      Create Prescription
                    </button>
                    <button
                      onClick={() => { setMedicine(""); setDose(""); setTimesPerDay(""); setDurationDays(""); setReason(""); setNotes(""); setRxMsg(""); }}
                      className="px-6 py-3 rounded-xl font-medium"
                      style={{ background: "#F3F4F6", color: "#374151" }}
                    >
                      Clear Form
                    </button>
                  </div>
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
function toAge(birthDate) {
  try {
    const d = birthDate?.toDate ? birthDate.toDate() : new Date(birthDate);
    if (isNaN(d)) return "";
    const diff = Date.now() - d.getTime();
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  } catch { return ""; }
}

async function fetchPatientByNationalId(id) {
  // 1) جرّب doc بالمعرّف: patients/Ph_<ID>
  const directRef = doc(db, "patients", `Ph_${id}`);
  const snap = await getDoc(directRef);
  if (snap.exists()) {
    const data = snap.data();
    return { docId: snap.id, ...data };
  }

  // 2) لو ما لقيته، جرّب query على nationalId | nationalID
  const col = collection(db, "patients");
  const q1 = query(col, where("nationalId", "==", id));
  const q2 = query(col, where("nationalID", "==", id));

  const [r1, r2] = await Promise.all([getDocs(q1), getDocs(q2)]);
  const hit = !r1.empty ? r1.docs[0] : (!r2.empty ? r2.docs[0] : null);
  return hit ? { docId: hit.id, ...hit.data() } : null;
}

function mapPatient(dbRec, id) {
  if (!dbRec) return null;
  const national = dbRec.nationalId || dbRec.nationalID || id;
  return {
    id: national?.toString() || id,
    name: dbRec.name || "—",
    age: toAge(dbRec.birthDate),
    heightCm: dbRec.heightCm || "",
    weightKg: dbRec.weightKg || "",
    bloodType: dbRec.bloodType || "",
    allergies: Array.isArray(dbRec.allergies) ? dbRec.allergies : [],
  };
}


function InfoCard({ icon, label, value, bold = false, highlight = false }) {
  return (
    <div
      className="p-4 border rounded-xl"
      style={{
        background: highlight ? C.pale : "#F9FAFB",
        borderColor: highlight ? "#E9DFF1" : "#E5E7EB",
      }}
    >
      <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
        {icon}
        {label}
      </div>
      <div
        className={`text-gray-800 ${bold ? "font-semibold" : ""}`}
        style={highlight ? { color: C.ink, fontWeight: 600 } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function SelectField({ icon, label, value, onChange, placeholder, options, required = false }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <div className="relative">
        <select
          className="w-full pl-10 pr-8 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:border-transparent transition-all appearance-none bg-white"
          style={{ outlineColor: C.primary }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled hidden>{placeholder}</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        {/* caret */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">▼</div>
        {/* left icon */}
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
