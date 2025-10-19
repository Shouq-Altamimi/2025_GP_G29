// @ts-nocheck
import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";

// ===== Firestore =====
import { db } from "../firebase";
import {
  collection, query, where, getDocs, limit,
  doc as fsDoc, updateDoc, serverTimestamp
} from "firebase/firestore";

// ===== Ethers / Contracts =====
import { ethers } from "ethers";
import PRESCRIPTION from "../contracts/Prescription.json";
import DISPENSE from "../contracts/Dispense.json";

// ✅ عناوين العقود من Ganache (بدّليها إذا أعدتِ النشر)
const PRESCRIPTION_ADDRESS = "0x69728294747F07aBE362684487135164aAD8E3DC"; // Prescription
const DISPENSE_ADDRESS     = "0xaa66b0449cA9fCee6e4825c2E6c3F17aDC7867b3"; // Dispense

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
  const [rxs, setRxs] = useState([
    { ref: "RX-001", patientId: "1001", patientName: "Salem",  medicine: "Insulin",   dose: "10u",   timesPerDay: 2, durationDays: 30, createdAt: nowISO(), dispensed: false, accepted: false },
    { ref: "RX-002", patientId: "1002", patientName: "Maha",   medicine: "Panadol",   dose: "500mg", timesPerDay: 3, durationDays: 5,  createdAt: nowISO(), dispensed: false, accepted: false },
    { ref: "RX-003", patientId: "1003", patientName: "Hassan", medicine: "Metformin", dose: "850mg", timesPerDay: 1, durationDays: 14, createdAt: nowISO(), dispensed: false, accepted: false }
  ]);

  const [route, setRoute] = useState("Pick Up Orders");
  const [q, setQ] = useState("");

  const rowsDelivery = useMemo(() => rxs.filter(r => !r.dispensed && !r.accepted), [rxs]);
  const rowsPending  = useMemo(() => rxs.filter(r => !r.dispensed && r.accepted), [rxs]);

  const routes = ["Pick Up Orders", "Delivery Orders", "Pending Orders"];

  function addNotification(payload) {
    console.log("PharmacyApp notification:", payload);
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc", color: brand.ink, fontFamily: "Arial, sans-serif" }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: `linear-gradient(to bottom, ${brand.purple}, ${brand.teal})`, color: "#fff", padding: 16 }}>
        <div style={{ fontWeight: 700 }}>TrustDose — Pharmacy</div>
        <div style={{ marginTop: 16 }}>
          {routes.map((r) => (
            <div
              key={r}
              onClick={() => setRoute(r)}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                cursor: "pointer",
                marginBottom: 8,
                background: route === r ? "rgba(255,255,255,.3)" : "transparent"
              }}
            >
              {r}
            </div>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: 24 }}>
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

