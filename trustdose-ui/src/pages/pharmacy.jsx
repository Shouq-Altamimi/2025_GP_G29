// @ts-nocheck
import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";

// ===== Firestore =====
import { db } from "../firebase"; 
import {
  collection, query, where, getDocs, limit,
  doc as fsDoc, updateDoc
} from "firebase/firestore";

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
  const [result, setResult] = useState(null); // null | { ...normalized } | {_notFound:true}

  const raw = String(q || "").trim();
  const natDigits = toEnglishDigits(raw); 
  const rxUpper = raw.toUpperCase();       

  function normalizeFromDB(data = {}, docId = "") {
    return {
      ref: data.prescriptionID || docId || "-",
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
      _docId: docId,
    };
  }

  async function runSearch() {
    setSearched(true);
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const col = collection(db, "prescriptions");
      const tasks = [];

      if (rxUpper) {
        tasks.push(getDocs(query(col, where("prescriptionID", "==", rxUpper), limit(1))));
      }

      if (natDigits) {
        tasks.push(getDocs(query(col, where("nationalID", "==", natDigits), limit(1))));
        const nNum = Number(natDigits);
        if (!Number.isNaN(nNum)) {
          tasks.push(getDocs(query(col, where("nationalID", "==", nNum), limit(1))));
        }
      }

      const snaps = await Promise.all(tasks);
      let pick = null;

      const prefer = (snap, check) => {
        if (!snap || snap.empty) return null;
        const doc = snap.docs.find(check);
        return doc || snap.docs[0];
      };
      const byRxId  = prefer(snaps[0], d => d.data().prescriptionID === rxUpper);
      const byNatS  = prefer(snaps[1], d => String(d.data().nationalID || "") === natDigits);
      const byNatN  = prefer(snaps[2], d => d.data().nationalID === Number(natDigits));

      pick = byRxId || byNatS || byNatN || null;

      if (pick) setResult(normalizeFromDB(pick.data(), pick.id));
      else setResult({ _notFound: true, ref: rxUpper || "-", patientId: natDigits || "-" });
    } catch (e) {
      console.error(e);
      setError("Could not complete search. Check your internet or Firestore access.");
      setResult({ _notFound: true, ref: rxUpper || "-", patientId: natDigits || "-" });
    } finally {
      setLoading(false);
    }
  }

  function resetSearch() {
    setQ("");
    setSearched(false);
    setResult(null);
    setError("");
  }

  async function markDispensed(ref) {
    if (!result || !result._docId) return;

    if (result.dispensed) return;

    try {
      const docRef = fsDoc(db, "prescriptions", result._docId);

      await updateDoc(docRef, {
        dispensed: true
      });

      setResult((prev) =>
        prev ? { ...prev, dispensed: true } : prev
      );

      setRxs(prev =>
        prev.map(rx => rx.ref === ref ? { ...rx, dispensed: true } : rx)
      );

      addNotification(`Prescription ${ref} dispensed`);
    } catch (e) {
      console.error(e);
      setError("Could not update dispensing status. Please try again.");
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
              placeholder="Enter Patient ID or Prescription ID"
              value={q}
              onChange={(e) => { setQ(e.target.value); setSearched(false); setResult(null); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
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
        {!!error && <p className="text-red-600 mt-3">{error}</p>}
      </section>

      {searched && result && (
        <div style={card}>
          {result._notFound ? (
            <>
              <div><b>Not found in DB</b></div>
              <div>Prescription: {result.ref}</div>
              <div>National ID: {result.patientId}</div>
              <div style={{ marginTop: 8 }}>
                <button style={{ ...btnStyle, opacity: .6, cursor: "not-allowed" }} disabled>
                  Dispense
                </button>
              </div>
            </>
          ) : (
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

              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => markDispensed(result.ref)}
                  style={{ ...btnStyle, background: result.dispensed ? "#d1fae5" : "#fff" }}
                  disabled={result.dispensed}
                  title={result.dispensed ? "Prescription already dispensed" : ""}
                >
                  {result.dispensed ? "✓ Dispensed" : "Dispense"}
                </button>
              </div>
            </>
          )}
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
