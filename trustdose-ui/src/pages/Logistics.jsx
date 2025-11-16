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
import { ethers } from "ethers";
import DELIVERY_ACCEPT from "../contracts/DeliveryAccept.json";

const C = {
  primary: "#B08CC1",
  primaryDark: "#9F76B4",
  teal: "#52B9C4",
  ink: "#4A2C59",
};
const PAGE_SIZE = 6;

const DELIVERY_ACCEPT_ADDRESS =
  "0x2f022100DEdAb2C142E6f2b52d56CBD1609CcC59";
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

  React.useEffect(() => {
    async function loadHeader() {
      try {
        const lgId =
          localStorage.getItem("userId") ||
          localStorage.getItem("logisticsId") ||
          localStorage.getItem("logisticsID") ||
          "";

        if (!lgId) return;

        const col = collection(db, "logistics");
        const snap = await getDocs(
          query(col, where("LogisticsID", "==", String(lgId)))
        );

        if (!snap.empty) {
          const data = snap.docs[0].data() || {};
          setHeader({
            companyName: data.companyName || data.name || "",
            vehicleId: data.vehicleId || data.VehicleID || "",
          });
        }
      } catch (e) {
        console.error("Failed to load logistics header", e);
      }
    }

    loadHeader();
  }, []);

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
          const q2 = query(col, ...wheres);
          return await getDocs(q2);
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
          setRows([]);
          setLoading(false);
        }
        return;
      }

      const data = snap.docs
        .map((d) => {
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
            onchainId,
            patientName: x.patientName || "-",
            patientId: String(x.nationalID ?? x.patientDisplayId ?? "-"),
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
          const aTime =
            a.createdAtTS instanceof Date ? a.createdAtTS.getTime() : 0;
          const bTime =
            b.createdAtTS instanceof Date ? b.createdAtTS.getTime() : 0;
          return bTime - aTime;
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

  function getDeliveryAcceptProvider() {
    if (!window.ethereum) throw new Error("MetaMask is not available");
    return new ethers.BrowserProvider(window.ethereum);
  }

  async function handleAccept(r) {
    const key = String(r.prescriptionId);
    if (pending[key]) return;

    setPending((s) => ({ ...s, [key]: true }));

    try {
      const ref = doc(db, "prescriptions", r._docId);
      const fresh = await getDoc(ref);
      if (!fresh.exists()) throw new Error("Prescription doc not found");

      const freshData = fresh.data();
      if (freshData.dispensed === true) {
        alert("Already dispensed.");
        return;
      }

      if (freshData.logisticsAccepted === true) {
        alert("Already accepted by logistics.");
        return;
      }

      if (freshData.acceptDelivery !== true) {
        alert("Pharmacy has not requested delivery.");
        return;
      }

      if (r.onchainId == null) {
        alert("Missing on-chain ID.");
        return;
      }

      const provider = getDeliveryAcceptProvider();
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        DELIVERY_ACCEPT_ADDRESS,
        DELIVERY_ACCEPT_ABI,
        signer
      );

      const tx = await contract.accept(r.onchainId);
      await tx.wait();

      const courierWallet = await signer.getAddress();
      const courierId = localStorage.getItem("userId") || null;

      await updateDoc(ref, {
        logisticsAccepted: true,
        logisticsAcceptedAt: serverTimestamp(),
        courierWallet,
        courierId,
      });

      setRows((arr) =>
        arr.map((x) =>
          x._docId === r._docId ? { ...x, logisticsAccepted: true } : x
        )
      );
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
        {/* الهيدر بعد حذف النصوص */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/Images/TrustDose-pill.png"
              alt="TrustDose Capsule"
              style={{ width: 64, height: "auto" }}
            />
            <div>
              <div
                className="font-extrabold text-2xl"
                style={{ color: "#334155" }}
              >
                {header.companyName
                  ? `Welcome, ${header.companyName}`
                  : "Welcome, Logistics partner"}
              </div>
            </div>
          </div>

          {header.vehicleId && (
            <div className="text-xs md:text-sm text-slate-600 text-right">
              Vehicle ID:{" "}
              <span className="font-semibold">{header.vehicleId}</span>
            </div>
          )}
        </div>

        {msg && <p className="text-gray-600">{msg}</p>}

        {pageItems.length > 0 && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pageItems.map((r) => {
              const dateTime = r.createdAtTS
                ? r.createdAtTS.toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
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
                    {/* اسم الدواء */}
                    <div className="text-lg font-bold text-slate-800">
                      {r.medicineLabel}
                    </div>

                    {/* Prescription ID */}
                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Prescription ID:{" "}
                      <span className="font-normal">{r.prescriptionId}</span>
                    </div>

                    {/* Patient */}
                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Patient:{" "}
                      <span className="font-normal">
                        {r.patientName || "—"}
                        {r.patientId ? ` — ${String(r.patientId)}` : ""}
                      </span>
                    </div>

                    {/* زر Accept */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="w-max px-4 py-2 text-sm rounded-lg transition-colors
                                flex items-center gap-1.5 font-medium shadow-sm text-white disabled:opacity-60"
                        style={{ backgroundColor: C.primary }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            C.primaryDark)
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = C.primary)
                        }
                        title={
                          r.onchainId
                            ? "Accept this delivery"
                            : "Missing on-chain ID"
                        }
                        onClick={() => handleAccept(r)}
                        disabled={disabled}
                      >
                        {isPending ? (
                          <Loader2
                            size={16}
                            className="animate-spin text-white"
                          />
                        ) : (
                          <Check size={16} className="text-white" />
                        )}
                        <span className="text-white">
                          {isPending
                            ? "Processing…"
                            : r.onchainId
                            ? "Accept Delivery"
                            : "No on-chain ID"}
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
          <p className="text-gray-600">No active delivery orders.</p>
        )}
      </div>
    </div>
  );
}
