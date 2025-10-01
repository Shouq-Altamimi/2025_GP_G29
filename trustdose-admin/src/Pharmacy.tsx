import React, { useMemo, useState } from "react";

/** utils */
function nowISO() {
  return new Date().toISOString();
}
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
    { ref: "RX-001", patientId: "1001", patientName: "Salem", medicine: "Insulin", dose: "10u", timesPerDay: 2, durationDays: 30, createdAt: nowISO(), dispensed: false, accepted: false },
    { ref: "RX-002", patientId: "1002", patientName: "Maha", medicine: "Panadol", dose: "500mg", timesPerDay: 3, durationDays: 5, createdAt: nowISO(), dispensed: false, accepted: false },
    { ref: "RX-003", patientId: "1003", patientName: "Hassan", medicine: "Metformin", dose: "850mg", timesPerDay: 1, durationDays: 14, createdAt: nowISO(), dispensed: false, accepted: false }
  ]);

  const [notifications, setNotifications] = useState([]);
  const [route, setRoute] = useState("Pick Up Orders");
  const [q, setQ] = useState("");

  // views
  const rowsDelivery = useMemo(() => rxs.filter(r => !r.dispensed && !r.accepted), [rxs]);
  const rowsPending  = useMemo(() => rxs.filter(r => !r.dispensed && r.accepted), [rxs]);

  const routes = ["Pick Up Orders", "Delivery Orders", "Pending Orders", "Notifications", "Statistics"];

  function addNotification(payload) {
    if (typeof payload === "string") {
      setNotifications(prev => [{ text: payload, time: fmt(nowISO()) }, ...prev]);
    } else if (payload && typeof payload === "object") {
      setNotifications(prev => [{ ...payload, time: fmt(nowISO()), done: false }, ...prev]);
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc", color: brand.ink, fontFamily: "Arial, sans-serif" }}>
      <aside style={{ width: 220, background: `linear-gradient(to bottom, ${brand.purple}, ${brand.teal})`, color: "#fff", padding: 16 }}>
        <div style={{ fontWeight: 700 }}>TrustDose — Pharmacy</div>
        <div style={{ marginTop: 16 }}>
          {routes.map((r) => (
            <div key={r} onClick={() => setRoute(r)} style={{ padding: "8px 10px", borderRadius: 10, cursor: "pointer", marginBottom: 8, background: route === r ? "rgba(255,255,255,.3)" : "transparent" }}>{r}</div>
          ))}
        </div>
      </aside>

      <main style={{ flex: 1, padding: 24 }}>
        {route === "Pick Up Orders" && (
          <PickUpSection rows={rxs} setRxs={setRxs} q={q} setQ={setQ} addNotification={addNotification} />
        )}
        {route === "Delivery Orders" && (
          <DeliverySection rows={rowsDelivery} setRxs={setRxs} addNotification={addNotification} />
        )}
        {route === "Pending Orders" && (
          <PendingSection rows={rowsPending} setRxs={setRxs} addNotification={addNotification} /> 
        )}
        {route === "Notifications" && (
          <section style={{ display: "grid", gap: 12 }}>
            <h1 style={{ marginTop: 0 }}>Notifications</h1>
            {notifications.length === 0 ? (
              <div style={{ ...card, color: "#6b7280" }}>No notifications yet</div>
            ) : (
              notifications.map((n, i) => (
                <div key={i} style={{ ...card }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div>
                      <div>{n.text}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{n.time}</div>
                    </div>
                    {(n.type === 'logistics_cancel' || n.type === 'cancel') && !n.done && (
                      <button
                        onClick={() => {
                          setRxs(prev => prev.map(rx => rx.ref === n.ref ? { ...rx, redispensedAt: nowISO() } : rx));
                          setNotifications(prev => prev.map((x, idx) => idx === i ? { ...x, done: true, text: `${n.text} — ✓ Re-dispensed` } : x));
                        }}
                        style={{ ...btnStyle, background: n.done ? '#d1fae5' : '#fff' }}
                        disabled={n.done}
                      >
                        {n.done ? '✓ Re-dispensed' : 'Re-dispense'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </section>
        )}
        {route === "Statistics" && (
          <section style={{ display: "grid", gap: 12 }}>
            <h1 style={{ marginTop: 0 }}>Statistics</h1>
            <div style={{ ...card }}>Statistics content here</div>
          </section>
        )}
      </main>
    </div>
  );
}

/** Pick Up: prototype search then show one card only */
function PickUpSection({ rows = [], setRxs, q, setQ, addNotification }) {
  const [searched, setSearched] = useState(false);
  const digits = toEnglishDigits(q);

  const result = useMemo(() => {
    if (!searched || !digits) return null;
    const found = rows.find(
      (r) => r.patientId.includes(digits) || r.ref.toLowerCase().includes(String(digits).toLowerCase())
    );
    if (found) return found;
    // prototype fallback
    return {
      ref: `RX-${digits}`,
      patientId: digits,
      patientName: "-",
      medicine: "-",
      dose: "-",
      timesPerDay: "-",
      durationDays: "-",
      createdAt: nowISO(),
      dispensed: false,
    };
  }, [rows, digits, searched]);

  function runSearch() { setSearched(true); }
  function markDispensed(ref) {
    setRxs((prev) => prev.map((rx) => rx.ref === ref ? { ...rx, dispensed: true, dispensedAt: nowISO() } : rx));
    addNotification(`Prescription ${ref} dispensed`);
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h1>Pick Up Orders</h1>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setSearched(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
          placeholder="Search by Patient ID or Prescription"
          style={{ flex: 1, ...btnStyle }}
          inputMode="numeric"
        />
        <button onClick={runSearch} style={{ ...btnStyle }}>Search</button>
      </div>

      {result && (
        <div style={card}>
          <div><b>Prescription {result.ref}</b></div>
          <div>Patient: {result.patientName} ({result.patientId})</div>
          <div>Medicine: {result.medicine}</div>
          <div>Dose: {result.dose}</div>
          <div>Times/Day: {result.timesPerDay}</div>
          <div>Duration: {result.durationDays} days</div>
          <div>Created: {fmt(result.createdAt)}</div>
          <div style={{ marginTop: 8 }}>
            <button onClick={() => markDispensed(result.ref)} style={{ ...btnStyle, background: result.dispensed ? "#d1fae5" : "#fff" }} disabled={result.dispensed}>
              {result.dispensed ? "✓ Dispensed" : "Dispense"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Delivery: Accept moves item to Pending */
function DeliverySection({ rows = [], setRxs, addNotification }) {
  function acceptOrder(ref) {
    setRxs((prev) => prev.map((rx) => rx.ref === ref ? { ...rx, accepted: true, acceptedAt: nowISO() } : rx));
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

/** Pending: Cancel returns to Delivery, Contact marks contacted */
function PendingSection({ rows = [], setRxs, addNotification }) {
  function cancel(ref) {
    setRxs((prev) => prev.map((rx) => rx.ref === ref ? { ...rx, accepted: false, acceptedAt: undefined } : rx));
    addNotification({ type: 'cancel', ref, text: `Prescription ${ref} cancelled` });
  }
  function contact(ref) {
    setRxs((prev) => prev.map((rx) => rx.ref === ref ? { ...rx, contactedAt: nowISO() } : rx));
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
            <button onClick={() => contact(r.ref)} style={{ ...btnStyle, background: r.contactedAt ? "#d1fae5" : "#fff" }} disabled={!!r.contactedAt}>
              {r.contactedAt ? "✓ Contacted" : "Contact"}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
