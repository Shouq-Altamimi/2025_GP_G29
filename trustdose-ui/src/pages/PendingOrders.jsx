"use client";

import React from "react";
import { useOutletContext } from "react-router-dom";
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
  setDoc,
  getDoc,
} from "firebase/firestore";

import { ethers } from "ethers";
import LOGISTICS_RECEIVE from "../contracts/LogisticsReceive.json";
import DELIVERY_ACCEPT from "../contracts/DeliveryAccept.json";
import PRESCRIPTION from "../contracts/Prescription.json";
import { Loader2, FileText, CheckCircle2 } from "lucide-react";
import { logEvent } from "../utils/logEvent";

const LOGISTICS_RECEIVE_ADDRESS = "0xd78a48cBC1c3F77a5e59a149CFEdbc11AfB1b666";
const DEFAULT_IOT_DEVICE_ID = "esp8266_1";

const C = {
  primary: "#B08CC1",
  primaryDark: "#9F76B4",
  teal: "#52B9C4",
  ink: "#4A2C59",
};
const PAGE_SIZE = 6;

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

function extractReadableError(err) {
  const raw =
    err?.reason ||
    err?.shortMessage ||
    err?.info?.error?.message ||
    err?.error?.message ||
    err?.message ||
    "";

  const lower = String(raw).toLowerCase();

  if (err?.code === "ACTION_REJECTED" || err?.code === 4001) {
    return "MetaMask request was declined. Please try again.";
  }
  if (lower.includes("already received")) {
    return "This prescription was already received by logistics.";
  }
  if (lower.includes("invalid/expired")) {
    return "This prescription is invalid or expired on blockchain.";
  }
  if (lower.includes("not accepted for delivery")) {
    return "This prescription has not been accepted for delivery on blockchain yet.";
  }
  if (lower.includes("missing revert data")) {
    return "Blockchain validation failed. Please make sure the prescription is accepted for delivery and still valid.";
  }

  return raw || "Error occurred. Please try again.";
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
  await provider.getNetwork();
  return provider.getSigner();
}

