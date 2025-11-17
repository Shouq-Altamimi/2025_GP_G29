// src/pages/Logistics.jsx
/* global BigInt */
"use client";

import React from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import { Loader2, Check } from "lucide-react";

const C = {
  primary: "#B08CC1",
  primaryDark: "#9F76B4",
  teal: "#52B9C4",
  ink: "#4A2C59",
};

const PAGE_SIZE = 6;

/* Format Timestamps */
function formatFsTimestamp(v) {
  if (!v) return "-";
  try {
    if (typeof v?.toDate === "function") {
      const d = v.toDate();
      return d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (typeof v === "string") return v;
  } catch {}
  return String(v);
}

export default function Logistics() {
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState([]);
  const [msg, setMsg] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [pending, setPending] = React.useState({});

  const [header, setHeader] = React.useState({
    companyName: "",
    vehicleId: "",
  });

  /* Load header info */
  React.useEffect(() => {
    async function loadHeader() {
      try {
        const lgId =
          localStorage.getItem("userId") ||
          localStorage.getItem("logisticsId") ||
          localStorage.getItem("logisticsID") ||
          "";

        if (!lgId) return;

        let data = null;

        const byIdSnap = await getDoc(doc(db, "logistics", String(lgId)));
        if (byIdSnap.exists()) {
          data = byIdSnap.data() || {};
        } else {
          const col = collection(db, "logistics");
          const qs = await getDocs(
            query(col, where("LogisticsID", "==", String(lgId)))
          );
          if (!qs.empty) {
            data = qs.docs[0].data() || {};
          }
        }

        if (!data) return;

        setHeader({
          companyName: data.companyName || data.name || "",
          vehicleId: data.vehicleId || data.vehicleID || "",
        });
      } catch (e) {
        console.error("Failed to load logistics header", e);
      }
    }

    loadHeader();
  }, []);

  /* Load prescriptions */
  React.useEffect(() => {
    let mounted = true;

    async function fetchAll() {
      setLoading(true);
      setRows([]);
      setMsg("");

      const col = collection(db, "prescriptions");

      async function runQ(wheres, useOrder = true) {
        try {
          const q1 = useOrder
            ? query(col, ...wheres, orderBy("updatedAt", "desc"))
            : query(col, ...wheres);
          return await getDocs(q1);
        } catch {
          return await getDocs(query(col, ...wheres));
        }
      }

      const candidates = [
        [
          where("sensitivity", "==", "Sensitive"),
          where("acceptDelivery", "==", true),
          where("dispensed", "==", false),
        ],
        [
          where("sensitivity", "==", "sensitive"),
          where("acceptDelivery", "==", true),
          where("dispensed", "==", false),
        ],
      ];

      let snap = null;
      for (const wh of candidates) {
        snap = await runQ(wh);
        if (snap && !snap.empty) break;
      }

      if (!snap || snap.empty) {
        if (mounted) {
          setMsg("No delivery orders found.");
          setLoading(false);
        }
        return;
      }

      const data = snap.docs
        .map((d) => {
          const x = d.data() || {};
          let onchainId = null;

          if (x.onchainId) {
            try {
              onchainId = BigInt(String(x.onchainId));
            } catch {}
          }

          return {
            _docId: d.id,
            prescriptionId: x.prescriptionID || d.id,
            onchainId,
            patientName: x.patientName || "-",
            patientId: String(x.nationalID ?? "-"),
            medicineLabel: x.medicineLabel || x.medicineName || "-",
            createdAtTS: x?.createdAt?.toDate?.()
              ? x.createdAt.toDate()
              : undefined,
            createdAt: formatFsTimestamp(x.createdAt),
            updatedAt: formatFsTimestamp(x.updatedAt),
            dispensed: !!x.dispensed,
            acceptDelivery: x.acceptDelivery === true,
            logisticsAccepted: x.logisticsAccepted === true,
          };
        })
        .sort((a, b) => {
          const aT = a.createdAtTS?.getTime?.() || 0;
          const bT = b.createdAtTS?.getTime?.() || 0;
          return bT - aT;
        });

      if (mounted) {
        setRows(data);
        setLoading(false);
        setPage(0);
      }
    }

    fetchAll();
    return () => {
      mounted = false;
    };
  }, []);

  const visible = rows.filter(
    (r) => r.acceptDelivery && !r.dispensed && !r.logisticsAccepted
  );

  const total = visible.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  const pageItems = visible.slice(start, end);

  /* Handle accept (UI only for now – contract not implemented) */
  async function handleAccept(r) {
    // لاحقًا لما تسوين عقد البلوك تشين ترجعي تكمّلين المنطق هنا
    alert("Accept Delivery is not available yet (smart contract not implemented).");
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <div className="flex items-center gap-2" style={{ color: C.ink }}>
            <Loader2 className="animate-spin" /> Loading…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
        {/* HEADER */}
        <div className="mb-6 flex items-center gap-3">
          <img
            src="/Images/TrustDose-pill.png"
            alt="TrustDose Capsule"
            style={{ width: 64, height: "auto" }}
          />

          <div>
            <h1
              className="font-extrabold text-[24px]"
              style={{ color: "#334155" }}
            >
              {header.companyName
                ? `Welcome, ${header.companyName}`
                : "Welcome, Logistics Partner"}
            </h1>

            {/* Subtitle */}
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p
                className="text-[15px] font-medium"
                style={{ color: "#64748b" }}
              >
                Delivery Requests Awaiting Your Acceptance
              </p>
            </div>
          </div>
        </div>

        {pageItems.length > 0 && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {pageItems.map((r) => {
              const dateTime = r.createdAtTS
                ? r.createdAtTS.toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : r.createdAt;

              const isPending = !!pending[r.prescriptionId];
              const disabled = false;

              return (
                <div
                  key={r._docId}
                  className="p-4 border rounded-xl bg-white shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="text-lg font-bold text-slate-800">
                      {r.medicineLabel}
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Prescription ID:{" "}
                      <span className="font-normal">{r.prescriptionId}</span>
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Patient:{" "}
                      <span className="font-normal">
                        {r.patientName || "—"}
                        {r.patientId ? ` — ${r.patientId}` : ""}
                      </span>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-2">
                      <button
                        className="w-max px-4 py-2 text-sm rounded-lg transition-colors
                          flex items-center gap-1.5 font-medium shadow-sm text-white disabled:opacity-60 cursor-not-allowed"
                        style={{ backgroundColor: C.primary }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            C.primaryDark)
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = C.primary)
                        }
                        onClick={() => handleAccept(r)}
                        disabled={disabled}
                      >
                        {isPending ? (
                          <Loader2 size={16} className="animate-spin text-white" />
                        ) : (
                          <Check size={16} className="text-white" />
                        )}
                        <span className="text-white">Accept Delivery</span>
                      </button>
                    </div>
                  </div>

                  <div className="text-right text-xs text-gray-500 mt-4">
                    Prescription issued on {dateTime}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {total > 0 && (
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-sm text-gray-700">
              Showing {end} out of {total} orders
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
                  onClick={() =>
                    setPage((p) => Math.min(pageCount - 1, p + 1))
                  }
                  disabled={page >= pageCount - 1}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        )}

        {total === 0 && !msg && (
          <p className="text-gray-600 mt-4">No active delivery orders.</p>
        )}

        {msg && <p className="text-gray-600">{msg}</p>}
      </div>
    </div>
  );
}
