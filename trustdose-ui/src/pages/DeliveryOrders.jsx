// src/pages/DeliveryOrders.jsx
/* global BigInt */
"use client";

import React from "react";
import { db } from "../firebase";
import {
  collection, query, where, getDocs, orderBy,
  doc, getDoc, updateDoc, serverTimestamp
} from "firebase/firestore";
import { Loader2, Check } from "lucide-react";
import { ethers } from "ethers";
import DELIVERY_ACCEPT from "../contracts/DeliveryAccept.json";

// ========== ألوان ثابتة ==========
const C = { primary: "#B08CC1", primaryDark: "#9F76B4", teal: "#52B9C4", ink: "#4A2C59" };
const RX_STATUS = { DELIVERY_REQUESTED: "DELIVERY_REQUESTED", PHARM_ACCEPTED: "PHARM_ACCEPTED" };
const PAGE_SIZE = 6;

// ======== عقد DeliveryAccept ========
const DELIVERY_ACCEPT_ADDRESS = "0x567e595AC2F615d37C0f10426B41652040Fa93C9";
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

  React.useEffect(() => {
    let mounted = true;

    async function fetchAllSensitive() {
      setLoading(true);
      setRows([]);
      setMsg("");

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

      const data = snap.docs.map((d) => {
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
          prescriptionId: displayId, // للعرض فقط (a1001 مثلاً)
          prescriptionNum: typeof x.prescriptionNum === "number" ? x.prescriptionNum : null,
          onchainId,                 // هذا الذي سنرسله للعقد
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
        };
      });

      // ======== ترتيب حسب وقت الإنشاء ثم رقم الوصفة (الأحدث / الأكبر أولاً) ========
      data.sort((a, b) => {
        const aTime = a.createdAtTS instanceof Date ? a.createdAtTS.getTime() : 0;
        const bTime = b.createdAtTS instanceof Date ? b.createdAtTS.getTime() : 0;
        if (bTime !== aTime) return bTime - aTime; // الأحدث أولاً

        const aNum =
          typeof a.prescriptionNum === "number"
            ? a.prescriptionNum
            : (() => {
                const n = Number(a.prescriptionId?.toString().replace(/^[a-z]/i, ""));
                return Number.isNaN(n) ? 0 : n;
              })();

        const bNum =
          typeof b.prescriptionNum === "number"
            ? b.prescriptionNum
            : (() => {
                const n = Number(b.prescriptionId?.toString().replace(/^[a-z]/i, ""));
                return Number.isNaN(n) ? 0 : n;
              })();

        return bNum - aNum; // الأكبر فوق
      });

      if (mounted) {
        setRows(data);
        setLoading(false);
        setPage(0);
      }
    }

    fetchAllSensitive();
    return () => { mounted = false; };
  }, [pharmacyId]);

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

    try {
      // تأكيد من Firestore
      const ref = doc(db, "prescriptions", r._docId);
      const fresh = await getDoc(ref);
      if (!fresh.exists()) throw new Error("Prescription doc not found");

      const freshData = fresh.data();
      if (freshData.dispensed === true) {
        alert("This prescription was already dispensed. You cannot accept delivery.");
        // نحدّث الستيت عشان لو رجع dispensed=true ما تنعرض
        setRows((arr) =>
          arr.map((x) => (x._docId === r._docId ? { ...x, dispensed: true } : x))
        );
        return;
      }

      if (r.onchainId == null) {
        alert("Missing on-chain ID (onchainId). Please ensure the doctor's page stores it from the blockchain event.");
        return;
      }

      // نداء العقد
      const provider = getDeliveryAcceptProvider();
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(DELIVERY_ACCEPT_ADDRESS, DELIVERY_ACCEPT_ABI, signer);

      const tx = await contract.accept(r.onchainId); // BigInt جاهز
      await tx.wait();

      // نحدّث Firestore -> dispensed = true
      await updateDoc(ref, {
        dispensed: true,
        dispensedAt: serverTimestamp(),
      });

      // نحدّث الستيت المحلي -> dispensed=true => الكارد يختفي
      setRows((arr) =>
        arr.map((x) =>
          x._docId === r._docId ? { ...x, dispensed: true } : x
        )
      );

      console.log("Accepted on-chain & marked dispensed");
    } catch (err) {
      console.error(err);
      alert(err?.message || "Accept failed");
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
        {msg && <p className="text-gray-600">{msg}</p>}

        {pageItems.length > 0 && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pageItems.map((r) => {
              // لو dispensed=true لا نعرض الكارد
              if (r.dispensed) return null;

              const prescriber = r.doctorName ? `Dr. ${r.doctorName}` : "-";
              const facility = r.doctorFacility ? ` — ${r.doctorFacility}` : "";
              const dateTime = r.createdAtTS
                ? r.createdAtTS.toLocaleString("en-GB", {
                    day: "2-digit", month: "long", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })
                : r.createdAt || "-";

              const isPending = !!pending[String(r.prescriptionId)];
              const disabled = isPending || !r.onchainId;

              return (
                <div
                  key={r._docId}
                  className="p-4 border rounded-xl bg-white shadow-sm flex flex-col justify-between"
                >
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
                      Prescribed by <span className="font-normal">{prescriber}{facility}</span>
                    </div>

                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Dosage:{" "}
                      <span className="font-normal">
                        {r.dose || "—"} • {r.frequency || "—"} • {r.durationDays || "—"}
                      </span>
                    </div>

                    <div className="text-sm text-slate-700 mt-2 font-semibold">
                      Medical Condition: <span className="font-normal">{r.medicalCondition || "—"}</span>
                    </div>

                    {!!r.notes && (
                      <div className="text-sm text-slate-700 mt-2 font-semibold">
                        Notes: <span className="font-normal">{r.notes}</span>
                      </div>
                    )}

                    {/* زر Accept */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="w-max px-4 py-2 text-sm rounded-lg transition-colors
                                   flex items-center gap-1.5 font-medium shadow-sm text-white disabled:opacity-60"
                        style={{ backgroundColor: C.primary }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.primaryDark)}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = C.primary)}
                        title={r.onchainId ? "Accept this prescription" : "Missing on-chain ID"}
                        onClick={() => handleAccept(r)}
                        disabled={disabled}
                      >
                        {isPending ? (
                          <Loader2 size={16} className="animate-spin text-white" />
                        ) : (
                          <Check size={16} className="text-white" />
                        )}
                        <span className="text-white">
                          {isPending ? "Processing…" : (r.onchainId ? "Accept" : "No on-chain ID")}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="text-right text-xs text-gray-500 mt-3">
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
