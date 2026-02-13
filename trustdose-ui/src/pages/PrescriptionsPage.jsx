// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

const C = {
  primary: "#B08CC1",
  ink: "#4A2C59",
  gray: "#666",
};
const PAGE_SIZE = 6;

async function sha256Hex(input) {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function shortAddr(a) {
  if (!a) return "—";
  const s = String(a);
  return s.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}
 function normalizeDTInput(v) {
  return String(v).replace(/[^0-9:\- T]/g, "").replace(/\s+/g, " ").slice(0, 16);
}
function parseDTLocal(v) {
 
  if (!v || typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;

  const cleaned = s.replace("T", " ");
  const [datePart, timePart] = cleaned.split(" ");
  if (!datePart || !timePart) return null;

  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);

  if (![y, m, d, hh, mm].every((n) => Number.isFinite(n))) return null;

  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function isValidDT(v) {
  if (!v || typeof v !== "string") return false;
  const s = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(s)) return false;

  const [datePart, timePart] = s.split(" ");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);

  if (m < 1 || m > 12) return false;
  if (hh < 0 || hh > 23) return false;
  if (mm < 0 || mm > 59) return false;

  const lastDay = new Date(y, m, 0).getDate(); 
  if (d < 1 || d > lastDay) return false;

  return true;
}

export default function PrescriptionsPage({ role = "doctor", onDispense, dispensingId }) {
  const location = useLocation();
  const state = location.state;
  const navigate = useNavigate();

  const pageRole = state?.role || role;

  const cached = sessionStorage.getItem("td_patient");
  const fallback = cached ? JSON.parse(cached) : null;

  const [natHash, setNatHash] = useState("");
  const [patientName, setPatientName] = useState(state?.patientName || fallback?.name || "");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qText, setQText] = useState("");
  
  const [fromDT, setFromDT] = useState("");
const [toDT, setToDT] = useState("");
  const [page, setPage] = useState(0);

