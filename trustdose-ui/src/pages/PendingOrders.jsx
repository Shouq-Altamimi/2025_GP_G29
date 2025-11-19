// src/pages/PendingOrders.jsx
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
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

// ===== Ethers / Contracts =====
import { ethers } from "ethers";
import LOGISTICS_RECEIVE from "../contracts/LogisticsReceive.json";

const LOGISTICS_RECEIVE_ADDRESS = "0x770300D74C1F9E0ED7acaB7393dBA38B957656BE";

const C = {
  primary: "#B08CC1",
  primaryDark: "#9F76B4",
  teal: "#52B9C4",
  ink: "#4A2C59",
};
const PAGE_SIZE = 6;

/* ========== helpers ========== */
function formatFsTimestamp(v) {
  if (!v) return "-";
  try {
    if (typeof v?.toDate === "function") {
      return v.toDate().toLocaleString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  } catch {}
  return String(v);
}

async function getSignerEnsured() {
  if (!window.ethereum) throw new Error("MetaMask not detected.");
  await window.ethereum.request({ method: "eth_requestAccounts" });
  const provider = new ethers.BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();
  return provider.getSigner();
}

export default function PendingOrders({ pharmacyId }) {
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState([]);
  const [msg, setMsg] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [processingId, setProcessingId] = React.useState(null);

  React.useEffect(() => {
    let mounted = true;

    async function fetchPending() {
      setLoading(true);
      setRows([]);

      const col = collection(db, "prescriptions");

      async function runQ(wheres) {
        try {
          return await getDocs(query(col, ...wheres, orderBy("updatedAt", "desc")));
        } catch {
          return await getDocs(query(col, ...wheres));
        }
      }

      const candidates = [];

      if (pharmacyId) {
        candidates.push([
          where("pharmacyId", "==", pharmacyId),
          where("sensitivity", "==", "Sensitive"),
          where("acceptDelivery", "==", true),
          where("dispensed", "==", false),
        ]);
      }

      candidates.push([
        where("sensitivity", "==", "Sensitive"),
        where("acceptDelivery", "==", true),
        where("dispensed", "==", false),
      ]);

      let snap = null;
      for (const wh of candidates) {
        snap = await runQ(wh);
        if (!snap.empty) break;
      }

      if (!snap || snap.empty) {
        if (mounted) {
          setMsg("No pending delivery prescriptions.");
          setRows([]);
          setLoading(false);
        }
        return;
      }

      const items = snap.docs.map((d) => {
        const x = d.data() || {};

        let onchainId;
        if (typeof x.onchainId === "number") {
          onchainId = x.onchainId;
        } else if (typeof x.onchainId === "string" && x.onchainId.trim()) {
          const n = Number(x.onchainId);
          if (Number.isFinite(n)) onchainId = n;
        }

        return {
          _docId: d.id,
          prescriptionId: x.prescriptionID || d.id,
          patientName: x.patientName || "-",
          patientId: String(x.nationalID ?? x.patientDisplayId ?? "-"),
          doctorName: x.doctorName || "-",
          doctorFacility: x.doctorFacility || "",
          doctorPhone: x.doctorPhone || x.phone || "-",
          medicineLabel: x.medicineLabel || x.medicineName || "-",
          dose: x.dosage || x.dose || "-",
          frequency:
            x.frequency ||
            (x.timesPerDay ? `${x.timesPerDay} times/day` : "-"),
          durationDays: x.durationDays ?? x.duration ?? "-",
          medicalCondition: x.medicalCondition || x.reason || "",
          notes: x.notes || "",
          createdAtTS: x?.createdAt?.toDate?.()
            ? x.createdAt.toDate()
            : undefined,
          createdAt: formatFsTimestamp(x.createdAt),
          updatedAt: formatFsTimestamp(x.updatedAt),
          dispensed: !!x.dispensed,
          acceptDelivery: !!x.acceptDelivery,
          onchainId,
        };
      });

      const filtered = items.filter((r) => r.acceptDelivery && !r.dispensed);

      filtered.sort((a, b) => {
        return (b.createdAtTS?.getTime?.() ?? 0) - (a.createdAtTS?.getTime?.() ?? 0);
      });

      if (mounted) {
        setRows(filtered);
        setLoading(false);
      }
    }

    fetchPending();
    return () => (mounted = false);
  }, [pharmacyId]);

  async function handleMarkReceived(r) {
    try {
      if (!Number.isFinite(r.onchainId)) {
        alert("Missing on-chain id.");
        return;
      }

      setProcessingId(r._docId);

      const signer = await getSignerEnsured();
      const logisticsAddr = await signer.getAddress();

      const logistics = new ethers.Contract(
        LOGISTICS_RECEIVE_ADDRESS,
        LOGISTICS_RECEIVE.abi,
        signer
      );

      const tx = await logistics.receiveFromPharmacy(r.onchainId);
      const receipt = await tx.wait();
      const txHash = receipt?.hash || tx.hash;

      await updateDoc(doc(db, "prescriptions", r._docId), {
        dispensed: true,
        dispensedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        logisticsReceivedBy: logisticsAddr,
        logisticsReceiveTx: txHash,
      });

      setRows((old) => old.filter((x) => x._docId !== r._docId));
    } catch (err) {
      alert(err.message || "On-chain error.");
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="mx-auto w-full max-w-6xl px-4">
          <div className="flex items-center gap-2" style={{ color: C.ink }}>
            <span className="animate-spin border-2 border-t-transparent rounded-full w-4 h-4" />
            Loading…
          </div>
        </div>
      </div>
    );
  }

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  const pageItems = rows.slice(start, end);

  return (
    <div className="p-6">
      <div className="mx-auto w-full max-w-6xl px-4">
        {msg && <p className="text-gray-600">{msg}</p>}

        {pageItems.length > 0 && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pageItems.map((r) => {
              const prescriber = r.doctorName ? `Dr. ${r.doctorName}` : "-";
              const facility = r.doctorFacility ? ` — ${r.doctorFacility}` : "";
              const dateTime = r.createdAtTS
                ? r.createdAtTS.toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : r.createdAt || "-";

              const hasOnchainId = Number.isFinite(r.onchainId);
              const isProcessing = processingId === r._docId;

              return (
                <div
                  key={r._docId}
                  className="p-4 border rounded-xl bg-white shadow-sm"
                >
                  {/* أعلى الكارد */}
                  <div>
                    <div className="text-lg font-bold text-slate-800 truncate">
                      {r.medicineLabel}
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Prescription ID:{" "}
                      <span className="font-normal">{r.prescriptionId}</span>
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Patient:{" "}
                      <span className="font-normal">
                        {r.patientName} — {r.patientId}
                      </span>
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Doctor Phone:{" "}
                      <span className="font-normal">{r.doctorPhone}</span>
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Prescribed by{" "}
                      <span className="font-normal">
                        {prescriber} {facility}
                      </span>
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Dosage:{" "}
                      <span className="font-normal">
                        {r.dose} • {r.frequency} • {r.durationDays}
                      </span>
                    </div>

                    <div className="text-sm text-slate-700 mt-2 font-semibold">
                      Medical Condition:{" "}
                      <span className="font-normal">
                        {r.medicalCondition || "—"}
                      </span>
                    </div>

                    {/* مساحة النوتس — ثابتة لجميع الكروت */}
                    <div className="mt-1 min-h-[28px]">
                      {!!r.notes && (
                        <div className="text-sm text-slate-700 font-semibold">
                          Notes:{" "}
                          <span className="font-normal">{r.notes}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* زر Mark as Received */}
                  <div className="mt-1">
                    <button
                      className="w-max px-4 py-2 text-sm rounded-lg flex items-center gap-1.5 
                                 font-medium shadow-sm text-white disabled:opacity-50 transition-colors"
                      style={{
                        backgroundColor: isProcessing ? "#D8C2E6" : C.primary,
                      }}
                      onMouseEnter={(e) => {
                        if (!isProcessing)
                          e.currentTarget.style.backgroundColor =
                            C.primaryDark;
                      }}
                      onMouseLeave={(e) => {
                        if (!isProcessing)
                          e.currentTarget.style.backgroundColor = C.primary;
                      }}
                      onClick={() => handleMarkReceived(r)}
                      disabled={!hasOnchainId || isProcessing}
                    >
                      {isProcessing ? "Processing…" : "Mark as picked up"}
                    </button>
                  </div>

                  {/* التاريخ */}
                  <div className="text-right text-xs text-gray-500 mt-1">
                    Prescription issued on {dateTime}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* Pagination */}
        {total > 0 && (
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
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
        )}
      </div>
    </div>
  );
}
