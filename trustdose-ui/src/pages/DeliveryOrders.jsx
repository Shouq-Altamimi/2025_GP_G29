// src/pages/DeliveryOrders.jsx
/* global BigInt */
"use client";

import React from "react";
import { useOutletContext } from "react-router-dom";
import { db } from "../firebase";
import {
  collection, query, where, getDocs, orderBy,
  doc, getDoc, updateDoc, serverTimestamp
} from "firebase/firestore";
import { Loader2, CheckCircle2 } from "lucide-react"; // ✅ نفس الأيقونة حق الصيدلية
import { ethers } from "ethers";
import DELIVERY_ACCEPT from "../contracts/DeliveryAccept.json";

// ========== ألوان ثابتة ==========
const C = { primary: "#B08CC1", primaryDark: "#9F76B4", teal: "#52B9C4", ink: "#4A2C59" };
const RX_STATUS = { DELIVERY_REQUESTED: "DELIVERY_REQUESTED", PHARM_ACCEPTED: "PHARM_ACCEPTED" };
const PAGE_SIZE = 6;

// ======== عقد DeliveryAccept ========
const DELIVERY_ACCEPT_ADDRESS = "0x48B1223ea5B780DBc0f3D1dA3fB1554776230d03";
const DELIVERY_ACCEPT_ABI = DELIVERY_ACCEPT?.abi ?? [];

