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

import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { ethers } from "ethers";
import LOGISTICS_ACCEPT from "../contracts/LogisticsAccept.json";

const C = {
  primary: "#B08CC1",
  primaryDark: "#9F76B4",
  teal: "#52B9C4",
  ink: "#4A2C59",
};

const PAGE_SIZE = 6;
const LOGISTICS_ACCEPT_ADDRESS = "0x33b503588275CdAfcBe73eD51664919A3D4d3AC6";

/* Timestamp formatter */
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

/* MetaMask signer */
async function getSignerEnsured() {
  if (!window.ethereum) throw new Error("MetaMask not detected.");
  await window.ethereum.request({ method: "eth_requestAccounts" });
  const provider = new ethers.BrowserProvider(window.ethereum);
  return provider.getSigner();
}

// ✅ patient lookup supports BOTH docId styles:
// 1) patients/{nationalId}
// 2) patients/Ph_{nationalId}
async function fetchPatientInfoByNationalId(nationalIdFull) {
  const id = String(nationalIdFull ?? "").trim();
  if (!id || id === "-" || id === "undefined") return { name: "-", phone: "-" };

  const tryIds = [id, `Ph_${id}`];

  for (const docId of tryIds) {
    try {
      const snap = await getDoc(doc(db, "patients", docId));
      if (snap.exists()) {
        const p = snap.data() || {};
        return {
          name: p.name || p.fullName || p.patientName || "-",
          phone: p.contact || p.phone || p.mobile || "-",
        };
      }
    } catch {}
  }

  try {
    const col = collection(db, "patients");
    const qs = await getDocs(query(col, where("nationalID", "==", id)));
    if (!qs.empty) {
      const p = qs.docs[0].data() || {};
      return {
        name: p.name || p.fullName || p.patientName || "-",
        phone: p.contact || p.phone || p.mobile || "-",
      };
    }
  } catch {}

  return { name: "-", phone: "-" };
}

