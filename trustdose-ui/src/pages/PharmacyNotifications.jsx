// src/pages/PharmacyNotifications.jsx
"use client";

import React from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  writeBatch,
  limit,
  deleteField,
} from "firebase/firestore";

import {
  Loader2,
  Bell,
  Clock,
  CheckCircle2,
  AlertCircle,
  ThermometerSnowflake,
} from "lucide-react";
import { logEvent } from "../utils/logEvent";

const C = {
  primary: "#B08CC1",
  primaryDark: "#9F76B4",
  teal: "#52B9C4",
  ink: "#4A2C59",
};

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
  } catch {}
  return String(v);
}

function toMs(ts) {
  if (!ts) return null;
  try {
    if (typeof ts?.toDate === "function") return ts.toDate().getTime();
  } catch {}
  if (typeof ts === "number") return ts;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function isReadVal(v) {
  return v === true || v === "true";
}

async function resolvePharmacyDocId() {
  const phId =
    localStorage.getItem("userId") ||
    localStorage.getItem("pharmacyId") ||
    localStorage.getItem("pharmacyID") ||
    localStorage.getItem("PharmacyID") ||
    "";

  if (!phId) return null;

  const byId = await getDoc(doc(db, "pharmacies", String(phId)));
  if (byId.exists()) return String(phId);

  const col = collection(db, "pharmacies");
  const tries = [
    query(col, where("PharmacyID", "==", String(phId))),
    query(col, where("pharmacyId", "==", String(phId))),
    query(col, where("pharmacyID", "==", String(phId))),
  ];

  for (const tq of tries) {
    const qs = await getDocs(tq);
    if (!qs.empty) return qs.docs[0].id;
  }

  return null;
}

function getTypeUi(type) {
  const t = String(type || "");

  if (t === "DELIVERY_OVERDUE_48H") {
    return {
      iconBg: "rgba(220,38,38,0.10)",
      icon: <Clock size={20} style={{ color: "#DC2626" }} />,
      badgeText: "Overdue (48h)",
      badgeStyle: {
        color: "#DC2626",
        borderColor: "rgba(220,38,38,0.35)",
        backgroundColor: "rgba(220,38,38,0.08)",
      },
      titleFallback: "Delivery overdue (48h)",
    };
  }

  if (t === "TEMP_OUT_OF_RANGE") {
    return {
      iconBg: "rgba(245,158,11,0.14)",
      icon: <ThermometerSnowflake size={20} style={{ color: "#F59E0B" }} />,
      badgeText: "Out of range",
      badgeStyle: {
        color: "#92400E",
        borderColor: "rgba(245,158,11,0.35)",
        backgroundColor: "rgba(245,158,11,0.10)",
      },
      titleFallback: "Temperature alert",
    };
  }

  return {
    iconBg: "rgba(176,140,193,0.15)",
    icon: <Bell size={20} style={{ color: C.ink }} />,
    badgeText: null,
    badgeStyle: null,
    titleFallback: "Notification",
  };
}

async function findPrescriptionDocs(pid) {
  const p = String(pid || "").trim();
  if (!p) return [];

  const docs = [];
  const seen = new Set();

  const byIdRef = doc(db, "prescriptions", p);
  const byIdSnap = await getDoc(byIdRef);
  if (byIdSnap.exists()) {
    seen.add(byIdSnap.id);
    docs.push(byIdSnap);
  }

  const s1 = await getDocs(
    query(collection(db, "prescriptions"), where("prescriptionID", "==", p), limit(20))
  );
  s1.forEach((d) => {
    if (seen.has(d.id)) return;
    seen.add(d.id);
    docs.push(d);
  });

  const s2 = await getDocs(
    query(collection(db, "prescriptions"), where("prescriptionId", "==", p), limit(20))
  );
  s2.forEach((d) => {
    if (seen.has(d.id)) return;
    seen.add(d.id);
    docs.push(d);
  });

  const [s3, s4] = await Promise.all([
    getDocs(
      query(
        collection(db, "prescriptions"),
        where("items.0.prescriptionID", "==", p),
        limit(20)
      )
    ),
    getDocs(
      query(
        collection(db, "prescriptions"),
        where("items.1.prescriptionID", "==", p),
        limit(20)
      )
    ),
  ]);

  for (const snap of [s3, s4]) {
    snap.forEach((d) => {
      if (seen.has(d.id)) return;
      seen.add(d.id);
      docs.push(d);
    });
  }

  return docs;
}

async function resetPrescriptionForOutOfRange(pid) {
  const docs = await findPrescriptionDocs(pid);
  if (!docs.length) return false;

  await Promise.all(
    docs.map((snap) =>
      updateDoc(snap.ref, {
        acceptDelivery: false,
        dispensed: false,
        logisticsAccepted: false,
        deliveryConfirmed: false,
        deliveryOverdue24Notified: false,
        deliveryOverdue48Notified: false,
        invalidReason: "TEMP_OUT_OF_RANGE",
        breachReason: "TEMP_OUT_OF_RANGE",
        acceptDeliveryAt: deleteField(),
        acceptDeliveryTx: deleteField(),
        acceptDeliveryTxs: deleteField(),
        logisticsAcceptedAt: deleteField(),
        deliveryConfirmedAt: deleteField(),
        dispensedAt: deleteField(),
        dispensedBy: deleteField(),
        dispenseTx: deleteField(),
        updatedAt: serverTimestamp(),
      })
    )
  );

  return true;
}

async function resetPrescriptionFor48h(pid) {
  const docs = await findPrescriptionDocs(pid);
  if (!docs.length) return false;

  await Promise.all(
    docs.map((snap) => {
      const rx = snap.data() || {};
      return updateDoc(snap.ref, {
        logisticsAccepted: false,
        logisticsAcceptedAt: deleteField(),
        acceptDelivery: false,
        acceptDeliveryAt: deleteField(),
        acceptDeliveryTx: deleteField(),
        overdue48BaseAt: rx.logisticsAcceptedAt || serverTimestamp(),
        overdue48HandledAt: serverTimestamp(),
        overdue48Reason: "DELIVERY_NOT_COMPLETED_48H",
        breachReason: "DELIVERY_NOT_COMPLETED_48H",
        updatedAt: serverTimestamp(),
      });
    })
  );

  return true;
}

export default function PharmacyNotifications() {
  const [loading, setLoading] = React.useState(true);
  const [pharmacyDocId, setPharmacyDocId] = React.useState(null);
  const [header, setHeader] = React.useState({ companyName: "" });
  const [listenErr, setListenErr] = React.useState("");
  const [items, setItems] = React.useState([]);

  const processedReadingIdsRef = React.useRef(new Set());
  const processed48WriterRef = React.useRef(new Set());

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const docId = await resolvePharmacyDocId();
        if (!mounted) return;

        setPharmacyDocId(docId);

        if (docId) {
          const snap = await getDoc(doc(db, "pharmacies", docId));
          if (snap.exists()) {
            const d = snap.data() || {};
            setHeader({
              companyName: d.companyName || d.name || d.pharmacyName || "",
            });
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!pharmacyDocId) return;

    const qOrdered = query(
      collection(db, "iotReadings"),
      where("outOfRange", "==", true),
      orderBy("createdAt", "desc"),
      limit(10)
    );

    const qPlain = query(
      collection(db, "iotReadings"),
      where("outOfRange", "==", true),
      limit(10)
    );

    let unsub = null;

    const handleSnap = async (snap) => {
      if (snap.empty) return;

      for (const d of snap.docs) {
        const readingId = d.id;
        if (processedReadingIdsRef.current.has(readingId)) continue;
        processedReadingIdsRef.current.add(readingId);

        const r = d.data() || {};
        const pid = String(r.prescriptionId || r.prescriptionID || "").trim();
        if (!pid) continue;

        const deviceId = String(r.deviceId || "").trim();
        const notifId = `temp_${pharmacyDocId}_${pid}`;
        const notifRef = doc(db, "notifications", notifId);

        const existsSnap = await getDoc(notifRef);
        if (!existsSnap.exists()) {
          await setDoc(notifRef, {
            toRole: "pharmacy",
            toPharmacyDocId: pharmacyDocId,
            type: "TEMP_OUT_OF_RANGE",
            title: "Temperature alert",
            message: `Prescription ${pid} is marked invalid due to unsafe temperature and has been returned to Delivery Orders.`,
            orderId: pid,
            prescriptionID: pid,
            deviceId,
            read: false,
            createdAt: serverTimestamp(),
          });
        }

        try {
          const resetDone = await resetPrescriptionForOutOfRange(pid);

          if (resetDone) {
            await logEvent(
              `Pharmacy reset prescription ${pid} after temperature out of range`,
              "pharmacy",
              "prescription_reset_out_of_range"
            );
          }
        } catch (e) {
          console.error("resetPrescriptionForOutOfRange failed:", e);
          await logEvent(
            `Pharmacy failed to reset prescription ${pid} after temperature out of range: ${e?.message || "unknown error"}`,
            "pharmacy",
            "prescription_reset_out_of_range_error"
          );
        }
      }
    };

    const attach = (qq, label) => {
      unsub = onSnapshot(
        qq,
        async (snap) => {
          try {
            await handleSnap(snap);
          } catch (e) {
            console.error("iotReadings -> pharmacy notif/reset failed:", e);
          }
        },
        (err) => {
          console.error(`iotReadings listen error (${label}):`, err);

          const msg = String(err?.message || "").toLowerCase();
          const isIndex =
            err?.code === "failed-precondition" ||
            msg.includes("requires an index") ||
            msg.includes("index");

          if (isIndex && label === "ordered") {
            try {
              if (unsub) unsub();
            } catch {}
            attach(qPlain, "plain");
          }
        }
      );
    };

    attach(qOrdered, "ordered");

    return () => {
      try {
        if (unsub) unsub();
      } catch {}
    };
  }, [pharmacyDocId]);

  React.useEffect(() => {
    if (!pharmacyDocId) return;

    let unsub = null;
    let canceled = false;

    const qRx = query(
      collection(db, "prescriptions"),
      where("deliveryConfirmed", "==", false)
    );

    unsub = onSnapshot(
      qRx,
      async (snap) => {
        if (canceled) return;

        const now = Date.now();
        const cutoff48 = now - 48 * 60 * 60 * 1000;

        const tasks = [];
        const seenPrescriptionIds = new Set();

        snap.forEach((d) => {
          const rx = d.data() || {};
          const orderId = d.id;

          if (rx.deliveryConfirmed === true) return;
          if (rx.logisticsAccepted !== true) return;

          const acceptedMs = toMs(rx.logisticsAcceptedAt);
          if (!acceptedMs) return;
          if (acceptedMs > cutoff48) return;

          const prescriptionId =
            rx.prescriptionID ||
            rx.prescriptionId ||
            rx.prescriptionNum ||
            rx.prescriptionNumber ||
            orderId;

          const pid = String(prescriptionId);

          if (seenPrescriptionIds.has(pid)) return;
          seenPrescriptionIds.add(pid);

          const notifId = `ph48_${pharmacyDocId}_${pid}`;
          const notifRef = doc(db, "notifications", notifId);

          if (processed48WriterRef.current.has(notifId)) return;
          processed48WriterRef.current.add(notifId);

          tasks.push(
            (async () => {
              try {
                const existsSnap = await getDoc(notifRef);
                if (!existsSnap.exists()) {
                  await setDoc(notifRef, {
                    toRole: "pharmacy",
                    toPharmacyDocId: pharmacyDocId,
                    type: "DELIVERY_OVERDUE_48H",
                    title: "Delivery overdue (48h)",
                    message: `Prescription ${pid} has not been completed within 48 hours and has been returned to Delivery Orders.`,
                    orderId,
                    prescriptionID: pid,
                    read: false,
                    createdAt: serverTimestamp(),
                  });
                }

                await resetPrescriptionFor48h(pid);

                const patientDocId = String(rx.patientDocId || "");
                if (patientDocId) {
                  const patientNotifId = `pt48_${patientDocId}_${pid}`;
                  const patientNotifRef = doc(db, "notifications", patientNotifId);
                  const patientExists = await getDoc(patientNotifRef);

                  if (!patientExists.exists()) {
                    await setDoc(patientNotifRef, {
                      toRole: "patient",
                      toPatientDocId: patientDocId,
                      type: "PRESCRIPTION_REDISPENSED_48H",
                      title: "Prescription Returned",
                      message: `Your prescription ${pid} has been returned for redispensing because delivery was not completed within 48 hours.`,
                      orderId,
                      prescriptionID: pid,
                      read: false,
                      createdAt: serverTimestamp(),
                    });
                  }
                }
              } catch (e) {
                console.error("Create pharmacy 48h notification failed:", e);
              }
            })()
          );
        });

        if (tasks.length) await Promise.all(tasks);
      },
      (err) => {
        console.error("prescriptions listen error (48h writer):", err);
        setListenErr("Missing or insufficient permissions (rules).");
      }
    );

    return () => {
      canceled = true;
      try {
        if (unsub) unsub();
      } catch {}
    };
  }, [pharmacyDocId]);

  React.useEffect(() => {
    if (!pharmacyDocId) return;

    setListenErr("");
    setLoading(true);

    let unsub = null;

    const base = [where("toRole", "==", "pharmacy")];

    const orderedQ = query(
      collection(db, "notifications"),
      ...base,
      orderBy("createdAt", "desc")
    );

    const plainQ = query(collection(db, "notifications"), ...base);

    const dedupNotifications = (arr) => {
      const m = new Map();

      for (const n of arr) {
        const pid = String(n.prescriptionID || n.orderId || n.id || "");
        const key = `${String(n.type || "")}__${pid}`;

        const prev = m.get(key);
        if (!prev) {
          m.set(key, n);
          continue;
        }

        const prevMs = toMs(prev.createdAt) ?? 0;
        const curMs = toMs(n.createdAt) ?? 0;

        const latest = curMs >= prevMs ? n : prev;
        const mergedRead = isReadVal(prev.read) && isReadVal(n.read);

        m.set(key, { ...latest, read: mergedRead });
      }

      return Array.from(m.values()).sort(
        (a, b) => (toMs(b.createdAt) ?? 0) - (toMs(a.createdAt) ?? 0)
      );
    };

    const attach = (qq, label) => {
      unsub = onSnapshot(
        qq,
        (snap) => {
          const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setItems(dedupNotifications(raw));
          setLoading(false);
          setListenErr("");
        },
        (err) => {
          console.error(`notifications listen error (${label}):`, err);

          const msg = String(err?.message || "").toLowerCase();
          const isIndex =
            err?.code === "failed-precondition" ||
            msg.includes("requires an index") ||
            msg.includes("index");

          if (isIndex && label === "ordered") {
            try {
              if (unsub) unsub();
            } catch {}
            attach(plainQ, "plain");
            return;
          }

          setLoading(false);
          setItems([]);
          setListenErr("Missing or insufficient permissions (rules).");
        }
      );
    };

    attach(orderedQ, "ordered");

    return () => {
      try {
        if (unsub) unsub();
      } catch {}
    };
  }, [pharmacyDocId]);

  const unreadCount = items.filter((n) => !isReadVal(n.read)).length;

  async function markAsRead(n) {
    try {
      setListenErr("");

      const pid = String(n.prescriptionID || n.orderId || "");
      const typ = String(n.type || "");
      if (!pid || !typ || !pharmacyDocId) return;

      setItems((prev) =>
        prev.map((x) => {
          const xPid = String(x.prescriptionID || x.orderId || "");
          const xTyp = String(x.type || "");
          if (xPid === pid && xTyp === typ) return { ...x, read: true };
          return x;
        })
      );

      const qAll = query(
        collection(db, "notifications"),
        where("toRole", "==", "pharmacy"),
        where("type", "==", typ),
        where("prescriptionID", "==", pid)
      );

      const snap = await getDocs(qAll);

      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
      await batch.commit();
    } catch (e) {
      console.error("markAsRead failed:", e);
      setListenErr("Could not mark as read (permissions/rules). Check console.");
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
        {listenErr && (
          <div className="mb-4 p-4 rounded-xl flex items-center gap-2 text-red-700 bg-red-100 border border-red-300">
            <AlertCircle size={20} />
            <span className="text-sm font-medium">{listenErr}</span>
          </div>
        )}

        <div className="mb-6 flex items-center">
          <div className="w-full">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="font-extrabold text-[24px]" style={{ color: "#334155" }}>
                  {header.companyName
                    ? `Notifications — ${header.companyName}`
                    : "Notifications"}
                </h1>

                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-[15px] font-medium" style={{ color: "#64748b" }}>
                    Reminder alerts
                  </p>
                </div>
              </div>

              <span
                className="px-3 py-1 rounded-full text-sm font-semibold border"
                style={{
                  color: unreadCount > 0 ? "#DC2626" : C.ink,
                  borderColor:
                    unreadCount > 0
                      ? "rgba(220,38,38,0.35)"
                      : "rgba(176,140,193,0.35)",
                  backgroundColor:
                    unreadCount > 0
                      ? "rgba(220,38,38,0.08)"
                      : "rgba(176,140,193,0.08)",
                }}
              >
                Unread: {unreadCount}
              </span>
            </div>
          </div>
        </div>

        {items.length === 0 && (
          <div className="p-8 border rounded-2xl bg-white shadow-sm text-center">
            <div
              className="mx-auto mb-3 flex items-center justify-center w-12 h-12 rounded-full"
              style={{ backgroundColor: "#ECFDF3" }}
            >
              <CheckCircle2 size={24} style={{ color: "#16A34A" }} />
            </div>

            <h3 className="text-lg font-semibold mb-1" style={{ color: C.ink }}>
              All caught up
            </h3>
            <p className="text-sm" style={{ color: "#64748b" }}>
              No notifications at the moment.
            </p>
          </div>
        )}

        {items.length > 0 && (
          <section className="grid grid-cols-1 gap-4 mt-4">
            {items.map((n) => {
              const isUnread = !isReadVal(n.read);
              const prescriptionId = n.prescriptionID || n.orderId || "—";
              const ui = getTypeUi(n.type);

              return (
                <div
                  key={n.id}
                  className="p-4 border rounded-2xl bg-white shadow-sm flex items-start justify-between gap-3"
                  style={{
                    borderColor: isUnread
                      ? "rgba(176,140,193,0.55)"
                      : "rgba(226,232,240,1)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="h-11 w-11 rounded-2xl flex items-center justify-center"
                      style={{ backgroundColor: ui.iconBg }}
                    >
                      {ui.icon}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm font-bold text-slate-800">
                          {n.title || ui.titleFallback}
                        </div>

                        {ui.badgeText && (
                          <span
                            className="px-2.5 py-1 rounded-full text-xs font-semibold border"
                            style={ui.badgeStyle}
                          >
                            {ui.badgeText}
                          </span>
                        )}

                        {isUnread && (
                          <span
                            className="px-2.5 py-1 rounded-full text-xs font-semibold border"
                            style={{
                              color: "#166534",
                              borderColor: "#BBE5C8",
                              backgroundColor: "#ECFDF3",
                            }}
                          >
                            New
                          </span>
                        )}
                      </div>

                      <div className="text-sm text-slate-700 mt-1">{n.message || "-"}</div>

                      <div className="mt-3 text-xs text-gray-500">
                        Prescription ID:{" "}
                        <b className="text-slate-800">{prescriptionId}</b>
                        <span className="mx-2">•</span>
                        {formatFsTimestamp(n.createdAt)}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => markAsRead(n)}
                    disabled={!isUnread}
                    className="w-max px-4 py-2 text-sm rounded-xl transition-colors font-medium shadow-sm text-white disabled:opacity-60"
                    style={{
                      backgroundColor: C.primary,
                      cursor: !isUnread ? "not-allowed" : "pointer",
                    }}
                  >
                    Mark as read
                  </button>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}