import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  FileText,
  AlertCircle,
  CheckCircle2,
  Search,
  ClipboardList,
  Pill,
  Clock,
  CalendarDays,
} from "lucide-react";

/* ====== اقتراحات الواجهة ====== */
const MEDICINE_CATALOG = [
  "Panadol",
  "Paracetamol",
  "Amoxicillin",
  "Metformin",
  "Atorvastatin",
  "Omeprazole",
  "Losartan",
  "Insulin",
  "Ibuprofen",
  "Azithromycin",
  "Vitamin D",
  "Cough Syrup",
  "Aspirin",
  "Lisinopril",
  "Simvastatin",
  "Levothyroxine",
  "Metoprolol",
  "Amlodipine",
  "Albuterol",
  "Gabapentin",
];

/* ====== قاموس التطبيع (synonyms) ====== */
const MEDICINE_DICT = {
  panadol: "Paracetamol",
  paracetamol: "Paracetamol",
  tylenol: "Paracetamol",

  ibu: "Ibuprofen",
  ibuprofen: "Ibuprofen",

  amox: "Amoxicillin",
  amoxicillin: "Amoxicillin",

  insulin: "Insulin",
  metformin: "Metformin",
  atorvastatin: "Atorvastatin",
  omeprazole: "Omeprazole",
  losartan: "Losartan",
  azithromycin: "Azithromycin",
  "vitamin d": "Vitamin D",
  aspirin: "Aspirin",
  lisinopril: "Lisinopril",
  simvastatin: "Simvastatin",
  levothyroxine: "Levothyroxine",
  metoprolol: "Metoprolol",
  amlodipine: "Amlodipine",
  albuterol: "Albuterol",
  gabapentin: "Gabapentin",
};

// ترجيع الاسم المعياري (مع قبول نص حرّ)
function normalizeMedicineName(input) {
  if (!input) return "";
  const key = input.trim().toLowerCase();
  return MEDICINE_DICT[key] || capitalizeWords(input.trim());
}

