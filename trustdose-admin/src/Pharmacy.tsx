// @ts-nocheck
import React, { useMemo, useState } from "react";
import { ethers } from "ethers";

// ===== Firestore =====
import { db } from "../firebase";
import {
  collection, query, where, getDocs, limit,
  doc as fsDoc, updateDoc, serverTimestamp
} from "firebase/firestore";

// ===== عقد الصرف Dispense (TRUFFLE ARTIFACT) =====
import DISPENSE from "../contracts/Dispense.json";

// (اختياري) عنوان احتياطي إذا لم يُقرأ من networks
const FALLBACK_DISPENSE_ADDRESS = "0xaa66b0449cA9fCee6e4825c2E6c3F17aDC7867b3";

// ===== Utils =====
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

// ===== UI helpers =====
const brand = { purple: "#B08CC1", teal: "#52B9C4", ink: "#4A2C59" };
const card = { background: "#fff", border: "1px solid #e6e9ee", borderRadius: 12, boxShadow: "0 4px 10px rgba(0,0,0,.05)", padding: 16 };
const btnStyle = { height: 36, padding: "0 14px", borderRadius: 8, border: "1px solid #e6e9ee", background: "#fff", cursor: "pointer" };

/** استخرج عنوان العقد من artifact بحسب chainId */
function getAddressFromArtifact(artifact, chainIdBigInt) {
  try {
    if (!artifact?.networks) return null;
    const idStr = chainIdBigInt?.toString?.();
    if (!idStr) return null;
    const rec = artifact.networks[idStr];
    return rec?.address || null;
  } catch { return null; }
}

export default function PharmacyApp() {
  const [rxs, setRxs] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [route, setRoute] = useState("Pick Up Orders");
  const [q, setQ] = useState("");

  const rowsDelivery = useMemo(() => rxs.filter(r => !r.dispensed && !r.accepted), [rxs]);
  const rowsPending  = useMemo(() => rxs.filter(r => !r.dispensed && r.accepted), [rxs]);
  const routes = ["Pick Up Orders", "Delivery Orders", "Pending Orders"];

  function addNotification(payload) {
    const item = typeof payload === "string" ? { text: payload } : payload || {};
    setNotifications(prev => [{ ...item, time: fmt(nowISO()) }, ...prev]);
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
        {route === "Pick Up Orders" && (<PickUpSection setRxs={setRxs} q={q} setQ={setQ} addNotification={addNotification} />)}
        {route === "Delivery Orders" && (<DeliverySection rows={rowsDelivery} setRxs={setRxs} addNotification={addNotification} />)}
        {route === "Pending Orders" && (<PendingSection rows={rowsPending} setRxs={setRxs} addNotification={addNotification} />)}
      </main>
    </div>
  );
}

