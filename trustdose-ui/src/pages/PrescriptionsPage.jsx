import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";

const C = { primary:"#B08CC1", ink:"#4A2C59", pale:"#F6F1FA" };

export default function PrescriptionsPage() {
  const { state } = useLocation(); // { patientId, patientName, localList? }
  const navigate = useNavigate();

  // خذي المريض من النافيقيشن أو من السيشن
  const cached = sessionStorage.getItem("td_patient");
  const fallback = cached ? JSON.parse(cached) : null;

  const patientId = state?.patientId || fallback?.id || "";
  const patientName = state?.patientName || fallback?.name || "";

  const [list, setList] = useState(state?.localList || []); // لو تم الإنشاء للتو
  const [loading, setLoading] = useState(true);
  const [qText, setQText] = useState("");
  const [status, setStatus] = useState("all");

useEffect(() => {
  if (!patientId) { navigate("/doctor"); return; }
  (async () => {
    setLoading(true);
    try {
      const colRef = collection(db, "prescriptions");
      // بدون orderBy لتجنّب الفهرس المركّب
      const qRef  = query(colRef, where("patientId","==", patientId));
      const snap  = await getDocs(qRef);

      const data = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAtTS: d.data().createdAt?.toDate?.() || null
      }));

      // نرتّب محلياً نزولياً حسب createdAtTS أو createdAt النصّي لو موجود
      data.sort((a,b) => {
        const ta = a.createdAtTS ? a.createdAtTS.getTime() : 0;
        const tb = b.createdAtTS ? b.createdAtTS.getTime() : 0;
        return tb - ta;
      });

      // ادمجي أي قائمة محلية (لو جاية من صفحة الإنشاء)
      setList(prev => (prev.length > 0 ? prev : data));
    } finally {
      setLoading(false);
    }
  })();
}, [patientId, navigate]);


  const filtered = useMemo(() => {
    return list.filter(r => {
      const okStatus = status === "all" || r.status === status;
      const okText = !qText || (r.medicine || "").toLowerCase().includes(qText.toLowerCase());
      return okStatus && okText;
    });
  }, [list, status, qText]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 md:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{color:C.ink}}>
          Prescriptions {patientName ? `for ${patientName}` : ""}
        </h1>
        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <input className="flex-1 px-4 py-3 border rounded-xl" placeholder="Filter by medicine name..." value={qText} onChange={e=>setQText(e.target.value)} />
          <select className="px-4 py-3 border rounded-xl" value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="Active">Active</option>
            <option value="Stopped">Stopped</option>
            <option value="Completed">Completed</option>
          </select>
          <button className="px-5 py-3 rounded-xl text-white" style={{background:C.primary}} onClick={()=>navigate(-1)}>← Back</button>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-500">No prescriptions found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(rx => (
            <div key={rx.id || rx.ref} className="p-4 border rounded-2xl bg-white shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-lg font-semibold text-gray-800">{rx.medicine}</div>
                  <div className="text-sm text-gray-600 mt-1">{rx.dose} • {rx.timesPerDay} • {rx.durationDays}</div>
                  {rx.reason && <div className="text-sm text-gray-600 mt-1">Reason: {rx.reason}</div>}
                  {rx.notes && <div className="text-sm text-gray-500 mt-1 italic">{rx.notes}</div>}
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">{rx.createdAtTS ? rx.createdAtTS.toLocaleString() : rx.createdAt || "—"}</div>
                  <span className="text-xs px-2 py-1 inline-block rounded-full mt-2" style={{background:C.pale, color:C.ink}}>
                    {rx.status}
                  </span>
                </div>
              </div>
              <div className="text-xs text-gray-400 mt-2">Ref: {rx.ref}</div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