function capitalizeWords(s) {
  return s
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

const DOSAGE_OPTIONS = [
  "5 mg",
  "10 mg",
  "20 mg",
  "50 mg",
  "100 mg",
  "250 mg",
  "500 mg",
  "1 tablet",
  "2 tablets",
  "1 capsule",
  "5 mL",
  "10 mL",
  "15 mL",
];
const FREQUENCY_OPTIONS = [
  "Once daily (OD)",
  "Twice daily (BID)",
  "Three times daily (TID)",
  "Four times daily (QID)",
  "Every 6 hours",
  "Every 8 hours",
  "Every 12 hours",
];
const DURATION_OPTIONS = [
  "3 days",
  "5 days",
  "7 days",
  "10 days",
  "14 days",
  "21 days",
  "30 days",
  "1 month",
  "2 months",
  "3 months",
];

const C = {
  primary: "#B08CC1",
  primaryDark: "#9F76B4",
  ink: "#4A2C59",
  pale: "#F6F1FA",
};

/* ===== Field names (تجنّب الأخطاء الكتابية) ===== */
const F = Object.freeze({
  createdAt: "createdAt",
  doctorId: "doctorId",
  dosage: "dosage",
  durationDays: "durationDays",
  frequency: "frequency",
  medicineName: "medicineName",
  notes: "notes",
  onchainTx: "onchainTx",
  patientDocId: "patientDocId",
  patientDisplayId: "patientDisplayId", // مثال: آخر 4 أرقام فقط
  patientNationalIdHash: "patientNationalIdHash", // اختياري: خصوصية
  reason: "reason",
  status: "status",
});

/* ===== SHA-256 (لهاش الـ National ID) ===== */
async function sha256Hex(input) {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function Doctor() {
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [searchMsg, setSearchMsg] = useState("");
  const [rxMsg, setRxMsg] = useState("");
  const [searched, setSearched] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [prescriptions, setPrescriptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // حقّ فورم الوصفة
  const [medicine, setMedicine] = useState("");
  const [dose, setDose] = useState("");
  const [timesPerDay, setTimesPerDay] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  // استرجاع آخر مريض (لو رجعتِ من صفحة الوصفات)
  useEffect(() => {
    const cached = sessionStorage.getItem("td_patient");
    if (cached) {
      const p = JSON.parse(cached);
      setSelectedPatient(p);
      setSearched(true);
      setQ(p.id || "");
    }
  }, []);

  const fmtNow = () =>
    new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  async function runSearch() {
    const id = q.trim();

    if (!/^\d{10}$/.test(id)) {
      setSearchMsg("National ID must be exactly 10 digits (numbers only).");
      setSelectedPatient(null);
      setSearched(false);
      return;
    }

    setIsLoading(true);
    setSearchMsg("");
    try {
      const rec = await fetchPatientByNationalId(id);
      if (rec) {
        const patient = mapPatient(rec, id);
        setSelectedPatient(patient);
        setSearched(true);
        sessionStorage.setItem("td_patient", JSON.stringify(patient)); // ✅ خزّناه
      } else {
        setSelectedPatient(null);
        setSearched(true);
        setSearchMsg("The national ID you entered isn’t registered in our system.");
        sessionStorage.removeItem("td_patient");
      }
    } catch (e) {
      console.error(e);
      setSelectedPatient(null);
      setSearched(false);
      setSearchMsg("Error fetching from database. Please try again.");
      sessionStorage.removeItem("td_patient");
    } finally {
      setIsLoading(false);
    }
  }

  /* ===== إنشاء وصفة: يحفظ في فايرستور مع serverTimestamp + Hash ===== */
  async function createRx() {
    if (!selectedPatient) {
      setRxMsg("Please search for a patient first.");
      return;
    }
    if (!medicine || !dose || !timesPerDay || !durationDays) {
      setRxMsg("Please fill all required medication fields.");
      return;
    }

    // الاسم المعياري من القاموس
    const canonicalMedicine = normalizeMedicineName(medicine);

    // هاش للـ National ID (بدون كشفه)
    const natId = selectedPatient.id?.toString() || "";
    const natIdHash = natId ? await sha256Hex(natId) : "";

    // قد تجلبي العنوان من MetaMask لاحقًا
    const doctorAddress = null; // TODO: استبدليها بعنوان الطبيب عند الربط

    // إنشاء نسخة محلية للعرض والتنقّل
    const localRx = {
      id: `RX-${Date.now()}`,
      ref: `RX-${Math.floor(Math.random() * 100000)
        .toString()
        .padStart(5, "0")}`,
      patientId: selectedPatient.id,
      patientName: selectedPatient.name,
      medicine: canonicalMedicine,
      dose,
      timesPerDay,
      durationDays,
      reason,
      notes,
      status: "Active",
      createdAt: fmtNow(),
      prescribedBy: "Dr. Ahmed Hassan",
    };

    // حفظ فعلي في Firestore
    try {
      await addDoc(collection(db, "prescriptions"), {
        [F.createdAt]: serverTimestamp(), // ✅ من السيرفر
        [F.doctorId]: doctorAddress,
        [F.medicineName]: canonicalMedicine,
        [F.dosage]: dose,
        [F.frequency]: timesPerDay,
        [F.durationDays]: durationDays,
        [F.reason]: reason || "",
        [F.notes]: notes || "",
        [F.status]: "Draft", // تبدأ Draft ثم تتحدث بعد التأكيد على السلسلة
        [F.onchainTx]: null,
        [F.patientDocId]: selectedPatient.docId, // مرجع آمن
        [F.patientDisplayId]: natId ? natId.slice(-4) : "",
        [F.patientNationalIdHash]: natIdHash, // ✅ خصوصية
      });
    } catch (e) {
      console.error("Firestore add error:", e);
      setRxMsg("Error saving to database. Please try again.");
      setTimeout(() => setRxMsg(""), 4000);
      return;
    }

    // نجاح واجهة
    setPrescriptions((prev) => [localRx, ...prev]);
    setMedicine("");
    setDose("");
    setTimesPerDay("");
    setDurationDays("");
    setReason("");
    setNotes("");
    setRxMsg(
      `Prescription ${localRx.ref} successfully created for ${selectedPatient.name}.`
    );
    setTimeout(() => setRxMsg(""), 4000);

    navigate("/prescriptions", {
      state: {
        patientId: selectedPatient.id,
        patientName: selectedPatient.name,
        localList: [localRx],
      },
    });
  }

  function goToPrescriptions() {
    if (!selectedPatient) return;
    navigate("/prescriptions", {
      state: { patientId: selectedPatient.id, patientName: selectedPatient.name },
    });
  }

  function resetSearch() {
    setQ("");
    setSelectedPatient(null);
    setSearched(false);
    setSearchMsg("");
    setPrescriptions([]);
    sessionStorage.removeItem("td_patient");
  }

  return (
    <main className="flex-1 mx-auto w-full max-w-6xl px-4 md:px-6 py-6 md:py-8">
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
                onChange={(e) =>
                  setQ(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))
                }
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
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = C.primaryDark)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = C.primary)
              }
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
                searchMsg.includes("not found")
                  ? "text-amber-700"
                  : "text-rose-700"
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
                <h2
                  className="text-xl font-semibold text-gray-800 flex items-center gap-2"
                  style={{ color: C.ink }}
                >
                  <ClipboardList size={20} style={{ color: C.primary }} />
                  Patient Information
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={goToPrescriptions}
                    className="px-4 py-2 rounded-lg text-sm text-white"
                    style={{ background: C.primary }}
                  >
                    View Previous Prescriptions
                  </button>
                  <button
                    onClick={resetSearch}
                    className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                  >
                    ✕ Clear Search
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <InfoCard
                  label="Name"
                  value={selectedPatient.name}
                  highlight={selectedPatient.name !== "Not Found"}
                />
                <InfoCard label="National ID" value={selectedPatient.id} bold />
                <InfoCard
                  label="Age"
                  value={
                    selectedPatient.age ? `${selectedPatient.age} years` : "—"
                  }
                />
                <InfoCard
                  label="Blood Type"
                  value={selectedPatient.bloodType || "—"}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <InfoCard
                  label="Height"
                  value={
                    selectedPatient.heightCm
                      ? `${selectedPatient.heightCm} cm`
                      : "—"
                  }
                />
                <InfoCard
                  label="Weight"
                  value={
                    selectedPatient.weightKg
                      ? `${selectedPatient.weightKg} kg`
                      : "—"
                  }
                />
              </div>
            </section>

            {/* Create Prescription */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2
                className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2"
                style={{ color: C.ink }}
              >
                <FileText size={20} style={{ color: C.primary }} />
                Create New Prescription
              </h2>

              {!!rxMsg && (
                <div
                  className={`p-3 rounded-lg mb-4 flex items-center gap-2 border`}
                  style={
                    rxMsg.includes("successfully")
                      ? {
                          background: "#EFFAF1",
                          color: "#166534",
                          borderColor: "#BBE5C8",
                        }
                      : {
                          background: "#FEF2F2",
                          color: "#991B1B",
                          borderColor: "#FECACA",
                        }
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

              {/* 🔎 بحث الدواء مع اقتراحات */}
              <div className="mb-4">
                <MedicineSearch
                  value={medicine}
                  onChange={setMedicine}
                  catalog={MEDICINE_CATALOG}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SelectField
                  icon={<Pill size={16} />}
                  label="Dosage"
                  value={dose}
                  onChange={setDose}
                  placeholder="Select dosage"
                  options={DOSAGE_OPTIONS}
                  required
                />
                <SelectField
                  icon={<Clock size={16} />}
                  label="Frequency"
                  value={timesPerDay}
                  onChange={setTimesPerDay}
                  placeholder="Select frequency"
                  options={FREQUENCY_OPTIONS}
                  required
                />
                <SelectField
                  icon={<CalendarDays size={16} />}
                  label="Duration"
                  value={durationDays}
                  onChange={setDurationDays}
                  placeholder="Select duration"
                  options={DURATION_OPTIONS}
                  required
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for Prescription
                </label>
                <input
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:border-transparent transition-all"
                  style={{ outlineColor: C.primary }}
                  placeholder="e.g., Hypertension, Diabetes, Infection..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Notes
                </label>
                <textarea
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:border-transparent transition-all h-32 resize-none"
                  style={{ outlineColor: C.primary }}
                  placeholder="Special instructions, precautions, or additional information..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-start gap-3 pt-4">
                <button
                  onClick={createRx}
                  className="px-6 py-3 text-white rounded-xl transition-colors flex items-center gap-2 font-medium shadow-sm"
                  style={{ backgroundColor: C.primary }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = C.primaryDark)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = C.primary)
                  }
                >
                  <FileText size={18} />
                  Create Prescription
                </button>
                <button
                  onClick={() => {
                    setDose("");
                    setTimesPerDay("");
                    setDurationDays("");
                    setReason("");
                    setNotes("");
                    setRxMsg("");
                  }}
                  className="px-6 py-3 rounded-xl font-medium"
                  style={{ background: "#F3F4F6", color: "#374151" }}
                >
                  Clear Form
                </button>
              </div>
            </section>
          </>
        )}
      </section>
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
  } catch {
    return "";
  }
}