const setQuickFilter = (hours) => {
  const now = new Date();
  const past = new Date(now.getTime() - hours * 60 * 60 * 1000);
  
  const formatForInput = (d) => {
    const pad = (n) => n.toString().padStart(2, '0');
    const year = d.getFullYear().toString().slice(-4); 
    return `${year}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  
  setFromDT(formatForInput(past).replace("T", " "));
  setToDT(formatForInput(now).replace("T", " "));
};

  useEffect(() => {
    (async () => {
      const sp = new URLSearchParams(location.search);
      const urlPid = sp.get("pid");

      if (urlPid && /^0x[a-f0-9]{64}$/i.test(urlPid)) {
        setNatHash(urlPid);
        if (!patientName && fallback?.name) setPatientName(fallback.name);
        return;
      }

      if (urlPid && /^[0-9]{10}$/.test(urlPid)) {
        const hash = await sha256Hex(urlPid);
        const hashed = "0x" + hash;
        window.history.replaceState(null, "", `/prescriptions?pid=${hashed}`);
        setNatHash(hashed);
        if (!patientName && fallback?.name) setPatientName(fallback.name);
        return;
      }

      const rawId = state?.patientId || fallback?.id || "";
      if (rawId && /^[0-9]{10}$/.test(String(rawId))) {
        const hash = await sha256Hex(String(rawId));
        const hashed = "0x" + hash;
        window.history.replaceState(null, "", `/prescriptions?pid=${hashed}`);
        setNatHash(hashed);
        return;
      }

      navigate("/doctor", { replace: true });
    })();
  }, [location.search]);

  useEffect(() => {
    if (!natHash) return;
    (async () => {
      setLoading(true);
      try {
        const colRef = collection(db, "prescriptions");
        const qRef = query(colRef, where("patientNationalIdHash", "==", natHash));
        const snap = await getDocs(qRef);

        const data = snap.docs.map((d) => {
          const raw = d.data();
          const createdAtTS =
  raw?.createdAt?.toDate?.() ||
  (raw?.createdAt?.seconds ? new Date(raw.createdAt.seconds * 1000) : null);
          return { id: d.id, ...raw, createdAtTS };
        });

        data.sort(
          (a, b) => (b.createdAtTS?.getTime?.() || 0) - (a.createdAtTS?.getTime?.() || 0)
        );

        setList(data);

        if (!patientName) {
          const guess = data.find((x) => x.patientName)?.patientName;
          if (guess) setPatientName(guess);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [natHash]);

  const filtered = useMemo(() => {
  let rows = list;
let from = parseDTLocal(fromDT);
let to = parseDTLocal(toDT);


if (from && to && from > to) {
  const tmp = from;
  from = to;
  to = tmp;
}

if (from) rows = rows.filter((r) => r.createdAtTS && r.createdAtTS >= from);
if (to) rows = rows.filter((r) => r.createdAtTS && r.createdAtTS <= to);


  const v = qText.trim().toLowerCase();
  if (v) {
    rows = rows.filter((r) =>
      (r.medicineLabel || r.medicineName || "").toLowerCase().includes(v)
    );
  }

  return rows;
}, [list, qText, fromDT, toDT]);


  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  const pageItems = filtered.slice(start, end);

  useEffect(() => setPage(0), [qText, fromDT, toDT]);
//
  useEffect(() => setPage((p) => Math.min(p, pageCount - 1)), [pageCount]);

  return (
    <main className="mx-auto w-full max-w-6xl px-3 md:px-5 pt-5 pb-10 min-h-[90vh] flex flex-col">
   
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold" style={{ color: C.ink }}>
            {pageRole === "pharmacy" ? "Prescriptions (Pharmacy)" : "Prescriptions"}{" "}
            {patientName ? `for ${patientName}` : ""}
          </h1>
        </div>
        <button
          onClick={() =>
            navigate(pageRole === "pharmacy" ? "/pharmacy" : "/doctor", { replace: true })
          }
          className="px-5 py-2.5 rounded-xl text-white font-medium shadow-sm transition-all hover:scale-[1.03]"
          style={{ backgroundColor: C.primary }}
        >
          ← Back
        </button>
      </div>

      {/* Search bar */}
      <div className="bg-white border rounded-2xl p-5 mb-6 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke={C.primary} strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 103.5 10.5a7.5 7.5 0 0013.15 6.15z" />
          </svg>
          <h2 className="text-lg font-semibold" style={{ color: C.ink }}>Search Prescriptions</h2>
        </div>

        <input
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:border-transparent transition-all"
          style={{ outlineColor: C.primary }}
          placeholder="Filter by medicine name…"
          value={qText}
          onChange={(e) => {
            const onlyLetters = e.target.value.replace(/[^a-zA-Z]/g, "");
            setQText(onlyLetters);
          }}
        />
      </div>

   
<div className="sticky top-0 z-30 mb-6">
  <div className="bg-white/95 backdrop-blur border rounded-2xl shadow-sm p-4">
    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
      
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            const today = new Date().toISOString().slice(0, 10);
            setFromDT(`${today} 00:00`);
            setToDT(`${today} 23:59`);
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-gray-50"
          style={{ color: C.ink }}
        >
          Today
        </button>
        <button
          onClick={() => setQuickFilter(24)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-gray-50"
          style={{ color: C.ink }}
        >
          Last 24h
        </button>
        <button
          onClick={() => setQuickFilter(48)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 bg-red-50 text-red-700 hover:bg-orange-100"
        >
          Last 48h
        </button>
      </div>

      <div className="h-8 w-[1px] bg-gray-200 hidden lg:block"></div>

    
      <div className="flex flex-1 flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px]">
        
<input
  type="datetime-local"
  max="9999-12-31T23:59"
  value={fromDT.replace(" ", "T")}
  onChange={(e) => {
    const val = e.target.value.slice(0, 16); 
    setFromDT(val.replace("T", " "));
  }}
  className="w-full pl-3 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2"
  style={{ outlineColor: C.primary }}
/>
        </div>

        <span className="text-gray-400 text-sm">to</span>

        <div className="relative flex-1 min-w-[180px]">
<input
  type="datetime-local"
  max="9999-12-31T23:59"
  value={toDT.replace(" ", "T")}
  onChange={(e) => {
    const val = e.target.value.slice(0, 16);
    setToDT(val.replace("T", " "));
  }}
  className="w-full pl-3 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2"
  style={{ outlineColor: C.primary }}
/>
        </div>

      <button
  type="button"
  onClick={() => { setFromDT(""); setToDT(""); setQText(""); }}
  className="px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm"
  style={{
    backgroundColor: C.primary,
    color: "#fff",
  }}
>
  Clear Filters
</button>
      </div>
    </div>
  </div>
</div>

      {/* List */}
      <div className="flex-1">
        {loading ? (
          <div className="text-gray-500 text-sm">Loading…</div>
        ) : total === 0 ? (
          <div className="text-gray-500 text-sm">No prescriptions found.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pageItems.map((rx) => {
                const prescriber = rx.doctorName ? `Dr. ${rx.doctorName}` : shortAddr(rx.doctorId);
                const facility = rx.doctorFacility ? ` — ${rx.doctorFacility}` : "";
                const dateTime = rx.createdAtTS
                  ? rx.createdAtTS.toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—";

                const eligible =
                  pageRole === "pharmacy" &&
                  String(rx.sensitivity || "").toLowerCase() === "nonsensitive" &&
                  rx.dispensed === false &&
                  Number.isFinite(rx.onchainId);

                const isThisLoading =
                  Boolean(dispensingId && dispensingId === (rx.id || rx._docId));

                const rxId = rx.prescriptionID || rx.ref || rx.id || "—";
                const patientLine = `${rx.patientName || "—"}${rx.nationalID ? " — " + String(rx.nationalID) : ""}`;
                const doctorPhone = rx.doctorPhone || rx.phone || "-";

                return (
                  <div key={rx.id} className="p-4 border rounded-xl bg-white shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="text-lg font-bold text-slate-800 truncate">
                        {rx.medicineLabel || rx.medicineName || "—"}
                      </div>

                      {pageRole === "pharmacy" && (
                        <>
                          <div className="text-sm text-slate-700 mt-1 font-semibold">
                            Prescription ID: <span className="font-normal">{rxId}</span>
                          </div>
                          <div className="text-sm text-slate-700 mt-1 font-semibold">
                            Patient: <span className="font-normal">{patientLine}</span>
                          </div>
                          <div className="text-sm text-slate-700 mt-1 font-semibold">
                            Doctor Phone: <span className="font-normal">{doctorPhone}</span>
                          </div>
                        </>
                      )}

                      <div className="text-sm text-slate-700 mt-1 font-semibold">
                        Prescribed by <span className="font-normal">{prescriber}{facility}</span>
                      </div>

                      <div className="text-sm text-slate-700 mt-1 font-semibold">
                        Dosage: <span className="font-normal">
                          {rx.dosage || rx.dose || "—"} • {rx.frequency || "—"} • {rx.durationDays || rx.duration || "—"}
                        </span>
                      </div>

                      <div className="text-sm text-slate-700 mt-2 font-semibold">
                        Medical Condition: <span className="font-normal">{rx.medicalCondition || "—"}</span>
                      </div>

                      {rx.notes && (
                        <div className="text-sm text-slate-700 mt-2 font-semibold">
                          Notes: <span className="font-normal">{rx.notes}</span>
                        </div>
                      )}
                    </div>

                    {pageRole === "pharmacy" && (
                      <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <button
                          onClick={() => onDispense?.(rx)}
                          disabled={!eligible || isThisLoading}
                          className="px-5 py-2 text-white rounded-xl disabled:opacity-50 transition-colors flex items-center gap-2 font-medium shadow-sm"
                          style={{ backgroundColor: "#B08CC1" }}
                          title={rx.dispensed ? "Prescription already dispensed" : "Confirm & Dispense"}
                        >
                          {isThisLoading
                            ? "Processing…"
                            : rx.dispensed
                            ? "✓ Dispensed"
                            : "Confirm & Dispense"}
                        </button>
                      </div>
                    )}

                 <div className="text-right text-xs text-gray-500 mt-3">
                    Prescription issued on {dateTime}
                  </div>

                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="mt-auto pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-100">
        <div className="text-sm text-gray-700">Showing {end} out of {total} prescriptions</div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">Page {page + 1} of {pageCount}</span>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded-lg border text-sm disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              ← Prev
            </button>
            <button
              className="px-4 py-2 rounded-lg text-white text-sm disabled:opacity-50"
              style={{ background: C.primary }}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