/* ============ Pick Up (Search + on-chain dispense) ============ */
function PickUpSection({ setRxs, q, setQ, addNotification }) {
  const [searched, setSearched] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [result, setResult]     = useState(null);

  const raw       = String(q || "").trim();
  const natDigits = toEnglishDigits(raw);
  const rxUpper   = raw.toUpperCase();

  function normalizeFromDB(data = {}, docId = "") {
    const createdAtISO =
      data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() :
      typeof data.createdAt === "string" ? data.createdAt : nowISO();

    return {
      ref: data.prescriptionID || docId || "-",
      onchainId: typeof data.onchainId === "number" ? data.onchainId : (data.onchainId ? Number(data.onchainId) : undefined),
      patientId: (data.nationalID ?? "-") + "",
      patientName: data.patientName || "-",
      medicine: data.medicineName || data.medicine || "-",
      dose: data.dosage || data.dose || "-",
      timesPerDay: data.timesPerDay ?? "-",
      durationDays: typeof data.durationDays === "number" ? data.durationDays : (data.durationDays || "-"),
      createdAt: createdAtISO,
      status: data.status || "-",
      dispensed: !!data.dispensed,
      dispensedAt: data.dispensedAt?.toDate?.()?.toISOString(),
      sensitivity: data.sensitivity || "-",
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
      const snaps = await getDocs(query(
        col,
        where("prescriptionID", "==", rxUpper),
        where("dispensed", "==", false),
        where("sensitivity", "==", "NonSensitive"),
        limit(1)
      ));
      if (!snaps.empty) {
        setResult(normalizeFromDB(snaps.docs[0].data(), snaps.docs[0].id));
      } else setResult(null);
    } catch (e) {
      console.error(e);
      setError("Could not complete search. Check Firestore connection.");
    } finally {
      setLoading(false);
    }
  }

  function resetSearch() {
    setQ(""); setSearched(false); setResult(null); setError("");
  }

  // ===== Dispense function with debugging =====
  async function confirmDispense() {
    if (!result || !result._docId) return;
    if (!Number.isFinite(result.onchainId)) {
      setError("Missing on-chain ID for this prescription.");
      return;
    }

    try {
      setLoading(true);
      if (!window.ethereum) throw new Error("MetaMask not detected.");
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network  = await provider.getNetwork();
      const chainId  = network?.chainId;
      const signer   = await provider.getSigner();
      const pharmacistAddr = await signer.getAddress();

      console.log(
        "ABI_has_dispense?",
        Array.isArray(DISPENSE?.abi) && DISPENSE.abi.some(x => x.type === "function" && x.name === "dispense")
      );
      console.log(
        "networks keys:",
        DISPENSE.networks && Object.keys(DISPENSE.networks || {})
      );
      console.log("current chainId:", chainId?.toString?.());

      const addrFromArtifact = getAddressFromArtifact(DISPENSE, chainId);
      const address = addrFromArtifact || FALLBACK_DISPENSE_ADDRESS;
      console.log("Dispense contract address used:", address);

      const contract = new ethers.Contract(address, DISPENSE.abi, signer);
      const id = BigInt(result.onchainId);
      const tx = await contract.dispense(id);
      const receipt = await tx.wait();
      const txHash = receipt?.hash || tx.hash;

      const docRef = fsDoc(db, "prescriptions", result._docId);
      await updateDoc(docRef, {
        dispensed: true,
        dispensedAt: serverTimestamp(),
        dispensedBy: pharmacistAddr,
        dispenseTx: txHash,
      });

      setResult(prev => ({ ...prev, dispensed: true, dispensedAt: new Date().toISOString(), dispenseTx: txHash }));
      addNotification(`Prescription ${result.ref} dispensed on-chain ✓`);
    } catch (e) {
      console.error(e);
      setError(e?.shortMessage || e?.info?.error?.message || e?.message || "On-chain dispense failed.");
    } finally {
      setLoading(false);
    }
  }

  const eligible = result && result.sensitivity === "NonSensitive" && !result.dispensed;

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h1>Pick Up Orders</h1>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()} placeholder="Search Prescription ID" style={{ flex: 1, ...btnStyle }} />
        <button onClick={runSearch} style={btnStyle} disabled={loading}>{loading ? "Searching..." : "Search"}</button>
        {!!q && <button onClick={resetSearch} style={btnStyle}>Clear</button>}
      </div>

      {!!error && <div style={{ color: "#b91c1c" }}>{error}</div>}

      {result && (
        <div style={card}>
          <div><b>Prescription:</b> {result.ref} (on-chain #{result.onchainId})</div>
          <div><b>Patient:</b> {result.patientName}</div>
          <div><b>Medicine:</b> {result.medicine}</div>
          <div><b>Dosage:</b> {result.dose}</div>
          <div><b>Sensitivity:</b> {result.sensitivity}</div>
          <button onClick={confirmDispense} style={{ ...btnStyle, background: result.dispensed ? "#d1fae5" : "#fff" }} disabled={!eligible || loading}>
            {result.dispensed ? "✓ Dispensed" : "Confirm & Dispense"}
          </button>
        </div>
      )}
    </section>
  );
}

function DeliverySection() { return <div>Delivery Orders</div>; }
function PendingSection() { return <div>Pending Orders</div>; }
