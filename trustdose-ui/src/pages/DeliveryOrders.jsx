// src/pages/DeliveryOrders.jsx لا تحذف وعدل على اللي اتفقنا
/* global BigInt */
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
  getDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Loader2, CheckCircle2 } from "lucide-react";
import { ethers } from "ethers";
import DELIVERY_ACCEPT from "../contracts/DeliveryAccept.json";

const C = {
  primary: "#B08CC1",
  primaryDark: "#9F76B4",
  teal: "#52B9C4",
  ink: "#4A2C59",
};
const RX_STATUS = {
  DELIVERY_REQUESTED: "DELIVERY_REQUESTED",
  PHARM_ACCEPTED: "PHARM_ACCEPTED",
};
const PAGE_SIZE = 6;

const DELIVERY_ACCEPT_ADDRESS = "0xFBE49a895c15Eb235eA79829AaE4C2ad5856Dd20";
const DELIVERY_ACCEPT_ABI = DELIVERY_ACCEPT?.abi ?? [];

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

// ===== Date/Time Filter (same as Logistics) =====
function parseDTLocal(v) {
  if (!v || typeof v !== "string") return null;
  const cleaned = v.trim().replace("T", " ");
  const [datePart, timePart] = cleaned.split(" ");
  if (!datePart || !timePart) return null;
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

function setTodayRange(setFromDT, setToDT) {
  const d = new Date(); // local time
  const pad = (n) => String(n).padStart(2, "0");
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  setFromDT(`${today} 00:00`);
  setToDT(`${today} 23:59`);
}

function setQuickFilterRange(hours, setFromDT, setToDT) {
  const now = new Date();
  const past = new Date(now.getTime() - hours * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");

  const fmt = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;

  setFromDT(fmt(past));
  setToDT(fmt(now));
}

export default function DeliveryOrders({ pharmacyId }) {
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState([]);
  const [msg, setMsg] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [pending, setPending] = React.useState({});
  const [fromDT, setFromDT] = React.useState("");
  const [toDT, setToDT] = React.useState("");

  const [successModal, setSuccessModal] = React.useState(null);

  const outletCtx = useOutletContext?.() || {};
  const setPageError = outletCtx.setPageError || (() => {});

  React.useEffect(() => {
    let mounted = true;

    async function fetchAllSensitive() {
      setLoading(true);
      setRows([]);
      setMsg("");
      setPageError("");
      const col = collection(db, "prescriptions");

      async function runQ(wheres, useOrder = true) {
        try {
          const q1 = useOrder
            ? query(col, ...wheres, orderBy("updatedAt", "desc"))
            : query(col, ...wheres);
          return await getDocs(q1);
        } catch {
          const q2 = query(col, ...wheres);
          return await getDocs(q2);
        }
      }

      const candidates = [];
      if (pharmacyId) {
        candidates.push([
          where("pharmacyId", "==", pharmacyId),
          where("sensitivity", "==", "Sensitive"),
          where("status", "in", [
            RX_STATUS.DELIVERY_REQUESTED,
            RX_STATUS.PHARM_ACCEPTED,
          ]),
          where("dispensed", "==", false),
        ]);
        candidates.push([
          where("pharmacyId", "==", pharmacyId),
          where("sensitivity", "==", "Sensitive"),
          where("dispensed", "==", false),
        ]);
      }
      candidates.push([
        where("sensitivity", "==", "Sensitive"),
        where("dispensed", "==", false),
      ]);
      if (pharmacyId) {
        candidates.push([
          where("pharmacyId", "==", pharmacyId),
          where("sensitivity", "==", "sensitive"),
          where("dispensed", "==", false),
        ]);
      }
      candidates.push([
        where("sensitivity", "==", "sensitive"),
        where("dispensed", "==", false),
      ]);

      let snap = null;
      for (const wh of candidates) {
        snap = await runQ(wh);
        if (snap && !snap.empty) break;
      }

      if (!snap || snap.empty) {
        if (mounted) {
          setMsg("No delivery prescriptions to accept.");
          setRows([]);
          setLoading(false);
        }
        return;
      }

      const rawData = snap.docs.map((d) => {
        const x = d.data() || {};
        const displayId = x.prescriptionID || d.id;

        let onchainId = null;
        const raw = x.onchainId;
        if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
          try {
            onchainId = ethers.toBigInt(String(raw));
          } catch {}
        }

        return {
          _docId: d.id,
          prescriptionId: displayId,
          prescriptionNum:
            typeof x.prescriptionNum === "number" ? x.prescriptionNum : null,
          onchainId,
          patientName: x.patientName || "-",
          patientId: String(x.nationalID ?? x.patientDisplayId ?? "-"),
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
          status: x.status || "-",
          createdAtTS: x?.createdAt?.toDate?.() ? x.createdAt.toDate() : undefined,
          createdAt: formatFsTimestamp(x.createdAt),
          updatedAt: formatFsTimestamp(x.updatedAt),
          dispensed: !!x.dispensed,
          acceptDelivery: !!x.acceptDelivery,
        };
      });

      const filtered = rawData.filter((r) => !r.acceptDelivery);

      filtered.sort((a, b) => {
        const aTime = a.createdAtTS instanceof Date ? a.createdAtTS.getTime() : 0;
        const bTime = b.createdAtTS instanceof Date ? b.createdAtTS.getTime() : 0;
        if (bTime !== aTime) return bTime - aTime;

        const aNum =
          typeof a.prescriptionNum === "number"
            ? a.prescriptionNum
            : (() => {
                const n = Number(
                  a.prescriptionId?.toString().replace(/^[a-z]/i, "")
                );
                return Number.isNaN(n) ? 0 : n;
              })();

        const bNum =
          typeof b.prescriptionNum === "number"
            ? b.prescriptionNum
            : (() => {
                const n = Number(
                  b.prescriptionId?.toString().replace(/^[a-z]/i, "")
                );
                return Number.isNaN(n) ? 0 : n;
              })();

        return bNum - aNum;
      });

      if (mounted) {
        setRows(filtered);
        setLoading(false);
        setPage(0);
      }
    }

    fetchAllSensitive();
    return () => {
      mounted = false;
    };
  }, [pharmacyId, setPageError]);

  const filteredRows = React.useMemo(() => {
    let base = rows;

    const from = parseDTLocal(fromDT);
    const to = parseDTLocal(toDT);

    if (from) base = base.filter((r) => r.createdAtTS && r.createdAtTS >= from);
    if (to) base = base.filter((r) => r.createdAtTS && r.createdAtTS <= to);

    return base;
  }, [rows, fromDT, toDT]);

  // ✅ GROUPING: اجمع حسب prescriptionId (كرت واحد + زر واحد)
  const groups = React.useMemo(() => {
    const map = new Map();

    for (const r of filteredRows) {
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
            .filter((v) => v !== null && v !== undefined)
            .map((v) => v.toString())
        )
      );

      // ✅ eligible إذا فيه على الأقل onchainId واحد
      const eligible = onchainIds.length > 0;

      const createdAtTS = meds.reduce((acc, m) => {
        const t = m.createdAtTS?.getTime?.() || 0;
        return t > (acc?.getTime?.() || 0) ? m.createdAtTS : acc;
      }, first.createdAtTS);

      return {
        prescriptionId,
        createdAtTS,
        createdAt: first.createdAt,
        patientName: first.patientName || "-",
        patientId: first.patientId || "-",
        doctorName: first.doctorName || "-",
        doctorFacility: first.doctorFacility || "",
        doctorPhone: first.doctorPhone || "-",
        medicalCondition: first.medicalCondition || "",
        notes: first.notes || "",
        meds,
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
  }, [filteredRows]);

  const total = groups.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  const pageItems = groups.slice(start, end);

  // reset page when filters change
  React.useEffect(() => setPage(0), [fromDT, toDT, rows.length]);

  function getDeliveryAcceptProvider() {
    if (!window.ethereum) throw new Error("MetaMask is not available");
    return new ethers.BrowserProvider(window.ethereum);
  }

  // ✅ Accept GROUP
  async function handleAcceptGroup(g) {
    const key = String(g.prescriptionId);
    if (pending[key]) return;

    setPending((s) => ({ ...s, [key]: true }));
    setPageError("");

    try {
      // fresh check لكل docs داخل المجموعة
      const refs = g.meds.map((m) => doc(db, "prescriptions", m._docId));
      const freshSnaps = await Promise.all(refs.map((r) => getDoc(r)));

      const valid = [];
      for (let i = 0; i < freshSnaps.length; i++) {
        const snap = freshSnaps[i];
        if (!snap.exists()) continue;
        const data = snap.data() || {};
        if (data.dispensed === true) continue;
        if (data.acceptDelivery === true) continue;

        valid.push({ ref: refs[i], docId: g.meds[i]._docId });
      }

      if (valid.length === 0) {
        const docIds = new Set(g.meds.map((x) => x._docId));
        setRows((arr) => arr.filter((x) => !docIds.has(x._docId)));
        return;
      }

      // on-chain accept لكل onchainId موجود
      let txHashes = [];
      if (g.onchainIds?.length) {
        const provider = getDeliveryAcceptProvider();
        await provider.send("eth_requestAccounts", []);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(
          DELIVERY_ACCEPT_ADDRESS,
          DELIVERY_ACCEPT_ABI,
          signer
        );

        for (const idStr of g.onchainIds) {
          const tx = await contract.accept(BigInt(idStr));
          await tx.wait();
          txHashes.push(tx.hash);
        }
      }

      const updatePayload = {
        acceptDelivery: true,
        acceptDeliveryAt: serverTimestamp(),
        updatedAt: serverTimestamp(),

        // ✅ اتفقنا: بعد قبول الصيدلية، الطلب يجهز للوجستيك
        status: RX_STATUS.PHARM_ACCEPTED,

        // ✅ الـ 48 ساعة تبدأ لاحقًا من logisticsAcceptedAt (في صفحة اللوجستيك)
        logisticsAccepted: false,
        logisticsAcceptedAt: null,

        // ✅ ما تم التسليم
        deliveryConfirmed: false,

        // ✅ فلاغات إشعارات (تستخدمها الـ Cloud Function عشان ما تكرر)
        deliveryOverdue24Notified: false,
        deliveryOverdue48Notified: false,
      };

      if (txHashes.length === 1) updatePayload.acceptDeliveryTx = txHashes[0];
      if (txHashes.length > 1) updatePayload.acceptDeliveryTxs = txHashes;

      await Promise.all(valid.map(({ ref }) => updateDoc(ref, updatePayload)));

      // نشيل كل كروت المجموعة من الستيت
      const docIds = new Set(g.meds.map((x) => x._docId));
      setRows((arr) => arr.filter((x) => !docIds.has(x._docId)));

      console.log(
        "Marked acceptDelivery group",
        txHashes.length ? `with ${txHashes.length} tx(s)` : "without on-chain tx"
      );

      setSuccessModal({
        title: "Sensitive prescription accepted",
        message: (
          <>
            If accepted by logistics provider, the prescription will appear in
            <span className="font-semibold"> Pending Orders</span>.
          </>
        ),
      });
    } catch (err) {
      console.error(err);

      let m = "Error occurred. Please try again.";
      if (err?.code === "ACTION_REJECTED" || err?.code === 4001) {
        m = "MetaMask request was declined. Please try again.";
      }

      setPageError(m);
    } finally {
      setPending((s) => {
        const t = { ...s };
        delete t[key];
        return t;
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

                <h3
                  className="text-lg font-semibold mb-1"
                  style={{ color: C.ink }}
                >
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

        {/* Date/Time Filter Bar */}
        <div className="sticky top-0 z-30 mb-6">
          <div className="bg-white/95 backdrop-blur border rounded-2xl shadow-sm p-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTodayRange(setFromDT, setToDT)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50"
                  style={{ color: C.ink }}
                >
                  Today
                </button>

                <button
                  type="button"
                  onClick={() => setQuickFilterRange(24, setFromDT, setToDT)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50"
                  style={{ color: C.ink }}
                >
                  Last 24h
                </button>

                <button
                  type="button"
                  onClick={() => setQuickFilterRange(48, setFromDT, setToDT)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 bg-red-50 text-red-700"
                >
                  Last 48h
                </button>
              </div>

              <div className="flex flex-1 flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[180px]">
                  <input
                    type="datetime-local"
                    max="9999-12-31T23:59"
                    value={fromDT.replace(" ", "T")}
                    onChange={(e) =>
                      setFromDT(e.target.value.slice(0, 16).replace("T", " "))
                    }
                    className="w-full pl-3 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2"
                    style={{ outlineColor: C.primary }}
                  />
                </div>

                <span className="text-gray-400 text-sm font-bold">to</span>

                <div className="relative flex-1 min-w-[180px]">
                  <input
                    type="datetime-local"
                    max="9999-12-31T23:59"
                    value={toDT.replace(" ", "T")}
                    onChange={(e) =>
                      setToDT(e.target.value.slice(0, 16).replace("T", " "))
                    }
                    className="w-full pl-3 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2"
                    style={{ outlineColor: C.primary }}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setFromDT("");
                    setToDT("");
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm"
                  style={{ backgroundColor: C.primary, color: "#fff" }}
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>
        </div>

        {pageItems.length > 0 && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pageItems.map((g) => {
              const dateTime =
                g.createdAtTS?.toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }) || g.createdAt || "-";

              const isPending = !!pending[String(g.prescriptionId)];

              const prescriber = g.doctorName ? `Dr. ${g.doctorName}` : "-";
              const facility = g.doctorFacility ? ` — ${g.doctorFacility}` : "";

              return (
                <div
                  key={g.prescriptionId}
                  className="p-4 border rounded-xl bg-white shadow-sm"
                >
                  <div>
                    {/* meds title (first 2) */}
                    <div className="space-y-1 mb-3">
                      {(g.meds || []).slice(0, 2).map((m, idx) => (
                        <div
                          key={`${g.prescriptionId}-med-${idx}`}
                          className="text-lg font-bold text-slate-800 leading-snug line-clamp-1"
                          title={m.medicineLabel}
                        >
                          {m.medicineLabel || "—"}
                        </div>
                      ))}

                      {(g.meds || []).length === 1 && (
                        <div className="text-lg font-bold text-slate-800 opacity-0 select-none">
                          placeholder
                        </div>
                      )}

                      {(g.meds || []).length > 2 && (
                        <div className="text-xs text-gray-500 mt-1">
                          +{g.meds.length - 2} more
                        </div>
                      )}
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Prescription ID:{" "}
                      <span className="font-normal">{g.prescriptionId}</span>
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Patient:{" "}
                      <span className="font-normal">
                        {g.patientName || "—"}
                        {g.patientId ? ` — ${String(g.patientId)}` : ""}
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
                      className="w-max px-4 py-2 text-sm rounded-lg transition-colors
                                 flex items-center gap-1.5 font-medium shadow-sm text-white disabled:opacity-60"
                      style={{
                        backgroundColor: isPending ? "#D8C2E6" : C.primary,
                      }}
                      onMouseEnter={(e) => {
                        if (!isPending && g.eligible) {
                          e.currentTarget.style.backgroundColor = C.primaryDark;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isPending && g.eligible) {
                          e.currentTarget.style.backgroundColor = C.primary;
                        }
                      }}
                      title={
                        g.eligible
                          ? "Accept this prescription (group)"
                          : `Missing on-chain id for ${g.missingCount} item(s)`
                      }
                      onClick={() => handleAcceptGroup(g)}
                      disabled={isPending || !g.eligible}
                    >
                      {isPending && (
                        <Loader2 size={16} className="animate-spin text-white" />
                      )}

                      <span className="text-white">
                        {isPending
                          ? "Processing…"
                          : g.eligible
                          ? "Accept"
                          : "Not eligible"}
                      </span>
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
            {msg || "No delivery prescriptions to accept."}
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
    </div>
  );
}
