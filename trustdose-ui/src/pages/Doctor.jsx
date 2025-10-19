// src/pages/Doctor.jsx
// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
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
import { ethers } from "ethers";
import { FileText, AlertCircle, CheckCircle2, Search, ClipboardList } from "lucide-react";
import PRESCRIPTION from "../contracts/Prescription.json";

// ===== عقد البرسكربشن =====
const CONTRACT_ADDRESS = "0x30cb3cDcf8dF0b552E2e258FbbbCFbAe107b110d";

/* UI */
const C = { primary: "#B08CC1", primaryDark: "#9F76B4", ink: "#4A2C59", pale: "#F6F1FA" };

/* حدود الإدخال */
const LIMITS = Object.freeze({
  medicalCondition: { min: 3, max: 120 },
  notes: { min: 0, max: 300 },
});

/* خيارات الجرعات حسب الشكل الصيدلاني */
const DOSAGE_BY_FORM = {
  tablet: ["1 tablet", "2 tablets", "½ tablet", "¼ tablet"],
  capsule: ["1 capsule", "2 capsules"],
  inhaler: ["1 puff", "2 puffs"],
  suspension: ["2.5 mL", "5 mL", "10 mL", "15 mL"],
  drops: ["1 drop", "2 drops", "3 drops"],
  injection: ["0.3 mL", "0.5 mL", "1 vial", "2 vials"],
  cream: ["Apply thin layer"],
  ointment: ["Apply thin layer"],
};
const OTHER_VALUE = "__OTHER__";
function getDoseOptions(form) { return form ? DOSAGE_BY_FORM[form] || [] : []; }

/* أسماء الحقول في Firestore */
const F = Object.freeze({
  createdAt: "createdAt",
  doctorId: "doctorId",
  doctorName: "doctorName",
  doctorPhone: "doctorPhone",
  dosage: "dosage",
  durationDays: "durationDays",
  frequency: "frequency",
  medicineName: "medicineName",
  medicineLabel: "medicineLabel",
  dosageForm: "dosageForm",
  sensitivity: "sensitivity",
  notes: "notes",
  onchainTx: "onchainTx",
  patientDisplayId: "patientDisplayId",
  patientNationalIdHash: "patientNationalIdHash",
  medicalCondition: "medicalCondition",
});

