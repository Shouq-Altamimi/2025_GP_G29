// @ts-nocheck
import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";

// ===== Firestore =====
import { db } from "../firebase";
import {
  collection, query, where, getDocs,
  doc as fsDoc, updateDoc, serverTimestamp
} from "firebase/firestore";

// ===== Ethers / Contracts =====
import { ethers } from "ethers";
import PRESCRIPTION from "../contracts/Prescription.json";
import DISPENSE from "../contracts/Dispense.json";

// ✅ عناوين العقود من Ganache (بدّليها إذا أعدتِ النشر)
const PRESCRIPTION_ADDRESS = "0x30cb3cDcf8dF0b552E2e258FbbbCFbAe107b110d"; // Prescription
const DISPENSE_ADDRESS     = "0x87955D26f408797176109fc86dB88022f3629a3F"; // Dispense

// ✅ يطلب MetaMask ويضمن شبكة التطوير
async function getSignerEnsured() {
  if (!window.ethereum) throw new Error("MetaMask not detected.");
  await window.ethereum.request({ method: "eth_requestAccounts" });
  const provider = new ethers.BrowserProvider(window.ethereum); // ethers v6
  const network = await provider.getNetwork();
  const allowed = [1337n, 5777n, 31337n]; // Ganache/Hardhat
  if (!allowed.includes(network.chainId)) {
    console.warn("⚠ Unexpected chainId =", network.chainId.toString());
  }
  return provider.getSigner();
}

/** utils */
function nowISO() { return new Date().toISOString(); }
function fmt(dateISO) {
  if (!dateISO) return "-";
  const s = String(dateISO);
  return s.includes("T") ? s.replace("T", " ").slice(0, 16) : s;
}
function toEnglishDigits(s) {
  if (!s) return "";
  let out = "";
  for (const ch of String(s)) {
    const code = ch.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660);
    else if (code >= 0x06F0 && code <= 0x06F9) out += String(code - 0x06F0);
    else if (code >= 48 && code <= 57) out += ch;
  }
  return out;
}
function toMaybeISO(val) {
  if (!val) return undefined;
  if (val && typeof val === "object" && typeof val.toDate === "function") {
    try { return val.toDate().toISOString(); } catch { return undefined; }
  }
  if (typeof val === "string") return val;
  return undefined;
}
function niceErr(e, fallback = "On-chain dispense failed.") {
  return (
    e?.shortMessage ||
    e?.reason ||
    e?.info?.error?.message ||
    e?.data?.message ||
    e?.message ||
    fallback
  );
}

// منع الحروف العربية داخل خانة البحث
const ARABIC_LETTERS_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;

/** branding */
const brand = { purple: "#B08CC1", teal: "#52B9C4", ink: "#4A2C59" };
const card = {
  background: "#fff",
  border: "1px solid #e6e9ee",
  borderRadius: 12,
  boxShadow: "0 4px 10px rgba(0,0,0,.05)",
  padding: 16,
};
const btnStyle = {
  height: 36,
  padding: "0 14px",
  borderRadius: 8,
  border: "1px solid #e6e9ee",
  background: "#fff",
  cursor: "pointer",
};