function PickUpSection({ setRxs, q, setQ, addNotification }) {
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // null | { ...normalized }
  const [alreadyDispensedMsg, setAlreadyDispensedMsg] = useState("");

  // ====== حسبة الإدخال ======
  const raw = String(q || "").trim();
  const onlyDigits = /^[\d\u0660-\u0669\u06F0-\u06F9]+$/.test(raw); // كله أرقام؟
  const natDigits = onlyDigits ? toEnglishDigits(raw).slice(0, 10) : ""; // حد أقصى 10 أرقام
  const rxUpper = !onlyDigits ? raw.toUpperCase() : ""; // إذا ليس أرقام، نعاملها كـ Rx ID

  function normalizeFromDB(data = {}, docId = "") {
    return {
      ref: data.prescriptionID || docId || "-",
      onchainId: (typeof data.onchainId === "number" && Number.isFinite(data.onchainId))
        ? data.onchainId
        : (data.onchainId ? Number(data.onchainId) : undefined),
      patientId: (data.nationalID ?? "-") + "",
      patientName: data.patientName || "-",
      medicine: data.medicineName || data.medicine || "-",
      dose: data.dosage || data.dose || "-",
      timesPerDay: data.timesPerDay ?? "-",
      durationDays:
        typeof data.durationDays === "number" ? data.durationDays : (data.durationDays || "-"),
      createdAt: toMaybeISO(data.createdAt) || nowISO(),
      status: data.status || "-",
      dispensed: !!data.dispensed,
      dispensedAt: toMaybeISO(data.dispensedAt) || undefined,
      dispensedBy: data.dispensedBy || undefined,
      sensitivity: data.sensitivity || "-",   // NonSensitive فقط
      _docId: docId,
    };
  }

  // handler يمنع إدخال أكثر من 10 أرقام لو كان الإدخال أرقام
  function handleChange(v) {
    const isDigits = /^[\d\u0660-\u0669\u06F0-\u06F9]+$/.test(String(v).trim());
    if (isDigits) {
      const ten = toEnglishDigits(v).slice(0, 10);
      setQ(ten);
    } else {
      setQ(v);
    }
    setSearched(false);
    setResult(null);
    setError("");
    setAlreadyDispensedMsg("");
  }

  async function runSearch() {
    setSearched(true);
    setLoading(true);
    setError("");
    setResult(null);
    setAlreadyDispensedMsg("");

    try {
      const col = collection(db, "prescriptions");
      const tasks = [];

      // 🔎 فلترة من المصدر: غير مصروفة + غير حساسة
      if (rxUpper) {
        tasks.push(getDocs(query(
          col,
          where("prescriptionID", "==", rxUpper),
          where("dispensed", "==", false),
          where("sensitivity", "==", "NonSensitive"),
          limit(1)
        )));
      }

      if (natDigits && natDigits.length === 10) {
        tasks.push(getDocs(query(
          col,
          where("nationalID", "==", natDigits),
          where("dispensed", "==", false),
          where("sensitivity", "==", "NonSensitive"),
          limit(1)
        )));
        const nNum = Number(natDigits);
        if (!Number.isNaN(nNum)) {
          tasks.push(getDocs(query(
            col,
            where("nationalID", "==", nNum),
            where("dispensed", "==", false),
            where("sensitivity", "==", "NonSensitive"),
            limit(1)
          )));
        }
      }

      const snaps = await Promise.all(tasks);
      const prefer = (snap, check) => {
        if (!snap || snap.empty) return null;
        const doc = snap.docs.find(check);
        return doc || snap.docs[0];
      };
      const byRxId  = prefer(snaps[0], d => d.data().prescriptionID === rxUpper);
      const byNatS  = prefer(snaps[1], d => String(d.data().nationalID || "") === natDigits);
      const byNatN  = prefer(snaps[2], d => d.data().nationalID === Number(natDigits));

      let pick = byRxId || byNatS || byNatN || null;

      // لو ما لقينا غير المصروفة، نتحقق هل فيه وصفة لكن مصروفة مسبقًا لنعرض رسالة واضحة
      if (!pick) {
        const fallbackTasks = [];
        if (rxUpper) {
          fallbackTasks.push(getDocs(query(col, where("prescriptionID", "==", rxUpper), limit(1))));
        }
        if (natDigits && natDigits.length === 10) {
          fallbackTasks.push(getDocs(query(col, where("nationalID", "==", natDigits), limit(1))));
          const nNum = Number(natDigits);
          if (!Number.isNaN(nNum)) {
            fallbackTasks.push(getDocs(query(col, where("nationalID", "==", nNum), limit(1))));
          }
        }
        const fallSnaps = fallbackTasks.length ? await Promise.all(fallbackTasks) : [];
        const fallDoc = fallSnaps.find(s => s && !s.empty)?.docs?.[0] || null;
        if (fallDoc) {
          const normalized = normalizeFromDB(fallDoc.data(), fallDoc.id);
          setResult(normalized);
          if (normalized.dispensed) {
            // CHANGED: English message without time
            setAlreadyDispensedMsg("This prescription was already dispensed.");
          } else {
            // CHANGED: English message
setAlreadyDispensedMsg("This medicine is sensitive and cannot be dispensed .");
          }
          setLoading(false);
          return;
        }
      }

      if (pick) {
        setResult(normalizeFromDB(pick.data(), pick.id));
        setSearched(true);
      } else {
        setResult(null);
        setSearched(false);
      }
    } catch (e) {
      console.error(e);
      setError("Could not complete search. Check your internet or Firestore access.");
      setResult(null);
      setSearched(false);
    } finally {
      setLoading(false);
    }
  }

  function resetSearch() {
    setQ("");
    setSearched(false);
    setResult(null);
    setError("");
    setAlreadyDispensedMsg("");
  }

  // ✅ Confirm → فحوصات مسبقة → Dispense.dispense(id) → Firestore → UI
  async function markDispensed(ref) {
    if (!result || !result._docId) return;

    // إضافة حماية: لا تسمح أبداً بصرف المصروفة مسبقاً
    if (result.dispensed) {
      // CHANGED: English message without time
      setAlreadyDispensedMsg("This prescription was already dispensed.");
      return;
    }
    if (result.sensitivity !== "NonSensitive") return;

    if (!Number.isFinite(result.onchainId)) {
      setError("On-chain id is missing for this prescription.");
      return;
    }

    const ok = window.confirm(
      `Confirm dispensing prescription ${result.ref} for patient ${result.patientName || ""}?`
    );
    if (!ok) return;

    try {
      setLoading(true);
      setError("");
      setAlreadyDispensedMsg("");

      // محفظة + عقود
      const signer = await getSignerEnsured();
      const pharmacistAddr = await signer.getAddress();

      const presc    = new ethers.Contract(PRESCRIPTION_ADDRESS, PRESCRIPTION.abi, signer);
      const dispense = new ethers.Contract(DISPENSE_ADDRESS,     DISPENSE.abi,     signer);

      // 0) تأكّد أن Dispense مربوط بنفس Prescription
      const linked = await dispense.prescription();
      if (linked?.toLowerCase?.() !== PRESCRIPTION_ADDRESS.toLowerCase()) {
        setError("Dispense contract is linked to a different Prescription address.");
        setLoading(false);
        return;
      }

      // 1) تأكّد أن الحساب صيدلي مفعّل
      const isPh = await dispense.isPharmacist(pharmacistAddr);
      if (!isPh) {
        setError("Your wallet is not enabled as a pharmacist on-chain (Not pharmacist).");
        setLoading(false);
        return;
      }

      // 2) تحقق مسبق من صلاحية الوصفة
      const stillValid = await presc.isValid(result.onchainId);
      if (!stillValid) {
        setError("Prescription is expired or inactive on-chain.");
        setLoading(false);
        return;
      }

      // 3) الصرف الفعلي على عقد Dispense
      const tx = await dispense.dispense(result.onchainId);
      const receipt = await tx.wait();
      const txHash = receipt?.hash || tx.hash;

      // 4) تحديث Firestore
      const docRef = fsDoc(db, "prescriptions", result._docId);
      await updateDoc(docRef, {
        dispensed: true,
        dispensedAt: serverTimestamp(),
        dispensedBy: pharmacistAddr,
        dispenseTx: txHash,
      });

      // 5) تحديث الواجهة
      setResult(prev => prev ? {
        ...prev,
        dispensed: true,
        dispensedAt: new Date().toISOString(),
        dispensedBy: pharmacistAddr,
        dispenseTx: txHash,
      } : prev);

      setRxs(prev => prev.map(rx => rx.ref === ref ? { ...rx, dispensed: true } : rx));

      addNotification(`Prescription ${ref} dispensed on-chain ✓`);
    } catch (e) {
      console.error(e);
      setError(niceErr(e));
    } finally {
      setLoading(false);
    }
  }

  const eligible = result
    ? (result.sensitivity === "NonSensitive") && (result.dispensed === false) && Number.isFinite(result.onchainId)
    : false;

  // عدّاد الأرقام للمساعدة البصرية
  const digitsLen = onlyDigits ? toEnglishDigits(q).length : 0;

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
              placeholder="Enter Patient ID (10 digits) or Prescription ID"
              value={q}
              maxLength={50}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={(e) => {
                // منع تجاوز 10 أرقام عند الإدخال الرقمي
                if (onlyDigits) {
                  const len = toEnglishDigits(q).length;
                  const isCharInput = e.key.length === 1; // حرف/رقم جديد
                  if (isCharInput && len >= 10) {
                    e.preventDefault();
                    return;
                  }
                }
                if (e.key === "Enter") runSearch();
              }}
              inputMode="numeric"
            />
            {/* زر مسح */}
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
            {/* معلومة الحد الأقصى */}
            {onlyDigits && (
              <div className="text-sm mt-1" style={{ color: "#6b7280" }}>
                {digitsLen}/10 — National ID accepts up to 10 digits
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={runSearch}
            className="px-6 py-3 text-white rounded-xl transition-colors flex items-center gap-2 font-medium disabled:opacity-60"
            style={{ backgroundColor: brand.purple }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#9F76B4")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = brand.purple)}
            disabled={loading || !q.trim() || (onlyDigits && toEnglishDigits(q).length > 10)}
          >
            {loading ? "Searching..." : (<><Search size={18} /> Search</>)}
          </button>
        </div>

        {!!error && <p className="text-red-600 mt-3">{error}</p>}
        {!!alreadyDispensedMsg && <p className="text-red-600 mt-3">{alreadyDispensedMsg}</p>}
      </section>

      {result && !result._notFound && (
        <div style={card}>
          <>
            <div><b>Prescription:</b> {result.ref}</div>
            <div><b>National ID:</b> {result.patientId}</div>
            <div><b>Patient:</b> {result.patientName}</div>
            <div><b>Medicine:</b> {result.medicine}</div>
            <div><b>Dosage:</b> {result.dose}</div>
            <div><b>Times/Day:</b> {result.timesPerDay}</div>
            <div><b>Duration:</b> {result.durationDays}</div>
            <div><b>Status:</b> {result.status || "-"}</div>
            <div><b>Created:</b> {fmt(result.createdAt)}</div>
            <div><b>Sensitivity:</b> {result.sensitivity}</div>
            {Number.isFinite(result.onchainId) && <div><b>On-chain ID:</b> #{result.onchainId}</div>}

            
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => markDispensed(result.ref)}
                style={{ ...btnStyle, background: result.dispensed ? "#d1fae5" : "#fff" }}
                disabled={!eligible}
                title={
                  result.dispensed
                    ? "Prescription already dispensed"
                    : (!Number.isFinite(result.onchainId)
                        ? "Missing on-chain id"
                        : (result.sensitivity !== "NonSensitive" ? "Sensitive: pickup not allowed" : "")
                      )
                }
              >
                {result.dispensed ? "✓ Dispensed" : (eligible ? "Confirm & Dispense" : "Not eligible")}
              </button>
            </div>
          </>
        </div>
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