async function fetchPatientByNationalId(id) {
  const directRef = doc(db, "patients", `Ph_${id}`);
  const snap = await getDoc(directRef);
  if (snap.exists()) return { docId: snap.id, ...snap.data() };

  const colRef = collection(db, "patients");
  const q1 = query(colRef, where("nationalId", "==", id));
  const q2 = query(colRef, where("nationalID", "==", id));
  const [r1, r2] = await Promise.all([getDocs(q1), getDocs(q2)]);
  const hit = !r1.empty ? r1.docs[0] : !r2.empty ? r2.docs[0] : null;
  return hit ? { docId: hit.id, ...hit.data() } : null;
}

function mapPatient(dbRec, id) {
  if (!dbRec) return null;
  const national = dbRec.nationalId || dbRec.nationalID || id;
  return {
    docId: dbRec.docId, // ✅ مهم للحفظ في prescriptions
    id: national?.toString() || id,
    name: dbRec.name || "—",
    age: toAge(dbRec.birthDate),
    heightCm: dbRec.heightCm || "",
    weightKg: dbRec.weightKg || "",
    bloodType: dbRec.bloodType || "",
    allergies: Array.isArray(dbRec.allergies) ? dbRec.allergies : [],
  };
}

function InfoCard({ icon = null, label, value, bold = false, highlight = false }) {
  return (
    <div
      className="p-4 border rounded-xl"
      style={{
        background: highlight ? C.pale : "#F9FAFB",
        borderColor: highlight ? "#E9DFF1" : "#E5E7EB",
      }}
    >
      <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
        {icon && <span className="text-gray-400">{icon}</span>}
        <span>{label}</span>
      </div>
      <div
        className={`text-gray-800 ${bold ? "font-semibold" : ""}`}
        style={highlight ? { color: C.ink, fontWeight: 600 } : undefined}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

function SelectField({
  icon,
  label,
  value,
  onChange,
  placeholder,
  options,
  required = false,
}) {
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
          <option value="" disabled hidden>
            {placeholder}
          </option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          ▼
        </div>
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

function MedicineSearch({ value, onChange, catalog }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);

  const suggestions = useMemo(() => {
    if (!value) return catalog.slice(0, 8);
    const v = value.toLowerCase();
    // ترتيب بسيط: يبدأ بـ… ثم يحتوي …
    const starts = catalog.filter((n) => n.toLowerCase().startsWith(v));
    const contains = catalog.filter(
      (n) => !n.toLowerCase().startsWith(v) && n.toLowerCase().includes(v)
    );
    return [...starts, ...contains].slice(0, 8);
  }, [value, catalog]);

  function apply(val) {
    onChange(val);
    setOpen(false);
    setCursor(-1);
  }

  function onKeyDown(e) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (cursor >= 0 && suggestions[cursor]) apply(suggestions[cursor]);
      else setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Search Medicine
      </label>
      <input
        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:border-transparent transition-all"
        style={{ outlineColor: C.primary }}
        placeholder="Type medicine name…"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <li
              key={s}
              onMouseDown={(e) => {
                e.preventDefault();
                apply(s);
              }}
              className={`px-4 py-2 text-sm cursor-pointer hover:bg-gray-50 ${
                i === cursor ? "bg-gray-100" : ""
              }`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-gray-500">
      </p>
    </div>
  );
}