/* أدوات مساعدة */
async function sha256Hex(input) {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// نطلب MetaMask فقط وقت التأكيد
async function getSignerEnsured() {
  if (!window.ethereum) throw new Error("MetaMask not detected. Please install/enable it.");
  await window.ethereum.request({ method: "eth_requestAccounts" }); // connect only here
  const provider = new ethers.BrowserProvider(window.ethereum);
  return provider.getSigner();
}

function generatePrescriptionId(prefix = "RX-", len = 8) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = prefix;
  for (let i = 0; i < len; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

/* ======================= الصفحة ======================= */
export default function Doctor() {
  const navigate = useNavigate();

  // Doctor (من DoctorID فقط)
  const [doctor, setDoctor] = useState(null);
  const [doctorLoadErr, setDoctorLoadErr] = useState("");

  // Patient search
  const [q, setQ] = useState("");
  const [searchMsg, setSearchMsg] = useState("");
  const [searched, setSearched] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // medicines
  const [medList, setMedList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // form fields
  const [selectedMed, setSelectedMed] = useState(null);
  const [dose, setDose] = useState("");
  const [timesPerDay, setTimesPerDay] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [medicalCondition, setMedicalCondition] = useState("");
  const [notes, setNotes] = useState("");

  // ui messages
  const [rxMsg, setRxMsg] = useState("");

  // UX
  const mcRef = useRef(null);
  const [mcTouched, setMcTouched] = useState(false);

  /* 1) جلب بيانات الدكتور بـ DoctorID فقط من السيشن */
  useEffect(() => {
    (async () => {
      try {
        let session = null;
        try {
          const cached = sessionStorage.getItem("td_doctor"); // يُحفظ بعد تسجيل الدخول
          if (cached) session = JSON.parse(cached);
        } catch {}

        const doctorIdFromSession = session?.DoctorID || session?.doctorId;
        if (!doctorIdFromSession) {
          setDoctorLoadErr("No DoctorID in session.");
          return;
        }

        // ابحث حيث الحقل DoctorID == القيمة
        const col = collection(db, "doctors");
        const q1 = query(col, where("DoctorID", "==", doctorIdFromSession));
        const s1 = await getDocs(q1);
        if (!s1.empty) {
          setDoctor({ id: s1.docs[0].id, ...s1.docs[0].data() });
          return;
        }

        // احتياط: لو اسم الوثيقة هو DoctorID
        const snapByDocId = await getDoc(doc(db, "doctors", doctorIdFromSession));
        if (snapByDocId.exists()) {
          setDoctor({ id: snapByDocId.id, ...snapByDocId.data() });
          return;
        }

        setDoctorLoadErr("Doctor record not found.");
      } catch (e) {
        console.error("Load doctor failed:", e);
        setDoctorLoadErr("Failed to load doctor.");
      }
    })();
  }, []);

  /* 2) استعادة المريض من السيشن إن وجد */
  useEffect(() => {
    const cached = sessionStorage.getItem("td_patient");
    if (cached) {
      const p = JSON.parse(cached);
      setSelectedPatient(p);
      setSearched(true);
      setQ(p.id || "");
    }
  }, []);

  /* 3) تحميل الأدوية */
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "medicines"));
      setMedList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    })();
  }, []);

  function clearSearch() {
    setQ("");
    setSelectedPatient(null);
    setSearched(false);
    setSearchMsg("");
    sessionStorage.removeItem("td_patient");
  }

  /* 4) البحث عن المريض */
  async function runSearch() {
    const id = q.trim();
    if (!/^[12]\d{9}$/.test(id)) {
      setSearchMsg("National ID must be 10 digits and start with 1 or 2.");
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
        sessionStorage.setItem("td_patient", JSON.stringify(patient));
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

  /* 5) تأكيد وإنشاء الوصفة — البلوك تشين أولاً، ثم Firestore */
  async function confirmAndSave() {
    if (!selectedPatient) return setRxMsg("Please search for a patient first.");
    if (!selectedMed) return setRxMsg("Please choose a medicine from the list.");

    // حلّ "Other..."
    const finalDose = dose === OTHER_VALUE ? "" : dose;
    const finalFreq = timesPerDay === OTHER_VALUE ? "" : timesPerDay;
    const finalDuration = durationDays === OTHER_VALUE ? "" : durationDays;

    if (!finalDose) return setRxMsg("Please enter/select a dosage.");
    if (!finalFreq) return setRxMsg("Please enter/select a frequency.");
    if (!finalDuration) return setRxMsg("Please enter/select a duration.");

    const mc = medicalCondition.trim();
    if (mc.length < LIMITS.medicalCondition.min) {
      setMcTouched(true);
      setRxMsg(`Medical Condition must be at least ${LIMITS.medicalCondition.min} characters.`);
      mcRef.current?.focus();
      return;
    }
    if (mc.length > LIMITS.medicalCondition.max) {
      setMcTouched(true);
      setRxMsg(`Medical Condition must be at most ${LIMITS.medicalCondition.max} characters.`);
      mcRef.current?.focus();
      return;
    }
    if (notes.length > LIMITS.notes.max) {
      setRxMsg(`Notes must be at most ${LIMITS.notes.max} characters.`);
      return;
    }

    try {
      setIsLoading(true);
      setRxMsg("");

      // 5.1 — تجهيز patient hash
      const natId = selectedPatient.id?.toString() || "";
      const natIdHashHex = natId ? await sha256Hex(natId) : "";
      const patientHashBytes32 = natIdHashHex ? "0x" + natIdHashHex : "0x" + "0".repeat(64);

      // 5.2 — إرسال المعاملة (MetaMask هنا فقط)
      const signer = await getSignerEnsured();
      const doctorAddress = await signer.getAddress();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, PRESCRIPTION.abi, signer);

      const medForChain = (selectedMed.label || "").trim();

      const tx = await contract.createPrescription(
        patientHashBytes32,
        medForChain,
        finalDose,
        finalFreq,
        finalDuration
      );

      const receipt = await tx.wait();
      if (receipt?.status !== 1) {
        throw new Error("Transaction reverted or failed.");
      }

      const txHash = receipt?.hash || receipt?.transactionHash || tx.hash;

      // 5.4 — استخراج onchainId من الحدث (إن وجد)
      let onchainId = null;
      try {
        const iface = new ethers.Interface(PRESCRIPTION.abi);
        for (const log of receipt.logs || []) {
          try {
            const parsed = iface.parseLog(log);
            if (parsed?.name === "PrescriptionCreated") {
              onchainId = Number(parsed.args?.id ?? parsed.args?.[0]);
              break;
            }
          } catch {}
        }
      } catch {}

      // 5.5 — حفظ في Firestore (بعد النجاح فقط) — لا يوجد expiresAt
      const payload = {
        [F.createdAt]: serverTimestamp(),
        [F.doctorId]: doctorAddress,
        [F.doctorName]: doctor?.name || "",
        [F.doctorPhone]: doctor?.phone || "",
        [F.medicineLabel]: selectedMed.label,
        [F.medicineName]: selectedMed.name,
        [F.dosageForm]: selectedMed.dosageForm || "",
        [F.dosage]: finalDose,
        [F.frequency]: finalFreq,
        [F.durationDays]: finalDuration,
        [F.medicalCondition]: mc,
        [F.notes]: notes || "",
        [F.onchainTx]: txHash,
        [F.patientDisplayId]: natId ? natId.slice(-4) : "",
        [F.patientNationalIdHash]: "0x" + natIdHashHex,

        // إضافات للعرض
        nationalID: natId,
        patientName: selectedPatient.name,
        onchainId: onchainId ?? null,
        reason: mc,
        prescriptionID: generatePrescriptionId(),
        dispensed: false,
      };
      if (selectedMed?.sensitivity) payload[F.sensitivity] = selectedMed.sensitivity;

      await addDoc(collection(db, "prescriptions"), payload);

      // reset + توجيه
      setSelectedMed(null);
      setDose("");
      setTimesPerDay("");
      setDurationDays("");
      setMedicalCondition("");
      setNotes("");
      setRxMsg("Prescription created & confirmed on-chain ✓");
      setTimeout(() => setRxMsg(""), 3000);

      navigate("/prescriptions", {
        state: { patientId: selectedPatient.id, patientName: selectedPatient.name },
      });
    } catch (e) {
      console.error("createPrescription failed:", e);
      setRxMsg(e?.info?.error?.message || e?.shortMessage || e?.message || "Blockchain confirmation failed.");
      setTimeout(() => setRxMsg(""), 6000);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex-1 mx-auto w-full max-w-6xl px-4 md:px-6 py-6 md:py-8">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/Images/TrustDose-pill.png" alt="TrustDose Capsule" style={{ width: 56, height: "auto" }} />
          <div>
            <div className="font-extrabold text-lg" style={{ color: "#334155" }}>
              {doctor?.name ? `Welcome, Dr. ${doctor.name}` : "Welcome, Doctor"}
            </div>
            {/* (لا يوجد سطر تحت الاسم) */}
          </div>
        </div>
        {doctorLoadErr && <div className="text-sm text-rose-700">{doctorLoadErr}</div>}
      </div>

      <section className="space-y-6">
        {/* Search patient */}
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
                onChange={(e) => {
                  let v = e.target.value.replace(/[^0-9]/g, "");
                  if (v.length > 0 && !/^[12]/.test(v)) v = "";
                  v = v.slice(0, 10);
                  setQ(v);
                }}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
              {q && (
                <button
                  onClick={() => { setQ(""); setSearched(false); setSelectedPatient(null); }}
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
              className="px-6 py-3 text-white rounded-xl disabled:opacity-50 transition-colors flex items-center gap-2 font-medium"
              style={{ backgroundColor: C.primary }}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Searching...
                </>
              ) : (<><Search size={18} /> Search</>)}
            </button>
          </div>

          {(q || selectedPatient) && (
            <div className="flex justify-end mt-2">
              <button
                onClick={clearSearch}
                className="px-6 py-3 rounded-xl font-medium"
                style={{ background: "#F3F4F6", color: "#374151" }}
              >
                Clear Search
              </button>
            </div>
          )}

          {!!searchMsg && (
            <div className="mt-3 text-sm flex items-center gap-2 text-rose-700">
              <AlertCircle size={16} /> {searchMsg}
            </div>
          )}
        </section>

        {/* Patient + form */}
        {searched && selectedPatient && (
          <>
            {/* Patient info */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 relative">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2" style={{ color: C.ink }}>
                <ClipboardList size={20} style={{ color: C.primary }} />
                Patient Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                <InfoCard label="Name" value={selectedPatient.name} highlight />
                <InfoCard label="National ID" value={selectedPatient.id} bold />
                <InfoCard label="Age" value={`${selectedPatient.age || "—"} years`} />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => navigate("/prescriptions", {
                    state: { patientId: selectedPatient.id, patientName: selectedPatient.name },
                  })}
                  className="px-6 py-3 text-white rounded-xl transition-colors flex items-center gap-2 font-medium shadow-sm"
                  style={{ backgroundColor: C.primary }}
                >
                  <FileText size={18} />
                  View Past Prescriptions
                </button>
              </div>
            </section>

            {/* Create Rx */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2" style={{ color: C.ink }}>
                <FileText size={20} style={{ color: C.primary }} />
                Create New Prescription
              </h2>

              {!!rxMsg && (
                <div
                  className="p-3 rounded-lg mb-4 flex items-center gap-2 border"
                  style={
                    rxMsg.includes("✓")
                      ? { background: "#EFFAF1", color: "#166534", borderColor: "#BBE5C8" }
                      : { background: "#FEF2F2", color: "#991B1B", borderColor: "#FECACA" }
                  }
                >
                  {rxMsg.includes("✓") ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                  {rxMsg}
                </div>
              )}

              {/* medicine search */}
              <div className="mb-4">
                <MedicineSearch
                  value={selectedMed?.label || ""}
                  data={medList}
                  placeholder="Type medicine name"
                  onSelect={(m) => {
                    setSelectedMed(m);
                    const opts = getDoseOptions(m.dosageForm);
                    setDose((d) => (opts.includes(d) ? d : ""));
                    setTimesPerDay("");
                    setDurationDays("");
                  }}
                />

                {selectedMed?.sensitivity && (
                  <div className="mt-2">
                    <span
                      className="inline-flex items-center rounded-lg px-3 py-1 text-sm font-medium border"
                      style={{
                        background: selectedMed.sensitivity === "Sensitive" ? "#FEF2F2" : "#F1F8F5",
                        color: selectedMed.sensitivity === "Sensitive" ? "#991B1B" : "#166534",
                        borderColor: selectedMed.sensitivity === "Sensitive" ? "#FECACA" : "#BBE5C8",
                      }}
                    >
                      Sensitivity: {selectedMed.sensitivity}
                    </span>
                  </div>
                )}
              </div>

              {!selectedMed ? (
                <div className="mt-2 text-sm text-gray-500">Select a medicine first to show fields.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <DosageSelect
                    value={dose}
                    onChange={setDose}
                    options={getDoseOptions(selectedMed?.dosageForm)}
                    placeholder="Select dosage"
                    allowOther
                  />

                  <SelectField
                    label="Frequency"
                    value={timesPerDay}
                    onChange={setTimesPerDay}
                    placeholder="Select frequency"
                    options={[
                      "Once daily (OD)",
                      "Every 6 hours",
                      "Every 8 hours",
                      "Every 12 hours",
                    ]}
                    required
                    allowOther
                  />

                  <SelectField
                    label="Duration"
                    value={durationDays}
                    onChange={setDurationDays}
                    placeholder="Select duration"
                    options={[
                      "3 days","5 days","7 days","10 days","14 days","21 days","30 days",
                      "1 month","2 months","3 months",
                    ]}
                    required
                    allowOther
                  />
                </div>
              )}

              {/* Medical condition */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Medical Condition <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={mcRef}
                  className={`w-full px-4 py-3 border rounded-xl focus:ring-2 transition-all ${
                    mcTouched && medicalCondition.trim().length < LIMITS.medicalCondition.min
                      ? "border-rose-400 focus:ring-rose-200"
                      : "border-gray-300"
                  }`}
                  style={{ outlineColor: mcTouched && medicalCondition.trim().length < LIMITS.medicalCondition.min ? "#f87171" : C.primary }}
                  placeholder="e.g., Hypertension"
                  value={medicalCondition}
                  onChange={(e) => setMedicalCondition(e.target.value.slice(0, LIMITS.medicalCondition.max))}
                  onBlur={() => setMcTouched(true)}
                />
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-gray-500">{`${medicalCondition.length}/${LIMITS.medicalCondition.max}`}</span>
                  {mcTouched && medicalCondition.trim().length < LIMITS.medicalCondition.min && (
                    <span className="text-rose-600">Please enter at least {LIMITS.medicalCondition.min} characters.</span>
                  )}
                </div>
              </div>

              {/* notes */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 transition-all h-28 resize-none"
                  style={{ outlineColor: C.primary }}
                  placeholder="Special instructions"
                  value={notes}
                  onChange={(e) => e.target.value.length <= LIMITS.notes.max && setNotes(e.target.value)}
                />
                <div className="mt-1 text-xs text-gray-500">{notes.length}/{LIMITS.notes.max}</div>
              </div>

              <div className="flex items-center justify-between pt-4">
                <button
                  onClick={confirmAndSave}
                  disabled={isLoading || !selectedMed || !dose || !timesPerDay || !durationDays}
                  className="px-6 py-3 text-white rounded-xl disabled:opacity-50 transition-colors flex items-center gap-2 font-medium shadow-sm"
                  style={{ backgroundColor: C.primary }}
                >
                  <FileText size={18} />
                  Confirm & Create
                </button>

                <button
                  onClick={() => {
                    setSelectedMed(null);
                    setDose("");
                    setTimesPerDay("");
                    setDurationDays("");
                    setMedicalCondition("");
                    setNotes("");
                    setRxMsg("");
                    setMcTouched(false);
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

/* ============== Components ============== */
function InfoCard({ label, value, bold = false, highlight = false }) {
  return (
    <div
      className="p-4 border rounded-xl"
      style={{ background: highlight ? "#F6F1FA" : "#F9FAFB", borderColor: highlight ? "#E9DFF1" : "#E5E7EB" }}
    >
      <div className="text-sm text-gray-600 mb-1">{label}</div>
      <div className={`text-gray-800 ${bold ? "font-semibold" : ""}`} style={highlight ? { color: "#4A2C59", fontWeight: 600 } : undefined}>
        {value ?? "—"}
      </div>
    </div>
  );
}

/** Select يدعم Other */
function SelectField({ label, value, onChange, placeholder, options, required = false, allowOther = false }) {
  const isCustom = allowOther && !!value && !options.includes(value);
  const selectValue = isCustom ? OTHER_VALUE : (value || "");
  const missing = required && ((selectValue === "" && !isCustom) || (isCustom && !value));
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <div className="relative">
        <select
          className={`w-full pl-4 pr-10 py-3 border rounded-xl focus:ring-2 focus:border-transparent transition-all appearance-none bg-white ${missing ? "border-rose-400 focus:ring-rose-200" : "border-gray-300"}`}
          style={{ outlineColor: missing ? "#f87171" : C.primary }}
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (allowOther && v === OTHER_VALUE) onChange("");
            else onChange(v);
          }}
        >
          <option value="" disabled hidden>{placeholder}</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
          {allowOther && <option value={OTHER_VALUE}>Other…</option>}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none select-none leading-none text-gray-500 text-base">▾</div>
      </div>
      {(allowOther && (isCustom || selectValue === OTHER_VALUE)) && (
        <div className="mt-2">
          <input
            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 transition-all ${missing ? "border-rose-400 focus:ring-rose-200" : "border-gray-300"}`}
            style={{ outlineColor: missing ? "#f87171" : C.primary }}
            placeholder={`Enter custom ${label.toLowerCase()}`}
            value={isCustom ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {missing && <div className="mt-1 text-xs text-rose-600">This field is required.</div>}
        </div>
      )}
    </div>
  );
}

/** Dosage select يدعم Other */
function DosageSelect({ value, onChange, options = [], required = true, placeholder = "Select dosage", allowOther = true }) {
  const isCustom = allowOther && !!value && !options.includes(value);
  const selectValue = isCustom ? OTHER_VALUE : (value || "");
  const missing = required && ((selectValue === "" && !isCustom) || (isCustom && !value));
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Dosage {required && <span className="text-rose-500">*</span>}
      </label>
      <div className="relative">
        <select
          className={`w-full pl-4 pr-10 py-3 border rounded-xl focus:ring-2 focus:border-transparent transition-all appearance-none bg-white ${missing ? "border-rose-400 focus:ring-rose-200" : "border-gray-300"}`}
          style={{ outlineColor: missing ? "#f87171" : C.primary }}
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (allowOther && v === OTHER_VALUE) onChange("");
            else onChange(v);
          }}
        >
          <option value="" disabled hidden>{placeholder}</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
          {allowOther && <option value={OTHER_VALUE}>Other…</option>}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none select-none leading-none text-gray-500 text-base">▾</div>
      </div>
      {(allowOther && (isCustom || selectValue === OTHER_VALUE)) && (
        <div className="mt-2">
          <input
            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 transition-all ${missing ? "border-rose-400 focus:ring-rose-200" : "border-gray-300"}`}
            style={{ outlineColor: missing ? "#f87171" : C.primary }}
            placeholder="Enter custom dosage"
            value={isCustom ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {missing && <div className="mt-1 text-xs text-rose-600">Please enter dosage.</div>}
        </div>
      )}
    </div>
  );
}

/* ========= MedicineSearch (أضفتُه هنا داخل نفس الملف) ========= */
function MedicineSearch({ value, onSelect, data, placeholder = "Type medicine name" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value || "");
  const [cursor, setCursor] = useState(-1);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => setQ(value || ""), [value]);

  const base = Array.isArray(data) ? data : [];
  const norm = (s = "") => String(s).toLowerCase().replace(/\s+/g, " ").trim();

  const suggestions = useMemo(() => {
    const v = norm(q);
    if (!v) return base.slice(0, 12);
    const score = (m) => {
      const L = norm(m.label);
      const N = norm(m.name || "");
      let s = 0;
      if (L.startsWith(v) || N.startsWith(v)) s += 4;
      if (L.includes(v) || N.includes(v)) s += 1;
      return s;
    };
    return base
      .map((m) => ({ m, s: score(m) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || String(a.m.label).localeCompare(String(b.m.label)))
      .map((x) => x.m)
      .slice(0, 15);
  }, [q, data]);

  function choose(med) {
    onSelect?.(med);
    setQ(med.label);
    setOpen(false);
    setCursor(-1);
    setInvalid(false);
  }

  function handleBlur() {
    const match = base.find((m) => m.label === q);
    if (!match) {
      setQ(value || "");
      setInvalid(!!q);
    }
    setTimeout(() => setOpen(false), 120);
  }

  function onKeyDown(e) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { setOpen(true); return; }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (cursor >= 0 && suggestions[cursor]) choose(suggestions[cursor]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">Search Medicine</label>
      <input
        className={`w-full px-4 py-3 border rounded-xl focus:ring-2 transition-all ${invalid ? "border-rose-400 focus:ring-rose-200" : "border-gray-300 focus:border-transparent"}`}
        style={{ outlineColor: invalid ? "#f87171" : C.primary }}
        placeholder={placeholder}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setInvalid(false); }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={onKeyDown}
        aria-autocomplete="list"
        role="combobox"
      />
      {invalid && <div className="mt-1 text-xs text-rose-600">Please choose a medicine from the list.</div>}

      {open && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-80 overflow-y-auto" role="listbox">
          {suggestions.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-500">No matches found</li>
          ) : (
            suggestions.map((m, i) => (
              <li
                key={m.id || m.label}
                role="option"
                aria-selected={i === cursor}
                onMouseDown={(e) => { e.preventDefault(); choose(m); }}
                onMouseEnter={() => setCursor(i)}
                className={`px-4 py-2 text-sm cursor-pointer ${i === cursor ? "bg-gray-100" : "hover:bg-gray-50"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{m.label}</div>
                  <div className="ml-3 flex items-center gap-2">
                    <span className="text-[11px] uppercase text-gray-500">{m.dosageForm}</span>
                    {m.sensitivity && (
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full border"
                        style={{
                          background: m.sensitivity === "Sensitive" ? "#FEF2F2" : "#F1F8F5",
                          color: m.sensitivity === "Sensitive" ? "#991B1B" : "#166534",
                          borderColor: m.sensitivity === "Sensitive" ? "#FECACA" : "#BBE5C8",
                        }}
                      >
                        {m.sensitivity}
                      </span>
                    )}
                  </div>
                </div>
                {m.name && <div className="text-xs text-gray-500">{m.name}</div>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/* ================= helpers ================= */
function toAgeAny(birthValue) {
  try {
    if (!birthValue) return "—";
    let d;
    if (birthValue?.toDate) d = birthValue.toDate();
    else if (birthValue?.seconds) d = new Date(birthValue.seconds * 1000);
    else if (typeof birthValue === "string") {
      const parsed = Date.parse(birthValue.replace(" at ", " "));
      d = isNaN(parsed) ? new Date(birthValue) : new Date(parsed);
    } else d = new Date(birthValue);
    if (isNaN(d.getTime())) return "—";
    const diffMs = Date.now() - d.getTime();
    const age = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
    return age >= 0 ? age : "—";
  } catch { return "—"; }
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
  const birth = dbRec.birthDate ?? dbRec.birthdate;
  return {
    docId: dbRec.docId,
    id: national?.toString() || id,
    name: dbRec.name || "—",
    age: toAgeAny(birth),
    heightCm: dbRec.heightCm || "",
    weightKg: dbRec.weightKg || "",
    bloodType: dbRec.bloodType || "",
    allergies: Array.isArray(dbRec.allergies) ? dbRec.allergies : [],
  };
}