export default function Logistics() {
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState([]);
  const [msg, setMsg] = React.useState("");
  const [page, setPage] = React.useState(0);

  // key: prescriptionId -> boolean
  const [pending, setPending] = React.useState({});

  // Filters
  const [qText, setQText] = React.useState("");
  const [fromDT, setFromDT] = React.useState("");
  const [toDT, setToDT] = React.useState("");

  const setQuickFilter = (hours) => {
    const now = new Date();
    const past = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const formatForInput = (d) => {
      const pad = (n) => n.toString().padStart(2, "0");
      const year = d.getFullYear().toString().slice(-4);
      return `${year}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
        d.getHours()
      )}:${pad(d.getMinutes())}`;
    };
    setFromDT(formatForInput(past).replace("T", " "));
    setToDT(formatForInput(now).replace("T", " "));
  };

  function parseDTLocal(v) {
    if (!v || typeof v !== "string") return null;
    const cleaned = v.trim().replace("T", " ");
    const [datePart, timePart] = cleaned.split(" ");
    if (!datePart || !timePart) return null;
    const [y, m, d] = datePart.split("-").map(Number);
    const [hh, mm] = timePart.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm);
  }

  const [header, setHeader] = React.useState({
    companyName: "",
    vehicleId: "",
  });

  const [showSuccessPopup, setShowSuccessPopup] = React.useState(false);

  /* Load logistics header */
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

  /* Load prescriptions */
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
          setRows([]);
          setLoading(false);
        }
        return;
      }

      // 1) map docs -> rows
      const data = snap.docs
        .map((d) => {
          const x = d.data() || {};

          const patientNatId =
            String(x.patientNationalId ?? x.nationalID ?? x.nationalId ?? "").trim() || "-";

          const patientIdLast4 =
            String(x.patientNationalIdLast4 ?? x.patientDisplayId ?? "").trim() ||
            last4(patientNatId);

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
            patientPhone: x.patientPhone || x.phone || "-",

            patientIdFull: patientNatId,
            patientIdLast4,

            medicineLabel: x.medicineLabel || x.medicineName || "-",
            createdAtTS: x.createdAt?.toDate?.(),
            createdAt: formatFsTimestamp(x.createdAt),
            updatedAt: formatFsTimestamp(x.updatedAt),

            dispensed: !!x.dispensed,
            acceptDelivery: x.acceptDelivery === true,
            logisticsAccepted: x.logisticsAccepted === true,
          };
        })
        .sort(
          (a, b) =>
            (b.createdAtTS?.getTime?.() || 0) - (a.createdAtTS?.getTime?.() || 0)
        );

      const needLookup = Array.from(
        new Set(
          data
            .filter(
              (r) =>
                (r.patientName === "-" ||
                  !String(r.patientName || "").trim() ||
                  r.patientPhone === "-" ||
                  !String(r.patientPhone || "").trim()) &&
                r.patientIdFull &&
                r.patientIdFull !== "-" &&
                /^\d{10}$/.test(String(r.patientIdFull))
            )
            .map((r) => r.patientIdFull)
        )
      );

      const patientInfoMap = {};
      if (needLookup.length) {
        await Promise.all(
          needLookup.map(async (nidFull) => {
            patientInfoMap[nidFull] = await fetchPatientInfoByNationalId(nidFull);
          })
        );
      }

      const fixed = data.map((r) => {
        const info = patientInfoMap[r.patientIdFull];
        const name =
          r.patientName && r.patientName !== "-" && String(r.patientName).trim()
            ? r.patientName
            : info?.name || "-";

        const phone =
          r.patientPhone && r.patientPhone !== "-" && String(r.patientPhone).trim()
            ? r.patientPhone
            : info?.phone || "-";

        return { ...r, patientName: name, patientPhone: phone };
      });

      if (mounted) {
        setRows(fixed);
        setLoading(false);
        setPage(0);
      }
    }

    fetchAll();
    return () => (mounted = false);
  }, []);

  // Apply filters on rows first
  const filteredRows = React.useMemo(() => {
    let base = rows.filter(
      (r) => r.acceptDelivery && !r.dispensed && !r.logisticsAccepted
    );

    const from = parseDTLocal(fromDT);
    const to = parseDTLocal(toDT);

    if (from) base = base.filter((r) => r.createdAtTS && r.createdAtTS >= from);
    if (to) base = base.filter((r) => r.createdAtTS && r.createdAtTS <= to);

    const v = qText.trim().toLowerCase();
    if (v) {
      base = base.filter(
        (r) =>
          (r.medicineLabel || "").toLowerCase().includes(v) ||
          (r.patientName || "").toLowerCase().includes(v) ||
          (String(r.patientIdFull || "")).toLowerCase().includes(v) ||
          (r.prescriptionId || "").toLowerCase().includes(v)
      );
    }

    return base;
  }, [rows, qText, fromDT, toDT]);

  // Group by prescriptionId
  const groups = React.useMemo(() => {
    const map = new Map();

    for (const r of filteredRows) {
      // group by prescriptionId or docId 
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

      // ✅ FIX: mask based on patientIdLast4 (new field)
      const mask = first.patientIdLast4 ? String(first.patientIdLast4) : last4(first.patientIdFull);

      return {
        prescriptionId,
        patientName: first.patientName || "-",
        patientPhone: first.patientPhone || "-",
        patientIdMask: mask,
        createdAtTS,
        createdAt: first.createdAt,
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

  React.useEffect(() => setPage(0), [qText, fromDT, toDT]);

  /* Accept delivery for GROUP (one button) */
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
        LOGISTICS_ACCEPT_ADDRESS,
        LOGISTICS_ACCEPT.abi,
        signer
      );

      //  FIX: loop through ALL meds in the group and call acceptDelivery for each onchainId (contract)
      // idStr / [onchainId] 
      for (const idStr of g.onchainIds) {
        const tx = await contract.acceptDelivery(BigInt(idStr));
        await tx.wait();
      }

      await Promise.all(
        g.meds.map((r) =>
          updateDoc(doc(db, "prescriptions", r._docId), {
            logisticsAccepted: true,
            logisticsAcceptedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        )
      );

      const docIds = new Set(g.meds.map((x) => x._docId));
      setRows((prev) => prev.filter((row) => !docIds.has(row._docId)));

      setShowSuccessPopup(true);
    } catch (err) {
      console.error("Error:", err);

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
          <img
            src="/Images/TrustDose-pill.png"
            alt="TrustDose Capsule"
            style={{ width: 64 }}
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

        {/* FILTER BAR */}
        <div className="sticky top-0 z-30 mb-6">
          <div className="bg-white/95 backdrop-blur border rounded-2xl shadow-sm p-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date().toISOString().slice(0, 10);
                    setFromDT(`${today} 00:00`);
                    setToDT(`${today} 23:59`);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50"
                  style={{ color: C.ink }}
                >
                  Today
                </button>

                <button
                  type="button"
                  onClick={() => setQuickFilter(24)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50"
                  style={{ color: C.ink }}
                >
                  Last 24h
                </button>

                <button
                  type="button"
                  onClick={() => setQuickFilter(48)}
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
                    value={fromDT ? fromDT.replace(" ", "T") : ""}
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
                    value={toDT ? toDT.replace(" ", "T") : ""}
                    onChange={(e) =>
                      setToDT(e.target.value.slice(0, 16).replace("T", " "))
                    }
                    className="w-full pl-3 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2"
                    style={{ outlineColor: C.primary }}
                  />
                </div>

                <input
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                  placeholder="Search…"
                  className="w-full lg:w-[240px] px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />

                <button
                  type="button"
                  onClick={() => {
                    setFromDT("");
                    setToDT("");
                    setQText("");
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

        {/* CARDS */}
        {pageItems.length > 0 && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {pageItems.map((g) => {
              const dateTime = g.createdAtTS
                ? g.createdAtTS.toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : g.createdAt;

              const isPending = !!pending[g.prescriptionId];

              return (
                <div
                  key={g.prescriptionId}
                  className="p-4 border rounded-xl bg-white shadow-sm flex flex-col"
                  style={{
                    minHeight: 260,
                  }}
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

                      {/* إذا دواء واحد: نضيف سطر فاضي  لتثبيت الشكل */}
                      {(g.meds || []).length === 1 && (
                        <div className="text-lg font-bold text-slate-800 opacity-0 select-none">
                          placeholder
                        </div>
                      )}

                      {/* لو أكثر من 2 */}
                      {(g.meds || []).length > 2 && (
                        <div className="text-xs text-gray-500 mt-1">
                          +{g.meds.length - 2} more
                        </div>
                      )}
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

                  {/*  الزر ثابت بأسفل الكارد */}
                  <div className="mt-4">
                    <button
                      className="w-max px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-1.5 font-medium shadow-sm text-white disabled:opacity-60"
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
                        ? "Accept Delivery"
                        : "Not eligible"}
                    </button>

                    <div className="text-right text-xs text-gray-500 mt-3">
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

      {/* SUCCESS POPUP */}
      {showSuccessPopup && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div
            className="w-full max-w-sm px-6 py-5 rounded-2xl shadow-xl border"
            style={{ background: "#F6F1FA", borderColor: C.primary }}
          >
            <div className="flex flex-col items-center text-center">
              <div
                className="mx-auto mb-3 flex items-center justify-center w-12 h-12 rounded-full"
                style={{ backgroundColor: "#ECFDF3" }}
              >
                <CheckCircle2 size={28} style={{ color: "#16A34A" }} />
              </div>

              <h3 className="text-lg font-semibold mb-1" style={{ color: C.ink }}>
                Delivery accepted
              </h3>

              <p className="text-sm mt-1" style={{ color: "#64748b" }}>
                You'll see it in{" "}
                <span className="font-semibold">Pending Orders</span> once the
                pharmacy confirms dispensing.
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