/* ========== helpers ========== */
function formatFsTimestamp(v) {
  if (!v) return "-";
  try {
    if (typeof v?.toDate === "function") {
      const d = v.toDate();
      return d.toLocaleString("en-GB", {
        day: "2-digit", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    }
    if (typeof v === "string") return v;
  } catch {}
  return String(v);
}

export default function DeliveryOrders({ pharmacyId }) {
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState([]);
  const [msg, setMsg] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [pending, setPending] = React.useState({}); // prescriptionId -> true

  // ✅ حالة البوب أب (نفس فكرة الصيدلية بس بعنوان/رسالة)
  const [successModal, setSuccessModal] = React.useState(null);

  // ✅ نجيب setPageError من الـ Shell عشان نظهر البانر الأحمر فوق الـ Welcome
  const outletCtx = useOutletContext?.() || {};
  const setPageError = outletCtx.setPageError || (() => {});

  React.useEffect(() => {
    let mounted = true;

    async function fetchAllSensitive() {
      setLoading(true);
      setRows([]);
      setMsg("");
      setPageError(""); // نمسح أي خطأ قديم في البانر

      const col = collection(db, "prescriptions");

      async function runQ(wheres, useOrder = true) {
        try {
          const q1 = useOrder ? query(col, ...wheres, orderBy("updatedAt", "desc")) : query(col, ...wheres);
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
          where("status", "in", [RX_STATUS.DELIVERY_REQUESTED, RX_STATUS.PHARM_ACCEPTED]),
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
          setMsg("No sensitive prescriptions found.");
          setRows([]);
          setLoading(false);
        }
        return;
      }

      const rawData = snap.docs.map((d) => {
        const x = d.data() || {};
        const displayId = x.prescriptionID || d.id;

        // onchainId يجب أن يأتي من Firestore فقط
        let onchainId = null;
        const raw = x.onchainId;
        if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
          try { onchainId = ethers.toBigInt(String(raw)); } catch {}
        }

        return {
          _docId: d.id,
          prescriptionId: displayId, // للعرض فقط
          prescriptionNum: typeof x.prescriptionNum === "number" ? x.prescriptionNum : null,
          onchainId,
          patientName: x.patientName || "-",
          patientId: String(x.nationalID ?? x.patientDisplayId ?? "-"),
          doctorName: x.doctorName || "-",
          doctorFacility: x.doctorFacility || "",
          doctorPhone: x.doctorPhone || x.phone || "-",
          medicineLabel: x.medicineLabel || x.medicineName || "-",
          dose: x.dosage || x.dose || "-",
          frequency: x.frequency || (x.timesPerDay ? `${x.timesPerDay} times/day` : "-"),
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

      // لا نعرض اللي already acceptDelivery = true
      const filtered = rawData.filter((r) => !r.acceptDelivery);

      // ترتيب إضافي (اختياري)
      filtered.sort((a, b) => {
        const aTime = a.createdAtTS instanceof Date ? a.createdAtTS.getTime() : 0;
        const bTime = b.createdAtTS instanceof Date ? b.createdAtTS.getTime() : 0;
        if (bTime !== aTime) return bTime - aTime;

        const aNum =
          typeof a.prescriptionNum === "number"
            ? a.prescriptionNum
            : (() => {
                const n = Number(a.prescriptionId?.toString().replace(/^[a-z]/i, "")); // يشيل أول حرف لو موجود
                return Number.isNaN(n) ? 0 : n;
              })();

        const bNum =
          typeof b.prescriptionNum === "number"
            ? b.prescriptionNum
            : (() => {
                const n = Number(b.prescriptionId?.toString().replace(/^[a-z]/i, "")); // يشيل أول حرف لو موجود
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
    return () => { mounted = false; };
  }, [pharmacyId, setPageError]);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  const pageItems = rows.slice(start, end);

  // ======== تهيئة العقد عبر Ethers ========
  function getDeliveryAcceptProvider() {
    if (!window.ethereum) throw new Error("MetaMask is not available");
    return new ethers.BrowserProvider(window.ethereum);
  }

  // ======== حدث زر Accept ========
  async function handleAccept(r) {
    const key = String(r.prescriptionId);
    if (pending[key]) return;

    setPending((s) => ({ ...s, [key]: true }));
    setPageError(""); // نمسح الخطأ قبل ما نبدأ محاولة جديدة

    try {
      const ref = doc(db, "prescriptions", r._docId);
      const fresh = await getDoc(ref);
      if (!fresh.exists()) throw new Error("Prescription doc not found");

      const freshData = fresh.data();

      if (freshData.dispensed === true) {
        // لسه نخليه Alert لأنه حالة مختلفة عن متاماسك
        alert("This prescription was already dispensed. You cannot accept delivery.");
        setRows((arr) => arr.filter((x) => x._docId !== r._docId));
        return;
      }

      if (freshData.acceptDelivery === true) {
        setRows((arr) => arr.filter((x) => x._docId !== r._docId));
        return;
      }

      // لو عندنا onchainId نستدعي العقد، لو ما عندنا نكمل بدون بلوك تشين
      let txHash = null;
      if (r.onchainId != null) {
        const provider = getDeliveryAcceptProvider();
        await provider.send("eth_requestAccounts", []);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(DELIVERY_ACCEPT_ADDRESS, DELIVERY_ACCEPT_ABI, signer);

        const tx = await contract.accept(r.onchainId);
        await tx.wait();
        txHash = tx.hash;
      }

      // ✅ نحدّث Firestore -> acceptDelivery فقط (dispensed تبقى false)
      const updatePayload = {
        acceptDelivery: true,
        acceptDeliveryAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (txHash) {
        updatePayload.acceptDeliveryTx = txHash;
      }
      await updateDoc(ref, updatePayload);

      // نشيل الكارد من الستيت
      setRows((arr) => arr.filter((x) => x._docId !== r._docId));

      console.log("Marked acceptDelivery", txHash ? "with tx " + txHash : "without on-chain tx");

      // ✅ بوب أب نفس اللي في PendingOrders / PickUpSection
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

      // ✅ هنا نضبط رسالة متاماسك بالضبط زي الصفحات الثانية
      let m = "Error occurred. Please try again.";
      if (err?.code === "ACTION_REJECTED" || err?.code === 4001) {
        m = "MetaMask request was declined. Please try again.";
      }

      setPageError(m); // تظهر كبانر أحمر فوق الـ Welcome من الـ Shell
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

        {/* ✅ البوب أب نفس بوب أب الصيدلية بالضبط */}
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

                <p
                  className="text-sm mb-4"
                  style={{ color: "#4B5563" }}
                >
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

        {msg && <p className="text-gray-600">{msg}</p>}

        {pageItems.length > 0 && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pageItems.map((r) => {
              if (r.dispensed || r.acceptDelivery) return null;

              const prescriber = r.doctorName ? `Dr. ${r.doctorName}` : "-";
              const facility = r.doctorFacility ? ` — ${r.doctorFacility}` : "";
              const dateTime = r.createdAtTS
                ? r.createdAtTS.toLocaleString("en-GB", {
                    day: "2-digit", month: "long", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })
                : r.createdAt || "-";

              const isPending = !!pending[String(r.prescriptionId)];
              const disabled = isPending;

              return (
                <div
                  key={r._docId}
                  className="p-4 border rounded-xl bg-white shadow-sm"
                >
                  {/* محتوى الكارد العلوي */}
                  <div>
                    <div className="text-lg font-bold text-slate-800 truncate">
                      {r.medicineLabel || "—"}
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Prescription ID: <span className="font-normal">{r.prescriptionId}</span>
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Patient:{" "}
                      <span className="font-normal">
                        {r.patientName || "—"}
                        {r.patientId ? ` — ${String(r.patientId)}` : ""}
                      </span>
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Doctor Phone: <span className="font-normal">{r.doctorPhone}</span>
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Prescribed by{" "}
                      <span className="font-normal">
                        {prescriber}{facility}
                      </span>
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Dosage:{" "}
                      <span className="font-normal">
                        {r.dose || "—"} • {r.frequency || "—"} • {r.durationDays || "—"}
                      </span>
                    </div>

                    <div className="text-sm text-slate-700 mt-2 font-semibold">
                      Medical Condition:{" "}
                      <span className="font-normal">{r.medicalCondition || "—"}</span>
                    </div>

                    {/* مساحة ثابتة للنوتس */}
                    <div className="mt-1 min-h-[28px]">
                      {!!r.notes && (
                        <div className="text-sm text-slate-700 font-semibold">
                          Notes:{" "}
                          <span className="font-normal">{r.notes}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* زر Accept تحت النوتس مباشرة */}
                  <div className="mt-1">
                    <button
                      className="w-max px-4 py-2 text-sm rounded-lg transition-colors
                                 flex items-center gap-1.5 font-medium shadow-sm text-white disabled:opacity-60"
                      style={{ backgroundColor: isPending ? "#D8C2E6" : C.primary }}
                      onMouseEnter={(e) => {
                        if (!isPending && !disabled) {
                          e.currentTarget.style.backgroundColor = C.primaryDark;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isPending && !disabled) {
                          e.currentTarget.style.backgroundColor = C.primary;
                        }
                      }}
                      title="Accept this prescription"
                      onClick={() => handleAccept(r)}
                      disabled={disabled}
                    >
                      {isPending && (
                        <Loader2 size={16} className="animate-spin text-white" />
                      )}

                      <span className="text-white">
                        {isPending ? "Processing…" : "Accept"}
                      </span>
                    </button>
                  </div>

                  {/* التاريخ تحت الزر بمسافة بسيطة */}
                  <div className="text-right text-xs text-gray-500 mt-1">
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
              Showing {end} out of {total} prescriptions
            </div>

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
        )}
      </div>
    </div>
  );
}
