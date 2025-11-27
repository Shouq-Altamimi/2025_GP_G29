// @ts-nocheck
import React, { useMemo, useState } from "react";
import {
  Search,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useOutletContext } from "react-router-dom";

import { db } from "../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc as fsDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import { ethers } from "ethers";
import PRESCRIPTION from "../contracts/Prescription.json";
import DISPENSE from "../contracts/Dispense.json";

const PRESCRIPTION_ADDRESS = "0xEea65FEcea9c4a89e697747F0EA7AC78e4317EC0";
const DISPENSE_ADDRESS = "0x9068a1800c4b7f2F76Ff2c465eEEe099a72ebFA0";

// ===== Pagination size =====
const PAGE_SIZE = 6;

async function getSignerEnsured() {
  if (!window.ethereum) throw new Error("MetaMask not detected.");
  await window.ethereum.request({ method: "eth_requestAccounts" });
  const provider = new ethers.BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();
  const allowed = [1337n, 5777n, 31337n];
  if (!allowed.includes(network.chainId)) {
    console.warn("⚠ Unexpected chainId =", network.chainId.toString());
  }
  return provider.getSigner();
}

function nowISO() {
  return new Date().toISOString();
}

function fmt(dateISO) {
  if (!dateISO) return "-";
  const s = String(dateISO);
  return s.includes("T") ? s.replace("T", " ").slice(0, 16) : s;
}

function toEnglishDigits(s) {
  if (!s) return "";
  let out = "";
  for (const ch of String(s)) {
    const code = ch.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660);
    else if (code >= 0x06f0 && code <= 0x06f9) out += String(code - 0x06f0);
    else if (code >= 48 && code <= 57) out += ch;
  }
  return out;
}

function niceErr(e, fallback = "On-chain dispense failed.") {
  return (
    e?.shortMessage ||
    e?.reason ||
    e?.info?.error?.message ||
    e?.data?.message ||
    e?.message ||
    fallback
  );
}

const ARABIC_LETTERS_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;

const brand = {
  purple: "#B08CC1",
  purpleDark: "#9F76B4",
  teal: "#52B9C4",
  ink: "#4A2C59",
};

const card = {
  background: "#fff",
  border: "1px solid #e6e9ee",
  borderRadius: 12,
  boxShadow: "0 4px 10px rgba(0,0,0,.05)",
  padding: 16,
};

export default function PharmacyApp() {
  const [rxs, setRxs] = useState([
    {
      ref: "RX-001",
      patientId: "1001",
      patientName: "Salem",
      medicine: "Insulin",
      dose: "10u",
      timesPerDay: 2,
      durationDays: 30,
      createdAt: nowISO(),
      dispensed: false,
      accepted: false,
    },
    {
      ref: "RX-002",
      patientId: "1002",
      patientName: "Maha",
      medicine: "Panadol",
      dose: "500mg",
      timesPerDay: 3,
      durationDays: 5,
      createdAt: nowISO(),
      dispensed: false,
      accepted: false,
    },
    {
      ref: "RX-003",
      patientId: "1003",
      patientName: "Hassan",
      medicine: "Metformin",
      dose: "850mg",
      timesPerDay: 1,
      durationDays: 14,
      createdAt: nowISO(),
      dispensed: false,
      accepted: false,
    },
  ]);

  const [route] = useState("Pick Up Orders");
  const [q, setQ] = useState("");

  const rowsDelivery = useMemo(
    () => rxs.filter((r) => !r.dispensed && !r.accepted),
    [rxs]
  );
  const rowsPending = useMemo(
    () => rxs.filter((r) => !r.dispensed && r.accepted),
    [rxs]
  );

  function addNotification(payload) {
    console.log("PharmacyApp notification:", payload);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        color: brand.ink,
      }}
    >
      <main style={{ padding: 24 }}>
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          {route === "Pick Up Orders" && (
            <PickUpSection
              setRxs={setRxs}
              q={q}
              setQ={setQ}
              addNotification={addNotification}
            />
          )}
          {route === "Delivery Orders" && (
            <DeliverySection
              rows={rowsDelivery}
              setRxs={setRxs}
              addNotification={addNotification}
            />
          )}
          {route === "Pending Orders" && (
            <PendingSection
              rows={rowsPending}
              setRxs={setRxs}
              addNotification={addNotification}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function formatFsCreatedAt(v) {
  if (!v) return "-";
  if (typeof v === "string") return v;

  let d;
  try {
    if (typeof v?.toDate === "function") d = v.toDate();
    else if (typeof v?.seconds === "number")
      d = new Date(
        v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6)
      );
  } catch {}

  if (!(d instanceof Date) || isNaN(d)) return String(v);

  const base = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);

  return base.replace(",", "") + " UTC+3";
}

