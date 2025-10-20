import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

const C = { primary: "#B08CC1", ink: "#0f172a", pale: "#F6F1FA" };

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

export default function PrescriptionsPage() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const cached = sessionStorage.getItem("td_patient");
  const fallback = cached ? JSON.parse(cached) : null;

  const patientId   = state?.patientId   || fallback?.id   || "";
  const patientName = state?.patientName || fallback?.name || "";

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qText, setQText] = useState("");

  useEffect(() => {
    if (!patientId) { navigate("/doctor"); return; }
    (async () => {
      setLoading(true);
      try {
        const natHash = "0x" + (await sha256Hex(String(patientId)));
        const colRef = collection(db, "prescriptions");
        const qRef = query(colRef, where("patientNationalIdHash", "==", natHash));
        const snap = await getDocs(qRef);

        const data = snap.docs.map((d) => {
          const raw = d.data();
          const createdAtTS = raw.createdAt?.toDate?.() || null;
          return { id: d.id, ...raw, createdAtTS };
        });
        data.sort((a, b) => (b.createdAtTS?.getTime?.() || 0) - (a.createdAtTS?.getTime?.() || 0));
        setList(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [patientId, navigate]);

  const filtered = useMemo(() => {
    return list.filter(r => {
      const med = (r.medicineLabel || r.medicineName || "").toLowerCase();
      return !qText || med.includes(qText.toLowerCase());
    });
  }, [list, qText]);

  return (
    <main className="mx-auto w-full max-w-6xl px-3 md:px-5 py-5">
      <div className="mb-4">
        <h1 className="text-xl md:text-2xl font-semibold" style={{ color: C.ink }}>
          Prescriptions {patientName ? `for ${patientName}` : ""}
        </h1>

        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 px-4 py-3 border rounded-xl text-base"
            placeholder="Filter by medicine name…"
            value={qText}
            onChange={e => setQText(e.target.value)}
          />
          <button
            className="px-5 py-3 rounded-xl text-white text-sm"
            style={{ background: C.primary }}
            onClick={() => navigate(-1)}
          >
            ← Back
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-500 text-sm">No prescriptions found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {filtered.map(rx => {
            const prescriber = rx.doctorName ? `Dr. ${rx.doctorName}` : shortAddr(rx.doctorId);
            const facility = rx.doctorFacility ? ` — ${rx.doctorFacility}` : "";
            return (
              <div key={rx.id} className="p-3 md:p-4 border rounded-xl bg-white shadow-sm">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="text-lg md:text-xl font-semibold text-slate-800 truncate">
                      {rx.medicineLabel || rx.medicineName || "—"}
                    </div>

                    <div className="text-[13px] md:text-sm text-slate-600 mt-1">
                      Prescribed by {prescriber}{facility}
                    </div>

                    <div className="text-[13px] md:text-sm text-slate-600 mt-1">
                      {(rx.dosage || "—")} • {(rx.frequency || "—")} • {(rx.durationDays || rx.duration || "—")}
                    </div>

                    <div className="text-[13px] md:text-sm text-slate-700 mt-2">
                      Medical Condition: {rx.medicalCondition || rx.reason || "—"}
                    </div>

                    {rx.notes && (
                      <div className="text-[12px] md:text-sm text-slate-500 mt-1 italic line-clamp-2">
                        {rx.notes}
                      </div>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-[12px] md:text-xs text-gray-500">
                      {rx.createdAtTS ? rx.createdAtTS.toLocaleString() : "—"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