export default function PharmacyApp() {
  // داتا تجريبية لأقسام التسليم/البيندنج فقط
  const [rxs, setRxs] = useState([
    { ref: "RX-001", patientId: "1001", patientName: "Salem",  medicine: "Insulin",   dose: "10u",   timesPerDay: 2, durationDays: 30, createdAt: nowISO(), dispensed: false, accepted: false },
    { ref: "RX-002", patientId: "1002", patientName: "Maha",   medicine: "Panadol",   dose: "500mg", timesPerDay: 3, durationDays: 5,  createdAt: nowISO(), dispensed: false, accepted: false },
    { ref: "RX-003", patientId: "1003", patientName: "Hassan", medicine: "Metformin", dose: "850mg", timesPerDay: 1, durationDays: 14, createdAt: nowISO(), dispensed: false, accepted: false }
  ]);

  const [route] = useState("Pick Up Orders");
  const [q, setQ] = useState("");

  const rowsDelivery = useMemo(() => rxs.filter(r => !r.dispensed && !r.accepted), [rxs]);
  const rowsPending  = useMemo(() => rxs.filter(r => !r.dispensed && r.accepted), [rxs]);

  function addNotification(payload) {
    console.log("PharmacyApp notification:", payload);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", color: brand.ink, fontFamily: "Arial, sans-serif" }}>
      <main style={{ padding: 24 }}>
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          {route === "Pick Up Orders" && (
            <PickUpSection setRxs={setRxs} q={q} setQ={setQ} addNotification={addNotification} />
          )}
          {route === "Delivery Orders" && (
            <DeliverySection rows={rowsDelivery} setRxs={setRxs} addNotification={addNotification} />
          )}
          {route === "Pending Orders" && (
            <PendingSection rows={rowsPending} setRxs={setRxs} addNotification={addNotification} />
          )}
        </div>
      </main>
    </div>
  );
}