function PickUpSection({ setRxs, q, setQ, addNotification }) {
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [results, setResults] = useState([]);
  const [infoMsg, setInfoMsg] = useState("");
  const [validationMsg, setValidationMsg] = useState("");

  const [page, setPage] = useState(0);

  const [dispensingId, setDispensingId] = useState(null);

  // ✅ popup state
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [popupRxRef, setPopupRxRef] = useState("");

  // ✅ نجيب setPageError من الـ PharmacyShell عشان نطلع البانر الأحمر فوق الـ Welcome
  const outletCtx = useOutletContext?.() || {};
  const setPageError = outletCtx.setPageError || (() => {});

  const raw = String(q || "").trim();
  const isPatientIdMode = /^\d/.test(raw);
  const natDigitsAll = toEnglishDigits(raw).replace(/\D/g, "");
  const natDigits = isPatientIdMode ? natDigitsAll.slice(0, 10) : "";
  const rxID = !isPatientIdMode ? raw : "";

  const safeInt = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const showOrDash = (v) => {
    if (v === null || v === undefined) return "-";
    const n = Number(v);
    if (Number.isFinite(n)) return n > 0 ? n : "-";
    const s = String(v).trim();
    return s === "" || s === "0" ? "-" : s;
  };

  function normalizeFromDB(data = {}, docId = "") {
    const pid =
      data.nationalID !== undefined && data.nationalID !== null
        ? String(data.nationalID).trim()
        : "-";

    const onchain = safeInt(data.onchainId);
    const docName = data.doctorName ?? data.doctor?.name ?? "-";
    const docPhone =
      data.doctorPhone || data.doctor_phone || data.phone || "-";
    const freq =
      data.frequency ??
      data.freq ??
      (data.timesPerDay ? `${data.timesPerDay} times/day` : "-");

    return {
      ref: data.prescriptionID || docId || "-",
      onchainId: onchain,
      patientId: pid,
      patientName: data.patientName || "-",
      medicine: data.medicineName || data.medicine || "-",
      medicineLabel: data.medicineLabel || undefined,
      dosageForm: data.dosageForm || undefined,
      dose: data.dosage || data.dose || "-",
      timesPerDay: showOrDash(data.timesPerDay),
      durationDays: showOrDash(data.durationDays),
      createdAt: formatFsCreatedAt(data.createdAt),
      createdAtTS: data?.createdAt?.toDate?.() || undefined,

      status: data.status || "-",
      dispensed: !!data.dispensed,
      dispensedAt: data.dispensedAt
        ? formatFsCreatedAt(data.dispensedAt)
        : undefined,
      dispensedBy: data.dispensedBy || undefined,
      sensitivity: data.sensitivity || "-",
      medicalCondition: data.medicalCondition || data.reason || "",
      notes: data.notes || "",

      doctorName: docName,
      doctorPhone: docPhone,
      doctorFacility: data.doctorFacility || "",

      frequency: freq,

      _docId: docId,
    };
  }

  function handleChange(v) {
    const s = String(v).replace(ARABIC_LETTERS_RE, "");
    const rxFormatRe = /^[a-zA-Z]\d{4,}$/;

    if (/^\d/.test(s)) {
      const digits = toEnglishDigits(s).replace(/\D/g, "").slice(0, 10);
      setQ(digits);
      if (digits.length && digits[0] !== "1" && digits[0] !== "2") {
        setValidationMsg("National ID must start with 1 or 2.");
      } else if (digits.length > 0 && digits.length < 10) {
        setValidationMsg("National ID must be 10 digits.");
      } else {
        setValidationMsg("");
      }
    } else {
      setQ(s);
      if (s.length > 0 && !rxFormatRe.test(s)) {
        setValidationMsg(
          "Prescription ID must be 1 letter followed by 4 or more digits."
        );
      } else {
        setValidationMsg("");
      }
    }
    setSearched(false);
    setResults([]);
    setError("");
    setInfoMsg("");
    setPage(0); // reset pagination on input change
  }

  async function runSearch() {
    setSearched(true);
    setLoading(true);
    setError("");
    setResults([]);
    setInfoMsg("");
    setPage(0); // reset to first page on new search
    setPageError(""); // نمسح أي بانر قديم

    if (validationMsg) {
      setLoading(false);
      return;
    }

    if (isPatientIdMode) {
      const firstOk =
        natDigits.length > 0 &&
        (natDigits[0] === "1" || natDigits[0] === "2");
      const lenOk = natDigits.length === 10;
      if (!firstOk || !lenOk) {
        setLoading(false);
        setValidationMsg(
          !firstOk
            ? "National ID must start with 1 or 2."
            : "National ID must be 10 digits."
        );
        return;
      }
    }

    try {
      const col = collection(db, "prescriptions");

      // Prescription ID lookup
      if (rxID) {
        const snap = await getDocs(
          query(col, where("prescriptionID", "==", rxID))
        );
        if (!snap.empty) {
          const d = snap.docs[0];
          const n = normalizeFromDB(d.data(), d.id);

          const isNonSensitive =
            String(n.sensitivity || "").toLowerCase() === "nonsensitive";
          if (!isNonSensitive) {
            setError(
              "This prescription is for a sensitive medication and cannot be dispensed ."
            );
            setResults([]);
            setLoading(false);
            return;
          }

          setResults([n]);
        } else {
          setResults([]);
        }
        setLoading(false);
        return;
      }

      // National ID lookup
      const tasks = [
        getDocs(
          query(
            col,
            where("nationalID", "==", natDigits),
            where("dispensed", "==", false),
            where("sensitivity", "==", "NonSensitive")
          )
        ),
      ];
      const nNum = Number(natDigits);
      if (!Number.isNaN(nNum)) {
        tasks.push(
          getDocs(
            query(
              col,
              where("nationalID", "==", nNum),
              where("dispensed", "==", false),
              where("sensitivity", "==", "NonSensitive")
            )
          )
        );
      }

      const snaps = await Promise.all(tasks);

      const seen = new Set();
      const list = [];
      for (const s of snaps) {
        if (!s || s.empty) continue;
        s.forEach((doc) => {
          if (seen.has(doc.id)) return;
          seen.add(doc.id);
          const n = normalizeFromDB(doc.data(), doc.id);
          if (
            n.sensitivity === "NonSensitive" &&
            n.dispensed === false &&
            Number.isFinite(n.onchainId)
          ) {
            list.push(n);
          }
        });
      }

      if (list.length === 0) {
        const fbTasks = [
          getDocs(query(col, where("nationalID", "==", natDigits))),
        ];
        if (!Number.isNaN(nNum))
          fbTasks.push(
            getDocs(query(col, where("nationalID", "==", nNum)))
          );
        const fbSnaps = await Promise.all(fbTasks);
        const haveAny = fbSnaps.some((s) => s && !s.empty);

        if (haveAny) {
          setInfoMsg(
            "No eligible pickup prescriptions. They may be sensitive, already dispensed, or missing on-chain id."
          );
        } else {
          setError("The national ID you entered isn't registered in our system.");
        }
      }

      list.sort(
        (a, b) =>
          (b.createdAtTS?.getTime?.() || 0) -
          (a.createdAtTS?.getTime?.() || 0)
      );
      setResults(list);
    } catch (e) {
      console.error(e);
      setError("Error fetching from database. Please try again.");
      setResults([]);
      setPageError("Error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function resetSearch() {
    setQ("");
    setSearched(false);
    setResults([]);
    setError("");
    setInfoMsg("");
    setValidationMsg("");
    setPage(0);
    setPageError("");
  }

  async function markDispensed(item) {
    if (!item || !item._docId) return;

    if (item.dispensed) {
      setInfoMsg("This prescription was already dispensed.");
      return;
    }
    if (item.sensitivity !== "NonSensitive") return;

    if (!Number.isFinite(item.onchainId)) {
      setError("On-chain id is missing for this prescription.");
      return;
    }

    try {
      setDispensingId(item._docId);
      setLoading(true);
      setError("");
      setInfoMsg("");
      setPageError(""); // نمسح أي بانر خطأ قبل ما نبدأ محاولة جديدة

      const signer = await getSignerEnsured();
      const pharmacistAddr = await signer.getAddress();

      const presc = new ethers.Contract(
        PRESCRIPTION_ADDRESS,
        PRESCRIPTION.abi,
        signer
      );
      const dispense = new ethers.Contract(
        DISPENSE_ADDRESS,
        DISPENSE.abi,
        signer
      );

      const linked = await dispense.prescription();
      if (linked?.toLowerCase?.() !== PRESCRIPTION_ADDRESS.toLowerCase()) {
        setError(
          "Dispense contract is linked to a different Prescription address."
        );
        setLoading(false);
        setDispensingId(null);
        return;
      }

      const isPh = await dispense.isPharmacist(pharmacistAddr);
      if (!isPh) {
        setError(
          "Your wallet is not enabled as a pharmacist on-chain (Not pharmacist)."
        );
        setLoading(false);
        setDispensingId(null);
        return;
      }

      const stillValid = await presc.isValid(item.onchainId);
      if (!stillValid) {
        setError("Prescription is expired or inactive on-chain.");
        setLoading(false);
        setDispensingId(null);
        return;
      }

      const tx = await dispense.dispense(item.onchainId);
      const receipt = await tx.wait();
      const txHash = receipt?.hash || tx.hash;

      const docRef = fsDoc(db, "prescriptions", item._docId);
      await updateDoc(docRef, {
        dispensed: true,
        dispensedAt: serverTimestamp(),
        dispensedBy: pharmacistAddr,
        dispenseTx: txHash,
      });

      setResults((prev) =>
        prev.map((r) =>
          r._docId === item._docId
            ? {
                ...r,
                dispensed: true,
                dispensedAt: new Date().toISOString(),
                dispensedBy: pharmacistAddr,
                dispenseTx: txHash,
              }
            : r
        )
      );

      addNotification(
        `Prescription ${item.ref} dispensed on-chain ✓`
      );

      // ✅ فعّل بوب أب النجاح
      setPopupRxRef(
        item.ref || item.prescriptionID || item._docId || ""
      );
      setShowSuccessPopup(true);
    } catch (e) {
      console.error(e);

      // ✅ MetaMask رفضت → نرسل نفس الرسالة للـ Shell عشان يطلع البانر الأحمر
      if (e?.code === "ACTION_REJECTED" || e?.code === 4001) {
        setPageError("MetaMask request was declined. Please try again.");
        setError(""); // ما نعرض رسالة ثانية تحت
      } else {
        setError(niceErr(e));
        setPageError("Error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
      setDispensingId(null);
    }
  }

  // ===== Derived pagination values
  const total = results.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  const pageItems = results.slice(start, end);

  React.useEffect(() => setPage(0), [JSON.stringify(results)]);

  return (
    <section style={{ display: "grid", gap: 20 }}>
      {/* Search */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Search size={20} style={{ color: brand.purple }} />
          <span style={{ color: brand.ink }}> Search Prescriptions </span>
        </h2>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:border-transparent transition-all"
              style={{ outlineColor: brand.purple }}
              placeholder="Enter Patient ID (10 digits, starts with 1 or 2) or Prescription ID (1 letter + 4+ digits)"
              value={q}
              maxLength={50}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
              inputMode="numeric"
            />
            {!!q && (
              <button
                type="button"
                onClick={resetSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 hover:opacity-80"
                style={{ color: brand.ink }}
                aria-label="Clear"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={runSearch}
            className="px-6 py-3 text-white rounded-xl transition-colors flex items-center gap-2 font-medium disabled:opacity-60"
            style={{ backgroundColor: brand.purple }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = brand.purpleDark)
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = brand.purple)
            }
            disabled={loading || !q.trim() || !!validationMsg}
          >
            {loading ? (
              "Searching..."
            ) : (
              <>
                <Search size={18} /> Search
              </>
            )}
          </button>
        </div>

        {(!!q || results.length > 0) && (
          <div className="flex justify-end mt-2">
            <button
              onClick={resetSearch}
              className="px-6 py-3 rounded-xl font-medium"
              style={{ background: "#F3F4F6", color: "#374151" }}
            >
              Clear Search
            </button>
          </div>
        )}

        {(validationMsg || error || infoMsg) && (
          <div
            className={`mt-3 text-sm flex items-center gap-2 ${
              validationMsg || error ? "text-rose-700" : "text-gray-700"
            }`}
          >
            <AlertCircle size={16} />
            <span>{validationMsg || error || infoMsg}</span>
          </div>
        )}
      </section>

      {searched &&
        !loading &&
        results.length === 0 &&
        !error &&
        !infoMsg &&
        !validationMsg && (
          <div className="text-gray-600">
            No matching prescriptions found.
          </div>
        )}

      {/* Grid with pagination: 1 col mobile / 2 cols desktop */}
      {results.length > 0 && (
        <>
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pageItems.map((r) => {
              const eligible =
                String(r.sensitivity || "").toLowerCase() ===
                  "nonsensitive" &&
                r.dispensed === false &&
                Number.isFinite(r.onchainId);

              const isThisLoading = dispensingId === r._docId;

              const dateTime = r.createdAtTS
                ? r.createdAtTS.toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : r.createdAt || "-";

              const prescriber = r.doctorName
                ? `Dr. ${r.doctorName}`
                : r.dispensedBy || "-";
              const facility = r.doctorFacility
                ? ` — ${r.doctorFacility}`
                : "";
              const medTitle = r.medicineLabel || r.medicine || "—";

              return (
                <div
                  key={r._docId}
                  className="p-4 border rounded-xl bg-white shadow-sm flex flex-col justify-between"
                >
                  <div>
                    {/* Title */}
                    <div className="text-lg font-bold text-slate-800 truncate">
                      {medTitle}
                    </div>

                    {/* Pharmacy extras */}
                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Prescription ID:{" "}
                      <span className="font-normal">
                        {String(
                          r.ref ||
                            r.prescriptionID ||
                            r.prescriptionId ||
                            r._docId ||
                            "—"
                        )}
                      </span>
                    </div>
                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Patient:{" "}
                      <span className="font-normal">
                        {r.patientName || "—"}
                        {r.patientId
                          ? ` — ${String(r.patientId)}`
                          : ""}
                      </span>
                    </div>
                    <div className="text-sm text-slate-700 mt-1 font-semibold">
                      Doctor Phone:{" "}
                      <span className="font-normal">
                        {String(r.doctorPhone || "—")}
                      </span>
                    </div>

                    {/* Details */}
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
                        {r.dose || r.dosage || "—"} •{" "}
                        {r.frequency || "—"} •{" "}
                        {r.durationDays || r.duration || "—"}
                      </span>
                    </div>

                    <div className="text-sm text-slate-700 mt-2 font-semibold">
                      Medical Condition:{" "}
                      <span className="font-normal">
                        {r.medicalCondition || "—"}
                      </span>
                    </div>

                    {/* Notes area */}
                    <div className="mt-1 min-h-[28px]">
                      {!!r.notes && (
                        <div className="text-sm text-slate-700 font-semibold">
                          Notes:{" "}
                          <span className="font-normal">
                            {r.notes}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Confirm & Dispense button */}
                    <div className="mt-1 flex justify-start">
                      <button
                        onClick={() => markDispensed(r)}
                        disabled={
                          !eligible || r.dispensed || isThisLoading
                        }
                        className="w-max px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-1.5 font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-white"
                        style={{
                          backgroundColor: isThisLoading
                            ? "rgba(176,140,193,0.6)"
                            : brand.purple,
                        }}
                        onMouseEnter={(e) => {
                          if (!e.currentTarget.disabled)
                            e.currentTarget.style.backgroundColor =
                              brand.purpleDark;
                        }}
                        onMouseLeave={(e) => {
                          if (!e.currentTarget.disabled)
                            e.currentTarget.style.backgroundColor =
                              brand.purple;
                        }}
                        title={
                          r.dispensed
                            ? "Prescription already dispensed"
                            : !Number.isFinite(r.onchainId)
                            ? "Missing on-chain id"
                            : "Confirm & Dispense"
                        }
                      >
                        {isThisLoading ? (
                          <>
                            <Loader2
                              size={16}
                              className="animate-spin text-white"
                            />
                            <span className="text-white">
                              Processing…
                            </span>
                          </>
                        ) : (
                          <>
                            <FileText
                              size={16}
                              className="text-white"
                            />
                            <span className="text-white">
                              {r.dispensed
                                ? "✓ Dispensed"
                                : eligible
                                ? "Confirm & Dispense"
                                : "Not eligible"}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* date */}
                  <div className="text-right text-xs text-gray-500 mt-1">
                    Prescription issued on {dateTime}
                  </div>
                </div>
              );
            })}
          </section>

          {/* Pagination footer (like Doctor page) */}
          <div className="mt-auto pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
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
                  style={{ background: brand.purple }}
                  onClick={() =>
                    setPage((p) =>
                      Math.min(pageCount - 1, p + 1)
                    )
                  }
                  disabled={page >= pageCount - 1}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ✅ Success popup like Doctor */}
      {showSuccessPopup && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div
            className="w-full max-w-sm px-6 py-5 rounded-2xl shadow-xl border"
            style={{
              background: "#F6F1FA",
              borderColor: brand.purple,
            }}
          >
            <div className="flex flex-col items-center text-center">
              <div
                className="mx-auto mb-3 flex items-center justify-center w-12 h-12 rounded-full"
                style={{ backgroundColor: "#ECFDF3" }}
              >
                <CheckCircle2
                  size={28}
                  style={{ color: "#16A34A" }}
                />
              </div>
              <h3
                className="text-lg font-semibold mb-1"
                style={{ color: brand.ink }}
              >
                Prescription dispensed successfully
              </h3>
              <p
                className="text-sm mb-4"
                style={{ color: "#4B5563" }}
              >
                The prescription has been dispensed .
                {popupRxRef && (
                  <>
                    <br />
                    Prescription ID: {popupRxRef}
                  </>
                )}
              </p>
              <button
                onClick={() => setShowSuccessPopup(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-medium shadow-sm"
                style={{
                  backgroundColor: brand.purple,
                  color: "#FFFFFF",
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* Delivery & Pending (unchanged visuals) */
function DeliverySection({ rows = [], setRxs, addNotification }) {
  function acceptOrder(rxRef) {
    setRxs((prev) =>
      prev.map((rx) =>
        rx.ref === rxRef
          ? { ...rx, accepted: true, acceptedAt: nowISO() }
          : rx
      )
    );
    addNotification(
      `Prescription ${rxRef} accepted for delivery`
    );
  }
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h1>Delivery Orders</h1>
      {rows.map((r) => (
        <div key={r.ref} style={card}>
          <div>
            <b>Prescription {r.ref}</b>
          </div>
          <div>
            Patient: {r.patientName} ({r.patientId})
          </div>
          <div>Medicine: {r.medicine}</div>
          <div>Dose: {r.dose}</div>
          <div>Times/Day: {r.timesPerDay}</div>
          <div>Duration: {r.durationDays} days</div>
          <div>Created: {fmt(r.createdAt)}</div>
          {r.acceptedAt && (
            <div>Accepted At: {fmt(r.acceptedAt)}</div>
          )}
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => acceptOrder(r.ref)}
              className="px-6 py-3 rounded-xl font-medium"
              style={{ background: "#F3F4F6", color: "#374151" }}
              disabled={r.accepted}
            >
              {r.accepted ? "✓ Accepted" : "Accept"}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

function PendingSection({ rows = [], setRxs, addNotification }) {
  function cancel(rxRef) {
    setRxs((prev) =>
      prev.map((rx) =>
        rx.ref === rxRef
          ? { ...rx, accepted: false, acceptedAt: undefined }
          : rx
      )
    );
    addNotification({
      type: "cancel",
      ref: rxRef,
      text: `Prescription ${rxRef} cancelled`,
    });
  }
  function contact(rxRef) {
    setRxs((prev) =>
      prev.map((rx) =>
        rx.ref === rxRef
          ? { ...rx, contactedAt: nowISO() }
          : rx
      )
    );
    addNotification(
      `Prescription ${rxRef} contacted logistics`
    );
  }
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h1>Pending Orders</h1>
      {rows.map((r) => (
        <div key={r.ref} style={card}>
          <div>
            <b>Prescription {r.ref}</b>
          </div>
          <div>
            Patient: {r.patientName} ({r.patientId})
          </div>
          <div>Medicine: {r.medicine}</div>
          <div>Dose: {r.dose}</div>
          <div>Times/Day: {r.timesPerDay}</div>
          <div>Duration: {r.durationDays} days</div>
          <div>Accepted At: {fmt(r.acceptedAt)}</div>
          {r.contactedAt && (
            <div>Contacted At: {fmt(r.contactedAt)}</div>
          )}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 8,
            }}
          >
            <button
              onClick={() => cancel(r.ref)}
              className="px-6 py-3 rounded-xl font-medium"
              style={{ background: "#F3F4F6", color: "#374151" }}
            >
              Cancel
            </button>
            <button
              onClick={() => contact(r.ref)}
              className="px-6 py-3 rounded-xl font-medium"
              style={{
                background: r.contactedAt
                  ? "#d1fae5"
                  : "#F3F4F6",
                color: "#374151",
              }}
              disabled={!!r.contactedAt}
            >
              {r.contactedAt ? "✓ Contacted" : "Contact"}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
