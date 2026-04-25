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

import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { ethers } from "ethers";
import DELIVERY_CONFIRMATION from "../contracts/DeliveryConfirmation.json";
import { logEvent } from "../utils/logEvent";

const C = {
  primary: "#B08CC1",
  primaryDark: "#9F76B4",
  teal: "#52B9C4",
  ink: "#4A2C59",
};

const PAGE_SIZE = 6;
const DELIVERY_CONFIRMATION_ADDRESS = "0x27eB5Bfb2935FE1703281F7bB6CA955dB166cF28";

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

function last4(id) {
  const s = String(id ?? "").replace(/\D/g, "");
  if (!s) return "----";
  return s.length <= 4 ? s : s.slice(-4);
}

async function getSignerEnsured() {
  if (!window.ethereum) throw new Error("MetaMask not detected.");
  await window.ethereum.request({ method: "eth_requestAccounts" });
  const provider = new ethers.BrowserProvider(window.ethereum);
  return provider.getSigner();
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

  const [showSuccessPopup, setShowSuccessPopup] = React.useState(false);
  const [showMedsPopup, setShowMedsPopup] = React.useState(false);
  const [selectedGroup, setSelectedGroup] = React.useState(null);

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

        const byId = await getDoc(doc(db, "logistics", String(lgId)));
        if (byId.exists()) {
          data = byId.data();
        } else {
          const col = collection(db, "logistics");
          const qs = await getDocs(
            query(col, where("LogisticsID", "==", String(lgId)))
          );
          if (!qs.empty) data = qs.docs[0].data();
        }

        if (!data) return;

        setHeader({
          companyName: data.companyName || data.name || "",
          vehicleId: data.vehicleId || data.vehicleID || "",
        });
      } catch (e) {
        console.error("Failed to load header", e);
      }
    }

    loadHeader();
  }, []);

  React.useEffect(() => {
    let mounted = true;

    async function fetchAll() {
      setLoading(true);
      setMsg("");

      const col = collection(db, "prescriptions");

      async function runQ(wheres) {
        try {
          const q1 = query(col, ...wheres, orderBy("updatedAt", "desc"));
          return await getDocs(q1);
        } catch (err) {
          console.warn("Index missing – falling back without orderBy:", err);
          const snap = await getDocs(query(col, ...wheres));
          return snap;
        }
      }

      const candidates = [
        [
          where("sensitivity", "==", "Sensitive"),
          where("acceptDelivery", "==", true),
          where("dispensed", "==", true),
          where("logisticsAccepted", "==", true),
          where("deliveryConfirmed", "==", false),
        ],
        [
          where("sensitivity", "==", "sensitive"),
          where("acceptDelivery", "==", true),
          where("dispensed", "==", true),
          where("logisticsAccepted", "==", true),
          where("deliveryConfirmed", "==", false),
        ],
      ];

      let snap = null;
      for (const wh of candidates) {
        snap = await runQ(wh);
        if (snap && !snap.empty) break;
      }

      if (!snap || snap.empty) {
        if (mounted) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      const data = await Promise.all(
        snap.docs.map(async (d) => {
          const x = d.data() || {};

          let patientPhone = "-";
          const natId =
            x.patientNationalId ?? x.nationalID ?? x.nationalId ?? null;

          if (natId) {
            try {
              const pRef = doc(db, "patients", `Ph_${String(natId)}`);
              const pSnap = await getDoc(pRef);
              if (pSnap.exists()) {
                const p = pSnap.data() || {};
                patientPhone = p.contact || p.phone || p.mobile || "-";
              }
            } catch (e) {
              console.error("Failed to load patient phone", e);
            }
          }

          return {
            _docId: d.id,
            prescriptionId: x.prescriptionID || x.prescriptionId || d.id,
            onchainId:
              x.onchainId !== undefined &&
              x.onchainId !== null &&
              String(x.onchainId).trim() !== ""
                ? BigInt(String(x.onchainId))
                : null,
            patientName: x.patientName || x.patientFullName || "-",
            patientIdFull: String(
              x.patientNationalId ?? x.nationalID ?? x.nationalId ?? "-"
            ),
            patientIdMask:
              String(x.patientNationalIdLast4 ?? x.patientDisplayId ?? "").trim() ||
              last4(x.patientNationalId ?? x.nationalID ?? x.nationalId ?? ""),
            patientPhone,
            medicineLabel: x.medicineLabel || x.medicineName || "-",
            createdAtTS: x.createdAt?.toDate?.(),
            createdAt: formatFsTimestamp(x.createdAt),
            updatedAt: formatFsTimestamp(x.updatedAt),
            dispensed: !!x.dispensed,
            acceptDelivery: x.acceptDelivery === true,
            logisticsAccepted: x.logisticsAccepted === true,
            deliveryConfirmed: x.deliveryConfirmed === true,
          };
        })
      );

      data.sort((a, b) => {
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
    return () => (mounted = false);
  }, []);

  const visible = rows.filter(
    (r) =>
      r.acceptDelivery &&
      r.dispensed &&
      r.logisticsAccepted &&
      !r.deliveryConfirmed
  );

  const groups = React.useMemo(() => {
    const map = new Map();

    for (const r of visible) {
      const key = r.prescriptionId || r._docId;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }

    for (const [, arr] of map) {
      arr.sort((a, b) =>
        (a.medicineLabel || "").localeCompare(b.medicineLabel || "")
      );
    }

    const out = Array.from(map.entries()).map(([prescriptionId, meds]) => {
      const first = meds[0] || {};

      const allHaveOnchainId = meds.every(
        (m) => m.onchainId !== null && m.onchainId !== undefined
      );

      const onchainIds = Array.from(
        new Set(
          meds
            .map((m) => m.onchainId)
            .filter((v) => v !== null && v !== undefined)
            .map((v) => v.toString())
        )
      );

      const eligible = allHaveOnchainId && onchainIds.length > 0;

      const createdAtTS = meds.reduce((acc, m) => {
        const t = m.createdAtTS?.getTime?.() || 0;
        return t > (acc?.getTime?.() || 0) ? m.createdAtTS : acc;
      }, first.createdAtTS);

      return {
        prescriptionId,
        patientName: first.patientName || "-",
        patientIdFull: first.patientIdFull || "-",
        patientIdMask: first.patientIdMask || last4(first.patientIdFull),
        patientPhone: first.patientPhone || "-",
        createdAtTS,
        createdAt: first.createdAt,
        meds,
        extraMeds: meds.slice(2),
        onchainIds,
        eligible,
        missingCount: meds.filter((m) => m.onchainId == null).length,
      };
    });

    out.sort(
      (a, b) =>
        (b.createdAtTS?.getTime?.() || 0) - (a.createdAtTS?.getTime?.() || 0)
    );

    return out;
  }, [visible]);

  const total = groups.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  const pageItems = groups.slice(start, end);

  async function handleAcceptGroup(g) {
    try {
      setMsg("");
      setPending((p) => ({ ...p, [g.prescriptionId]: true }));

      if (!g.eligible) {
        throw new Error(
          `Not eligible: missing on-chain id for ${g.missingCount} item(s).`
        );
      }

      const signer = await getSignerEnsured();
      const contract = new ethers.Contract(
        DELIVERY_CONFIRMATION_ADDRESS,
        DELIVERY_CONFIRMATION.abi,
        signer
      );

      const ids = g.onchainIds.map((idStr) => BigInt(idStr));
      const tx = await contract.confirmMultipleDeliveries(ids);
      await tx.wait();

      await Promise.all(
        g.meds.map((r) =>
          updateDoc(doc(db, "prescriptions", r._docId), {
            deliveryConfirmed: true,
            deliveryConfirmedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        )
      );

      await logEvent(
        `Logistics confirmed delivery to patient for prescription ${g.prescriptionId} with ${g.meds.length} medicine(s)`,
        "logistics",
        "delivery_confirm"
      );

      const docIds = new Set(g.meds.map((x) => x._docId));
      setRows((prev) => prev.filter((row) => !docIds.has(row._docId)));

      setShowSuccessPopup(true);
    } catch (err) {
      console.error("Error:", err);

      await logEvent(
        `Delivery confirmation failed for prescription ${g.prescriptionId}: ${err?.message || "unknown error"}`,
        "logistics",
        "delivery_confirm_error"
      );

      if (err?.code === "ACTION_REJECTED" || err?.code === 4001) {
        setMsg("MetaMask request was declined. Please try again.");
      } else {
        setMsg(err?.message || "Error occurred. Please try again.");
      }
    } finally {
      setPending((p) => {
        const cp = { ...p };
        delete cp[g.prescriptionId];
        return cp;
      });
    }
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
        {msg && (
          <div className="mb-4 p-4 rounded-xl flex items-center gap-2 text-red-700 bg-red-100 border border-red-300">
            <AlertCircle size={20} />
            <span className="text-sm font-medium">{msg}</span>
          </div>
        )}

        <div className="mb-6 flex items-center gap-3">
          <div>
            <h1
              className="font-extrabold text-[24px]"
              style={{ color: "#334155" }}
            >
              {header.companyName
                ? `Welcome, ${header.companyName}`
                : "Welcome, Logistics Partner"}
            </h1>

            <div className="mt-3 pt-3 border-t border-gray-200">
              <p
                className="text-[15px] font-medium"
                style={{ color: "#64748b" }}
              >
                Delivered orders awaiting your confirmation
              </p>
            </div>
          </div>
        </div>

        {pageItems.length > 0 && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {pageItems.map((g) => {
              const dateTime =
                g.createdAtTS?.toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }) || g.createdAt;

              const isPending = !!pending[g.prescriptionId];

              return (
                <div
                  key={g.prescriptionId}
                  className="p-4 border rounded-xl bg-white shadow-sm flex flex-col"
                  style={{ minHeight: 260 }}
                >
                  <div className="flex-1">
                    <div className="space-y-1 mb-3" style={{ minHeight: 56 }}>
                      {(g.meds || []).slice(0, 2).map((m, idx) => (
                        <div
                          key={`${g.prescriptionId}-med-${idx}`}
                          className="text-lg font-bold text-slate-800 leading-snug line-clamp-1"
                          title={m.medicineLabel}
                        >
                          {m.medicineLabel}
                        </div>
                      ))}

                      {(g.meds || []).length === 1 && (
                        <div className="text-lg font-bold text-slate-800 opacity-0 select-none">
                          placeholder
                        </div>
                      )}

                      {(g.extraMeds || []).length > 0 && (() => {
                        const count = g.extraMeds.length;
                        const label = count === 1 ? "medication" : "medications";

                        return (
                          <button
                            type="button"
                            onClick={() => {
                              if (!g.extraMeds.length) return;
                              setSelectedGroup(g);
                              setShowMedsPopup(true);
                            }}
                            className="text-xs mt-2 font-medium underline underline-offset-2"
                            style={{ color: C.primary }}
                          >
                            Press here to view {count} more {label}
                          </button>
                        );
                      })()}
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Prescription ID:
                      <span className="font-normal"> {g.prescriptionId}</span>
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Patient:
                      <span className="font-normal">
                        {" "}
                        {g.patientName} — ---- {g.patientIdMask}
                      </span>
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Patient Phone:
                      <span className="font-normal"> {g.patientPhone || "-"}</span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <button
                      className="w-max px-4 py-2 text-sm rounded-lg flex items-center gap-1.5 font-medium shadow-sm text-white disabled:opacity-60"
                      style={{
                        backgroundColor: isPending
                          ? "rgba(176,140,193,0.6)"
                          : C.primary,
                        cursor: isPending ? "not-allowed" : "pointer",
                      }}
                      onClick={() => handleAcceptGroup(g)}
                      disabled={isPending || !g.eligible}
                      title={
                        !g.eligible
                          ? `Missing on-chain id for ${g.missingCount} item(s)`
                          : ""
                      }
                    >
                      {isPending && (
                        <Loader2 size={16} className="animate-spin text-white" />
                      )}
                      {isPending
                        ? "Processing..."
                        : g.eligible
                        ? "Confirm Delivery to Patient"
                        : "Not eligible"}
                    </button>

                    <div className="text-right text-xs text-gray-500 mt-4">
                      Prescription issued on {dateTime}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {total === 0 && (
          <p className="text-gray-600 mt-4">No active delivery orders.</p>
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

      {showMedsPopup &&
        selectedGroup &&
        (selectedGroup.extraMeds || []).length > 0 && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
            onClick={() => {
              setShowMedsPopup(false);
              setSelectedGroup(null);
            }}
          >
            <div
              className="w-full max-w-2xl max-h-[85vh] rounded-3xl bg-white shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-200">
                <div>
                  <h3
                    className="text-2xl font-extrabold"
                    style={{ color: C.ink }}
                  >
                    More Medications
                  </h3>

                  <p className="text-sm text-slate-500 mt-1">
                    Prescription ID: {selectedGroup.prescriptionId}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowMedsPopup(false);
                    setSelectedGroup(null);
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>

              <div className="more-meds-scroll flex-1 overflow-y-auto px-6 py-6">
                <div className="grid grid-cols-1 gap-5">
                  {Array.from(
                    {
                      length: Math.ceil((selectedGroup.extraMeds || []).length / 2),
                    },
                    (_, boxIndex) => {
                      const pair = (selectedGroup.extraMeds || []).slice(
                        boxIndex * 2,
                        boxIndex * 2 + 2
                      );

                      return (
                        <div
                          key={`popup-box-${boxIndex}`}
                          className="p-4 border rounded-xl bg-white shadow-sm flex flex-col"
                          style={{ minHeight: 260 }}
                        >
                          <div className="flex-1">
                            <div
                              className="space-y-1 mb-3"
                              style={{ minHeight: 56 }}
                            >
                              {pair.map((m, idx) => (
                                <div
                                  key={`${selectedGroup.prescriptionId}-popup-med-${boxIndex}-${idx}`}
                                  className="text-lg font-bold text-slate-800 leading-snug break-words"
                                  title={m.medicineLabel}
                                >
                                  {m.medicineLabel}
                                </div>
                              ))}

                              {pair.length === 1 && (
                                <div className="text-lg font-bold text-slate-800 opacity-0 select-none">
                                  placeholder
                                </div>
                              )}
                            </div>

                            <div className="text-sm text-slate-700 mt-1 font-semibold">
                              Prescription ID:
                              <span className="font-normal">
                                {" "}
                                {selectedGroup.prescriptionId}
                              </span>
                            </div>

                            <div className="text-sm text-slate-700 mt-1 font-semibold">
                              Patient:
                              <span className="font-normal">
                                {" "}
                                {selectedGroup.patientName} — ----{" "}
                                {selectedGroup.patientIdMask}
                              </span>
                            </div>

                            <div className="text-sm text-slate-700 mt-1 font-semibold">
                              Patient Phone:
                              <span className="font-normal">
                                {" "}
                                {selectedGroup.patientPhone || "-"}
                              </span>
                            </div>
                          </div>

                          <div className="text-right text-xs text-gray-500 mt-3">
                            Prescription issued on{" "}
                            {selectedGroup.createdAtTS
                              ? selectedGroup.createdAtTS.toLocaleString("en-GB", {
                                  day: "2-digit",
                                  month: "long",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : selectedGroup.createdAt}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      {showSuccessPopup && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div
            className="w-full max-w-sm px-6 py-5 rounded-2xl shadow-xl border"
            style={{
              background: "#F6F1FA",
              borderColor: C.primary,
            }}
          >
            <div className="flex flex-col items-center text-center">
              <div
                className="mx-auto mb-3 flex items-center justify-center w-12 h-12 rounded-full"
                style={{ backgroundColor: "#ECFDF3" }}
              >
                <CheckCircle2 size={28} style={{ color: "#16A34A" }} />
              </div>

              <h3
                className="text-lg font-semibold mb-1"
                style={{ color: C.ink }}
              >
                You have successfully confirmed the delivery to the patient
              </h3>

              <p className="text-sm mt-1" style={{ color: "#64748b" }}>
                The order has been successfully completed and confirmed.
              </p>

              <button
                onClick={() => setShowSuccessPopup(false)}
                className="mt-3 px-5 py-2.5 rounded-xl text-sm font-medium shadow-sm"
                style={{ backgroundColor: C.primary, color: "#fff" }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}