/** ========================= PickUp (البحث والتسليم في الصيدلية) ========================= */
function PickUpSection({ setRxs, q, setQ, addNotification }) {
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ✅ النتائج كمصفوفة — لدعم أكثر من وصفة للمريض
  const [results, setResults] = useState([]); // [{...normalized}, ...]
  const [infoMsg, setInfoMsg] = useState("");
  const [validationMsg, setValidationMsg] = useState("");

  // ====== منطق الإدخال ======
  const raw = String(q || "").trim();
  const isPatientIdMode = /^\d/.test(raw); // إذا بدأ برقم → Patient ID
  const natDigitsAll = toEnglishDigits(raw).replace(/\D/g, "");
  const natDigits = isPatientIdMode ? natDigitsAll.slice(0, 10) : ""; // حد أقصى 10 أرقام
  const rxUpper = !isPatientIdMode ? raw.toUpperCase() : ""; // Prescription ID

  // ====== تنسيق آمن (يمنع 0 غير مفيد) ======
  const safeInt = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const showOrDash = (v) => {
    if (v === null || v === undefined) return "-";
    const n = Number(v);
    if (Number.isFinite(n)) return n > 0 ? n : "-";
    const s = String(v).trim();
    return s === "" || s === "0" ? "-" : s;
  };

  function normalizeFromDB(data = {}, docId = "") {
    const pid = (data.nationalID !== undefined && data.nationalID !== null)
      ? String(data.nationalID).trim()
      : "-";

    const onchain = safeInt(data.onchainId);

    return {
      ref: data.prescriptionID || docId || "-",
      onchainId: onchain,
      patientId: pid,
      patientName: data.patientName || "-",
      medicine: data.medicineName || data.medicine || "-",
      dose: data.dosage || data.dose || "-",
      timesPerDay: showOrDash(data.timesPerDay),
      durationDays: showOrDash(data.durationDays),
      createdAt: toMaybeISO(data.createdAt) || nowISO(),
      status: data.status || "-",
      dispensed: !!data.dispensed,
      dispensedAt: toMaybeISO(data.dispensedAt) || undefined,
      dispensedBy: data.dispensedBy || undefined,
      sensitivity: data.sensitivity || "-",
      _docId: docId,
    };
  }

  // ====== منع العربية + تحضير القيمة ======
  function handleChange(v) {
    const s = String(v).replace(ARABIC_LETTERS_RE, "");
    if (/^\d/.test(s)) {
      const digits = toEnglishDigits(s).replace(/\D/g, "").slice(0, 10);
      setQ(digits);
      if (digits.length && digits[0] !== "1" && digits[0] !== "2") {
        setValidationMsg("Patient ID must start with 1 or 2.");
      } else {
        setValidationMsg("");
      }
    } else {
      setQ(s);
      setValidationMsg("");
    }
    setSearched(false);
    setResults([]);
    setError("");
    setInfoMsg("");
  }

  async function runSearch() {
    setSearched(true);
    setLoading(true);
    setError("");
    setResults([]);
    setInfoMsg("");

    if (isPatientIdMode) {
      const firstOk = natDigits.length > 0 && (natDigits[0] === "1" || natDigits[0] === "2");
      const lenOk = natDigits.length === 10;
      if (!firstOk || !lenOk) {
        setLoading(false);
        setValidationMsg(!firstOk ? "Patient ID must start with 1 or 2." : "Patient ID must be exactly 10 digits.");
        return;
      }
    }

    try {
      const col = collection(db, "prescriptions");

      // === Prescription ID: نتيجة واحدة (حتى لو غير مؤهلة، للشفافية) ===
      if (rxUpper) {
        const snap = await getDocs(query(col, where("prescriptionID", "==", rxUpper)));
        if (!snap.empty) {
          const d = snap.docs[0];
          const n = normalizeFromDB(d.data(), d.id);
          setResults([n]);
        } else {
          setResults([]);
        }
        setLoading(false);
        return;
      }

      // === Patient ID: كل غير الحساسة + غير المصروفة + onchainId صالح ===
      const tasks = [
        getDocs(query(
          col,
          where("nationalID", "==", natDigits),
          where("dispensed", "==", false),
          where("sensitivity", "==", "NonSensitive")
        )),
      ];
      const nNum = Number(natDigits);
      if (!Number.isNaN(nNum)) {
        tasks.push(getDocs(query(
          col,
          where("nationalID", "==", nNum),
          where("dispensed", "==", false),
          where("sensitivity", "==", "NonSensitive")
        )));
      }

      const snaps = await Promise.all(tasks);

      // دمج بلا تكرار + فلترة onchainId
      const seen = new Set();
      const list = [];
      for (const s of snaps) {
        if (!s || s.empty) continue;
        s.forEach(doc => {
          if (seen.has(doc.id)) return;
          seen.add(doc.id);
          const n = normalizeFromDB(doc.data(), doc.id);
          if (n.sensitivity === "NonSensitive" && n.dispensed === false && Number.isFinite(n.onchainId)) {
            list.push(n);
          }
        });
      }

      if (list.length === 0) {
        // فallback: هل فيه وصفات موجودة بس غير مؤهلة (حساسة/مصروفة/بدون onchainId)؟
        const fbTasks = [ getDocs(query(col, where("nationalID", "==", natDigits))) ];
        if (!Number.isNaN(nNum)) fbTasks.push(getDocs(query(col, where("nationalID", "==", nNum))));
        const fbSnaps = await Promise.all(fbTasks);
        const haveAny = fbSnaps.some(s => s && !s.empty);
        if (haveAny) {
          setInfoMsg("No eligible pickup prescriptions. They may be sensitive, already dispensed, or missing on-chain id.");
        }
      }

      setResults(list);
    } catch (e) {
      console.error(e);
      setError("Could not complete search. Check your internet or Firestore access.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function resetSearch() {
    setQ("");
    setSearched(false);
    setResults([]);
    setError("");
    setInfoMsg("");
    setValidationMsg("");
  }

  // ✅ Confirm → فحوصات مسبقة → Dispense.dispense(id) → Firestore → UI (لكل عنصر)
  async function markDispensed(item) {
    if (!item || !item._docId) return;

    if (item.dispensed) {
      setInfoMsg("This prescription was already dispensed.");
      return;
    }
    if (item.sensitivity !== "NonSensitive") return;

    if (!Number.isFinite(item.onchainId)) {
      setError("On-chain id is missing for this prescription.");
      return;
    }

    const ok = window.confirm(
      `Confirm dispensing prescription ${item.ref} for patient ${item.patientName || ""}?`
    );
    if (!ok) return;

    try {
      setLoading(true);
      setError("");
      setInfoMsg("");

      const signer = await getSignerEnsured();
      const pharmacistAddr = await signer.getAddress();

      const presc    = new ethers.Contract(PRESCRIPTION_ADDRESS, PRESCRIPTION.abi, signer);
      const dispense = new ethers.Contract(DISPENSE_ADDRESS,     DISPENSE.abi,     signer);

      const linked = await dispense.prescription();
      if (linked?.toLowerCase?.() !== PRESCRIPTION_ADDRESS.toLowerCase()) {
        setError("Dispense contract is linked to a different Prescription address.");
        setLoading(false);
        return;
      }

      const isPh = await dispense.isPharmacist(pharmacistAddr);
      if (!isPh) {
        setError("Your wallet is not enabled as a pharmacist on-chain (Not pharmacist).");
        setLoading(false);
        return;
      }

      const stillValid = await presc.isValid(item.onchainId);
      if (!stillValid) {
        setError("Prescription is expired or inactive on-chain.");
        setLoading(false);
        return;
      }

      const tx = await dispense.dispense(item.onchainId);
      const receipt = await tx.wait();
      const txHash = receipt?.hash || tx.hash;

      const docRef = fsDoc(db, "prescriptions", item._docId);
      await updateDoc(docRef, {
        dispensed: true,
        dispensedAt: serverTimestamp(),
        dispensedBy: pharmacistAddr,
        dispenseTx: txHash,
      });

      // تحديث القائمة في الواجهة
      setResults(prev => prev.map(r =>
        r._docId === item._docId
          ? { ...r, dispensed: true, dispensedAt: new Date().toISOString(), dispensedBy: pharmacistAddr, dispenseTx: txHash }
          : r
      ));

      addNotification(`Prescription ${item.ref} dispensed on-chain ✓`);
    } catch (e) {
      console.error(e);
      setError(niceErr(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Search size={20} style={{ color: brand.purple }} />
          <span style={{ color: brand.ink }}>Search Prescriptions</span>
        </h2>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:border-transparent transition-all"
              style={{ outlineColor: brand.purple }}
              placeholder="Enter Patient ID (10 digits, starts with 1 or 2) or Prescription ID"
              value={q}
              maxLength={50}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
              inputMode="numeric"
            />
            {!!q && (
              <button
                type="button"
                onClick={resetSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 hover:opacity-80"
                style={{ color: brand.ink }}
                aria-label="Clear"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={runSearch}
            className="px-6 py-3 text-white rounded-xl transition-colors flex items-center gap-2 font-medium disabled:opacity-60"
            style={{ backgroundColor: brand.purple }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#9F76B4")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = brand.purple)}
            disabled={loading || !q.trim()}
          >
            {loading ? "Searching..." : (<><Search size={18} /> Search</>)}
          </button>
        </div>

       {(!!q || results.length > 0) && (
          <div className="flex justify-end mt-2">
            <button
              onClick={resetSearch}
              className="px-6 py-3 rounded-xl font-semibold"
              style={{ background: "#F3F4F6", color: "#374151" }}
            >
              Clear Search
            </button>
          </div>
        )}

        {(!!error || !!infoMsg || !!validationMsg) && (
          <div className="mt-3 text-red-600 font-medium">
            {validationMsg || infoMsg || error}
          </div>
        )}
      </section>

      {/* ====== النتائج ====== */}
      {searched && !loading && results.length === 0 && !error && !infoMsg && (
        <div className="text-gray-600">No matching prescriptions found.</div>
      )}

      {results.length > 0 && (
        <section style={{ display: "grid", gap: 12 }}>
          {results.map((r) => {
            const eligible =
              r.sensitivity === "NonSensitive" &&
              r.dispensed === false &&
              Number.isFinite(r.onchainId);

            return (
              <div key={r._docId} style={card}>
                <div><b>Prescription:</b> {r.ref}</div>
                <div><b>National ID:</b> {r.patientId}</div>
                <div><b>Patient:</b> {r.patientName}</div>
                <div><b>Medicine:</b> {r.medicine}</div>
                <div><b>Dosage:</b> {r.dose}</div>
                <div><b>Times/Day:</b> {r.timesPerDay}</div>
                <div><b>Duration:</b> {r.durationDays}</div>
                <div><b>Created:</b> {fmt(r.createdAt)}</div>
                <div><b>Sensitivity:</b> {r.sensitivity}</div>

                <div style={{ marginTop: 8 }}>
                  <button
                    onClick={() => markDispensed(r)}
                    style={{ ...btnStyle, background: r.dispensed ? "#d1fae5" : "#fff" }}
                    disabled={!eligible}
                    title={
                      r.dispensed
                        ? "Prescription already dispensed"
                        : (!Number.isFinite(r.onchainId)
                            ? "Missing on-chain id"
                            : (r.sensitivity !== "NonSensitive" ? "Sensitive: pickup not allowed" : "")
                          )
                    }
                  >
                    {r.dispensed ? "✓ Dispensed" : (eligible ? "Confirm & Dispense" : "Not eligible")}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </section>
  );
}

/** ========================= Delivery ========================= */
function DeliverySection({ rows = [], setRxs, addNotification }) {
  function acceptOrder(ref) {
    setRxs(prev => prev.map(rx => rx.ref === ref ? { ...rx, accepted: true, acceptedAt: nowISO() } : rx));
    addNotification(`Prescription ${ref} accepted for delivery`);
  }
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h1>Delivery Orders</h1>
      {rows.map(r => (
        <div key={r.ref} style={card}>
          <div><b>Prescription {r.ref}</b></div>
          <div>Patient: {r.patientName} ({r.patientId})</div>
          <div>Medicine: {r.medicine}</div>
          <div>Dose: {r.dose}</div>
          <div>Times/Day: {r.timesPerDay}</div>
          <div>Duration: {r.durationDays} days</div>
          <div>Created: {fmt(r.createdAt)}</div>
          {r.acceptedAt && <div>Accepted At: {fmt(r.acceptedAt)}</div>}
          <div style={{ marginTop: 8 }}>
            <button onClick={() => acceptOrder(r.ref)} style={{ ...btnStyle, background: r.accepted ? "#d1fae5" : "#fff" }} disabled={r.accepted}>
              {r.accepted ? "✓ Accepted" : "Accept"}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

/** ========================= Pending ========================= */
function PendingSection({ rows = [], setRxs, addNotification }) {
  function cancel(ref) {
    setRxs(prev => prev.map(rx => rx.ref === ref ? { ...rx, accepted: false, acceptedAt: undefined } : rx));
    addNotification({ type: 'cancel', ref, text: `Prescription ${ref} cancelled` });
  }
  function contact(ref) {
    setRxs(prev => prev.map(rx => rx.ref === ref ? { ...rx, contactedAt: nowISO() } : rx));
    addNotification(`Prescription ${ref} contacted logistics`);
  }
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h1>Pending Orders</h1>
      {rows.map(r => (
        <div key={r.ref} style={card}>
          <div><b>Prescription {r.ref}</b></div>
          <div>Patient: {r.patientName} ({r.patientId})</div>
          <div>Medicine: {r.medicine}</div>
          <div>Dose: {r.dose}</div>
          <div>Times/Day: {r.timesPerDay}</div>
          <div>Duration: {r.durationDays} days</div>
          <div>Accepted At: {fmt(r.acceptedAt)}</div>
          {r.contactedAt && <div>Contacted At: {fmt(r.contactedAt)}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => cancel(r.ref)} style={{ ...btnStyle }}>Cancel</button>
            <button
              onClick={() => contact(r.ref)}
              style={{ ...btnStyle, background: r.contactedAt ? "#d1fae5" : "#fff" }}
              disabled={!!r.contactedAt}
            >
              {r.contactedAt ? "✓ Contacted" : "Contact"}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
