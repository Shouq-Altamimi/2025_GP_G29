import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

const C = { primary: "#B08CC1", ink: "#4A2C59", pale: "#F6F1FA" };

/* SHA-256 helper */
async function sha256Hex(input) {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function PrescriptionsPage() {
  const { state } = useLocation();
  const navigate = useNavigate();

  // fallback من السيشن إذا ما وصل state
  const cached = sessionStorage.getItem("td_patient");
  const fallback = cached ? JSON.parse(cached) : null;

  const patientId   = state?.patientId   || fallback?.id   || "";
  const patientName = state?.patientName || fallback?.name || "";

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qText, setQText] = useState("");

  useEffect(() => {
    if (!patientId) { navigate(-1); return; }
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
      const okText = !qText || med.includes(qText.toLowerCase());
      return okText;
    });
  }, [list, qText]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 md:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: C.ink }}>
          Prescriptions {patientName ? `for ${patientName}` : ""}
        </h1>
        <div className="mt-4 flex gap-3">
          <input
            className="flex-1 px-4 py-3 border rounded-xl"
            placeholder="Filter by medicine name..."
            value={qText}
            onChange={e => setQText(e.target.value)}
          />
          <button
            className="px-5 py-3 rounded-xl text-white"
            style={{ background: C.primary }}
            onClick={() => navigate(-1)}
          >
            ← Back
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-500">No prescriptions found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(rx => (
            <div key={rx.id} className="p-4 border rounded-2xl bg-white shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-lg font-semibold text-gray-800">
                    {rx.medicineLabel || rx.medicineName || "—"}
                  </div>

                  {/* ✅ Prescribed by Dr. X from Y */}
                  <div className="text-sm text-gray-600 mt-1">
                    Prescribed by {rx.doctorName ? `Dr. ${rx.doctorName}` : "—"}
                    {rx.doctorFacility ? ` from ${rx.doctorFacility}` : ""}
                    {rx.doctorSpeciality ? ` — ${rx.doctorSpeciality}` : ""}
                  </div>

                  <div className="text-sm text-gray-600 mt-1">
                    {(rx.dosage || "—")} • {(rx.frequency || "—")} • {(rx.durationDays || rx.duration || "—")}
                  </div>

                  {/* ✅ الاسم الظاهر “Medical Condition” بدل Reason */}
                  {rx.reason && (
                    <div className="text-sm text-gray-600 mt-1">
                      Medical Condition: {rx.reason}
                    </div>
                  )}
                  {rx.notes && <div className="text-sm text-gray-500 mt-1 italic">{rx.notes}</div>}
                </div>

                <div className="text-right">
                  <div className="text-xs text-gray-500">
                    {rx.createdAtTS ? rx.createdAtTS.toLocaleString() : "—"}
                  </div>
                </div>
              </div>
              {/* سطر الـ Tx مخفي حسب طلبك */}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
