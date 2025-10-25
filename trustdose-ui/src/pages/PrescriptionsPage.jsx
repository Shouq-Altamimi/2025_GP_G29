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

/* ===== Utils ===== */
async function sha256Hex(input) {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function shortAddr(a) {
  if (!a) return "—";
  const s = String(a);
  return s.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

/* ===== Page ===== */
export default function PrescriptionsPage() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const cached = sessionStorage.getItem("td_patient");
  const fallback = cached ? JSON.parse(cached) : null;

  const patientId = state?.patientId || fallback?.id || "";
  const patientName = state?.patientName || fallback?.name || "";

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qText, setQText] = useState("");
  const [page, setPage] = useState(0);

  const handleBack = () => {
    navigate("/doctor", { replace: true });
  };

  /* --- Load prescriptions --- */
  useEffect(() => {
    if (!patientId) {
      navigate("/doctor", { replace: true });
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const natHash = "0x" + (await sha256Hex(String(patientId)));
        const colRef = collection(db, "prescriptions");
        const qRef = query(colRef, where("patientNationalIdHash", "==", natHash));
        const snap = await getDocs(qRef);

        const data = snap.docs.map((d) => {
          const raw = d.data();
          const createdAtTS = raw?.createdAt?.toDate?.() || null;
          return { id: d.id, ...raw, createdAtTS };
        });

        data.sort(
          (a, b) => (b.createdAtTS?.getTime?.() || 0) - (a.createdAtTS?.getTime?.() || 0)
        );

        setList(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [patientId, navigate]);

  const filtered = useMemo(() => {
    const v = qText.trim().toLowerCase();
    if (!v) return list;
    return list.filter((r) =>
      (r.medicineLabel || r.medicineName || "").toLowerCase().includes(v)
    );
  }, [list, qText]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  const pageItems = filtered.slice(start, end);

  useEffect(() => {
    setPage(0);
  }, [qText]);
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  return (
    <main className="mx-auto w-full max-w-6xl px-3 md:px-5 pt-5 pb-10 min-h-[90vh] flex flex-col">
      {/* ===== Title ===== */}
      <h1
        className="text-2xl font-bold mb-5"
        style={{ color: C.ink }}
      >
        Prescriptions {patientName ? `for ${patientName}` : ""}
      </h1>

      {/* ===== Search + Back ===== */}
      <div className="bg-white border rounded-2xl p-5 mb-6 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke={C.primary}
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 103.5 10.5a7.5 7.5 0 0013.15 6.15z"
            />
          </svg>
          <h2 className="text-lg font-semibold" style={{ color: C.ink }}>
            Search Prescriptions
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:border-transparent transition-all"
            style={{ outlineColor: C.primary }}
            placeholder="Filter by medicine name…"
            value={qText}
            onChange={(e) => setQText(e.target.value)}
          />

          <button
            className="px-6 py-3 text-white rounded-xl font-medium shadow-sm transition-colors"
            style={{ backgroundColor: C.primary }}
            onClick={handleBack}
          >
            ← Back
          </button>
        </div>
      </div>

      {/* ===== Prescriptions List ===== */}
      <div className="flex-1">
        {loading ? (
          <div className="text-gray-500 text-sm">Loading…</div>
        ) : total === 0 ? (
          <div className="text-gray-500 text-sm">No prescriptions found.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pageItems.map((rx) => {
                const prescriber = rx.doctorName
                  ? `Dr. ${rx.doctorName}`
                  : shortAddr(rx.doctorId);
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

                return (
                  <div
                    key={rx.id}
                    className="p-4 border rounded-xl bg-white shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="text-lg font-bold text-slate-800 truncate">
                        {rx.medicineLabel || rx.medicineName || "—"}
                      </div>

                      <div className="text-sm text-slate-700 mt-1 font-semibold">
                        Prescribed by{" "}
                        <span className="font-normal">
                          {prescriber}
                          {facility}
                        </span>
                      </div>

                      <div className="text-sm text-slate-700 mt-1 font-semibold">
                        Dosage:{" "}
                        <span className="font-normal">
                          {rx.dosage || "—"} • {rx.frequency || "—"} •{" "}
                          {rx.durationDays || rx.duration || "—"}
                        </span>
                      </div>

                      <div className="text-sm text-slate-700 mt-2 font-semibold">
                        Medical Condition:{" "}
                        <span className="font-normal">
                          {rx.medicalCondition || rx.reason || "—"}
                        </span>
                      </div>

                      {rx.notes && (
                        <div className="text-sm text-slate-700 mt-2 font-semibold">
                          Notes: <span className="font-normal">{rx.notes}</span>
                        </div>
                      )}
                    </div>

                    <div className="text-right text-xs text-gray-500 mt-3">
                      {dateTime}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ===== Pagination (Sticky Bottom) ===== */}
      <div className="mt-auto pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-100">
        <div className="text-sm text-gray-700">
          Showing {end} out of {total} prescriptions
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            Page {page + 1} of {pageCount}
          </span>
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