export default function PendingOrders({ pharmacyId }) {
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState([]);
  const [msg, setMsg] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [processingId, setProcessingId] = React.useState(null);

  const [successModal, setSuccessModal] = React.useState(null);
  const [showMedsPopup, setShowMedsPopup] = React.useState(false);
  const [selectedGroup, setSelectedGroup] = React.useState(null);

  const outletCtx = useOutletContext?.() || {};
  const setPageError = outletCtx.setPageError || (() => {});

  React.useEffect(() => {
    let mounted = true;

    async function fetchPending() {
      setLoading(true);
      setRows([]);
      setMsg("");
      setPageError("");

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
          where("logisticsAccepted", "==", true),
        ]);
      }

      candidates.push([
        where("sensitivity", "==", "Sensitive"),
        where("acceptDelivery", "==", true),
        where("dispensed", "==", false),
        where("logisticsAccepted", "==", true),
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

        const patientIdMask =
          String(x.patientNationalIdLast4 ?? x.patientDisplayId ?? "").trim() ||
          last4(x.nationalID ?? x.patientNationalId ?? x.nationalId ?? "");

        return {
          _docId: d.id,
          prescriptionId: x.prescriptionID || d.id,
          patientName: x.patientName || "-",
          patientIdMask,
          doctorName: x.doctorName || "-",
          doctorFacility: x.doctorFacility || "",
          doctorPhone: x.doctorPhone || x.phone || "-",
          medicineLabel: x.medicineLabel || x.medicineName || "-",
          dose: x.dosage || x.dose || "-",
          frequency:
            x.frequency || (x.timesPerDay ? `${x.timesPerDay} times/day` : "-"),
          durationDays: x.durationDays ?? x.duration ?? "-",
          medicalCondition: x.medicalCondition || x.reason || "",
          notes: x.notes || "",
          createdAtTS: x?.createdAt?.toDate?.() ? x.createdAt.toDate() : undefined,
          createdAt: formatFsTimestamp(x.createdAt),
          updatedAt: formatFsTimestamp(x.updatedAt),
          dispensed: !!x.dispensed,
          acceptDelivery: !!x.acceptDelivery,
          logisticsAccepted: !!x.logisticsAccepted,
          onchainId,
          sensitivity: x.sensitivity || "NonSensitive",
        };
      });

      const filtered = items.filter(
        (r) => r.acceptDelivery && r.logisticsAccepted && !r.dispensed
      );

      filtered.sort((a, b) => {
        return (b.createdAtTS?.getTime?.() ?? 0) - (a.createdAtTS?.getTime?.() ?? 0);
      });

      if (mounted) {
        setRows(filtered);
        setLoading(false);
        setPage(0);
      }
    }

    fetchPending();
    return () => (mounted = false);
  }, [pharmacyId, setPageError]);

  const groups = React.useMemo(() => {
    const map = new Map();

    for (const r of rows) {
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

      const onchainIds = Array.from(
        new Set(
          meds
            .map((m) => m.onchainId)
            .filter((v) => Number.isFinite(v))
            .map((v) => String(v))
        )
      );

      const allHaveOnchainId = meds.every((m) => Number.isFinite(m.onchainId));
      const eligible = allHaveOnchainId && onchainIds.length > 0;

      const createdAtTS = meds.reduce((acc, m) => {
        const t = m.createdAtTS?.getTime?.() || 0;
        return t > (acc?.getTime?.() || 0) ? m.createdAtTS : acc;
      }, first.createdAtTS);

      return {
        prescriptionId,
        patientName: first.patientName || "-",
        patientIdMask: first.patientIdMask || "----",
        doctorName: first.doctorName || "-",
        doctorFacility: first.doctorFacility || "",
        doctorPhone: first.doctorPhone || "-",
        medicalCondition: first.medicalCondition || "",
        notes: first.notes || "",
        createdAtTS,
        createdAt: first.createdAt,
        meds,
        extraMeds: meds.slice(2),
        onchainIds,
        eligible,
        missingCount: meds.filter((m) => !Number.isFinite(m.onchainId)).length,
      };
    });

    out.sort(
      (a, b) =>
        (b.createdAtTS?.getTime?.() ?? 0) - (a.createdAtTS?.getTime?.() ?? 0)
    );

    return out;
  }, [rows]);

  async function handleMarkReceivedGroup(g) {
    try {
      setMsg("");
      setPageError("");

      if (!g?.eligible) {
        const m = `Missing on-chain id for ${g?.missingCount ?? 0} item(s).`;
        setMsg(m);
        setPageError(m);
        return;
      }

      setProcessingId(String(g.prescriptionId));

      const signer = await getSignerEnsured();
      const logisticsAddr = await signer.getAddress();

      const logistics = new ethers.Contract(
        LOGISTICS_RECEIVE_ADDRESS,
        LOGISTICS_RECEIVE.abi,
        signer
      );

      const ids = g.onchainIds.map((idStr) => Number(idStr));

      const acceptAddress = await logistics.deliveryAccept();
      const prescriptionAddress = await logistics.prescription();

      const acceptContract = new ethers.Contract(
        acceptAddress,
        DELIVERY_ACCEPT.abi,
        signer
      );

      const prescriptionContract = new ethers.Contract(
        prescriptionAddress,
        PRESCRIPTION.abi,
        signer
      );

      for (const id of ids) {
        const [accepted, valid, received] = await Promise.all([
          acceptContract.isAccepted(id),
          prescriptionContract.isValid(id),
          logistics.isReceived(id),
        ]);

        if (!accepted) {
          throw new Error(
            `Prescription ${id} has not been accepted for delivery on blockchain yet.`
          );
        }
        if (!valid) {
          throw new Error(`Prescription ${id} is invalid or expired on blockchain.`);
        }
        if (received) {
          throw new Error(`Prescription ${id} was already received by logistics.`);
        }
      }

      const tx = await logistics.receiveMultipleFromPharmacy(ids);
      const receipt = await tx.wait();
      const lastTxHash = receipt?.hash || tx.hash;

      const isSensitive = (g.meds || []).some(
        (m) => String(m?.sensitivity || "").toLowerCase() === "sensitive"
      );

      const thresholds = isSensitive
        ? {
            tempMin: 2,
            tempMax: 8,
            humMin: 20,
            humMax: 80,
            thresholdProfile: "Sensitive",
          }
        : {
            tempMin: 15,
            tempMax: 30,
            humMin: 20,
            humMax: 80,
            thresholdProfile: "NonSensitive",
          };

      const deviceId = DEFAULT_IOT_DEVICE_ID;
      const nowTs = serverTimestamp();

      const deviceRef = doc(db, "iotDevices", deviceId);

      const deviceSnap = await getDoc(deviceRef);
      let previousPrescriptionId = null;

      if (deviceSnap.exists()) {
        const d = deviceSnap.data() || {};
        previousPrescriptionId = d.activePrescriptionId
          ? String(d.activePrescriptionId)
          : null;
      }

      await setDoc(
        deviceRef,
        {
          deviceId,
          status: "active",
          activePrescriptionId: String(g.prescriptionId),
          linkedAt: nowTs,
          linkedByRole: "pharmacy",
          pharmacyId: pharmacyId || null,
          previousPrescriptionId: previousPrescriptionId || null,
          previousUnlinkedAt:
            previousPrescriptionId && previousPrescriptionId !== String(g.prescriptionId)
              ? nowTs
              : null,
        },
        { merge: true }
      );

      await Promise.all(
        g.meds.map((r) =>
          updateDoc(doc(db, "prescriptions", r._docId), {
            dispensed: true,
            dispensedAt: nowTs,
            updatedAt: nowTs,
            logisticsReceivedBy: logisticsAddr,
            logisticsReceiveTx: lastTxHash,
            iotDeviceId: deviceId,
            iotStatus: "active",
            iotLinkedAt: nowTs,
            inSmartBox: true,
            ...thresholds,
          })
        )
      );

      await logEvent(
        `Pharmacy dispensed prescription ${g.prescriptionId} to logistics with ${g.meds.length} medicine(s)`,
        "pharmacy",
        "prescription_dispensed_to_logistics"
      );

      const docIds = new Set(g.meds.map((x) => x._docId));
      setRows((old) => old.filter((x) => !docIds.has(x._docId)));

      setSuccessModal({
        title: "Prescription dispensed successfully",
        message: "The prescription has been dispensed and handed over to logistics.",
      });
    } catch (err) {
      console.error("Error:", err);

      await logEvent(
        `Dispense to logistics failed for prescription ${g?.prescriptionId}: ${err?.message || "unknown error"}`,
        "pharmacy",
        "prescription_dispensed_to_logistics_error"
      );

      const m = extractReadableError(err);
      setMsg(m);
      setPageError(m);
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

  const total = groups.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  const pageItems = groups.slice(start, end);

  return (
    <div className="p-6">
      <div className="mx-auto w-full max-w-6xl px-4">
        {successModal && (
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

                <h3 className="text-lg font-semibold mb-1" style={{ color: C.ink }}>
                  {successModal.title}
                </h3>

                <p className="text-sm mb-4" style={{ color: "#4B5563" }}>
                  {successModal.message}
                </p>

                <button
                  onClick={() => setSuccessModal(null)}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium shadow-sm"
                  style={{
                    backgroundColor: C.primary,
                    color: "#FFFFFF",
                  }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {pageItems.length > 0 && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pageItems.map((g) => {
              const prescriber = g.doctorName ? `Dr. ${g.doctorName}` : "-";
              const facility = g.doctorFacility ? ` — ${g.doctorFacility}` : "";
              const dateTime = g.createdAtTS
                ? g.createdAtTS.toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : g.createdAt || "-";

              const isProcessing = processingId === String(g.prescriptionId);

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
                      Prescription ID:{" "}
                      <span className="font-normal">{g.prescriptionId}</span>
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Patient:{" "}
                      <span className="font-normal">
                        {g.patientName} — ---- {g.patientIdMask}
                      </span>
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Doctor Phone:{" "}
                      <span className="font-normal">{g.doctorPhone}</span>
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Prescribed by{" "}
                      <span className="font-normal">
                        {prescriber}
                        {facility}
                      </span>
                    </div>

                    <div className="mt-1 space-y-1">
                      {(g.meds || []).slice(0, 2).map((m, idx) => {
                        const dose = m.dose || "-";
                        const freq = m.frequency || "-";
                        const dur = m.durationDays || "-";

                        return (
                          <div
                            key={`${g.prescriptionId}-dose-${idx}`}
                            className="text-sm text-slate-700 font-semibold"
                          >
                            Dosage ({m.medicineLabel || "—"}):{" "}
                            <span className="font-normal">
                              {dose} • {freq} • {dur}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="text-sm text-slate-700 mt-2 font-semibold">
                      Medical Condition:{" "}
                      <span className="font-normal">
                        {g.medicalCondition || "—"}
                      </span>
                    </div>

                    <div className="mt-1 min-h-[28px]">
                      {!!g.notes && (
                        <div className="text-sm text-slate-700 font-semibold">
                          Notes: <span className="font-normal">{g.notes}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-1">
                    <button
                      onClick={() => handleMarkReceivedGroup(g)}
                      disabled={!g.eligible || isProcessing}
                      className="w-max px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-1.5 font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-white"
                      style={{
                        backgroundColor: isProcessing
                          ? "rgba(176,140,193,0.6)"
                          : C.primary,
                      }}
                      onMouseEnter={(e) => {
                        if (!e.currentTarget.disabled) {
                          e.currentTarget.style.backgroundColor = C.primaryDark;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!e.currentTarget.disabled) {
                          e.currentTarget.style.backgroundColor = C.primary;
                        }
                      }}
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 size={16} className="animate-spin text-white" />
                          <span className="text-white">Processing…</span>
                        </>
                      ) : (
                        <>
                          <FileText size={16} className="text-white" />
                          <span className="text-white">
                            {g.eligible ? "Confirm & Dispense" : "Not eligible"}
                          </span>
                        </>
                      )}
                    </button>

                    {!g.eligible && (
                      <div className="mt-2 text-xs text-red-600">
                        Missing on-chain id for {g.missingCount} item(s)
                      </div>
                    )}
                  </div>

                  <div className="text-right text-xs text-gray-500 mt-1">
                    Prescription issued on {dateTime}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {total === 0 && (
          <p className="text-gray-600 mt-4">
            {msg || "No pending delivery prescriptions."}
          </p>
        )}

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

      {showMedsPopup &&
        selectedGroup &&
        (selectedGroup.extraMeds || []).length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
            <div className="w-full max-w-3xl max-h-[70vh] rounded-3xl bg-white shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
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

              <div className="flex-1 overflow-y-auto px-6 py-6">
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
                          className="p-5 border rounded-2xl bg-white shadow-sm flex flex-col"
                          style={{ minHeight: 250 }}
                        >
                          <div className="flex-1">
                            <div
                              className="space-y-1 mb-4"
                              style={{ minHeight: 56 }}
                            >
                              {pair.map((m, idx) => (
                                <div
                                  key={`${selectedGroup.prescriptionId}-popup-med-${boxIndex}-${idx}`}
                                  className="text-lg font-bold text-slate-800 leading-snug line-clamp-1"
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
                              Prescription ID:{" "}
                              <span className="font-normal">
                                {selectedGroup.prescriptionId}
                              </span>
                            </div>

                            <div className="text-sm text-slate-700 mt-1 font-semibold">
                              Patient:{" "}
                              <span className="font-normal">
                                {selectedGroup.patientName} — ----{" "}
                                {selectedGroup.patientIdMask}
                              </span>
                            </div>

                            <div className="text-sm text-slate-700 mt-1 font-semibold">
                              Doctor Phone:{" "}
                              <span className="font-normal">
                                {selectedGroup.doctorPhone}
                              </span>
                            </div>

                            <div className="text-sm text-slate-700 mt-1 font-semibold">
                              Prescribed by:{" "}
                              <span className="font-normal">
                                {selectedGroup.doctorName
                                  ? `Dr. ${selectedGroup.doctorName}`
                                  : "-"}
                                {selectedGroup.doctorFacility
                                  ? ` — ${selectedGroup.doctorFacility}`
                                  : ""}
                              </span>
                            </div>

                            <div className="mt-1 space-y-1">
                              {pair.map((m, idx) => {
                                const dose = m.dose || "-";
                                const freq = m.frequency || "-";
                                const dur = m.durationDays || "-";

                                return (
                                  <div
                                    key={`${selectedGroup.prescriptionId}-popup-dose-${boxIndex}-${idx}`}
                                    className="text-sm text-slate-700 font-semibold"
                                  >
                                    Dosage ({m.medicineLabel || "—"}):{" "}
                                    <span className="font-normal">
                                      {dose} • {freq} • {dur}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="text-sm text-slate-700 mt-2 font-semibold">
                              Medical Condition:{" "}
                              <span className="font-normal">
                                {selectedGroup.medicalCondition || "—"}
                              </span>
                            </div>

                            {!!selectedGroup.notes && (
                              <div className="text-sm text-slate-700 mt-1 font-semibold">
                                Notes:{" "}
                                <span className="font-normal">
                                  {selectedGroup.notes}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="text-right text-xs text-gray-500 mt-4">
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
    </div>
  );
}