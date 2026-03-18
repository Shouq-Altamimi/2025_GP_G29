// src/pages/LogisticsNotifications.jsx
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
  serverTimestamp,
  writeBatch,
  limit,
} from "firebase/firestore";

import {
  Loader2,
  Bell,
  Clock,
  CheckCircle2,
  AlertCircle,
  ThermometerSnowflake,
} from "lucide-react";

import { recordBreachOnChain } from "../IoTBreachContract";
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

async function resolveLogisticsDocId() {
  const lgId =
    localStorage.getItem("userId") ||
    localStorage.getItem("logisticsId") ||
    localStorage.getItem("logisticsID") ||
    "";

  if (!lgId) return null;

  const byId = await getDoc(doc(db, "logistics", String(lgId)));
  if (byId.exists()) return String(lgId);

  const col = collection(db, "logistics");
  const qs = await getDocs(query(col, where("LogisticsID", "==", String(lgId))));
  if (!qs.empty) return qs.docs[0].id;

  return null;
}

function getTypeUi(type) {
  const t = String(type || "");

  if (t === "DELIVERY_OVERDUE_24H") {
    return {
      iconBg: "rgba(220,38,38,0.10)",
      icon: <Clock size={20} style={{ color: "#DC2626" }} />,
      badgeText: "Overdue (24h)",
      badgeStyle: {
        color: "#DC2626",
        borderColor: "rgba(220,38,38,0.35)",
        backgroundColor: "rgba(220,38,38,0.08)",
      },
      titleFallback: "Delivery overdue (24h)",
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

export default function LogisticsNotifications() {
  const [loading, setLoading] = React.useState(true);
  const [logisticsDocId, setLogisticsDocId] = React.useState(null);
  const [header, setHeader] = React.useState({ companyName: "" });
  const [listenErr, setListenErr] = React.useState("");
  const [items, setItems] = React.useState([]);

  const processedReadingIdsRef = React.useRef(new Set());
  const processedBreachRef = React.useRef(new Set());

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const docId = await resolveLogisticsDocId();
        if (!mounted) return;

        setLogisticsDocId(docId);

        if (docId) {
          const snap = await getDoc(doc(db, "logistics", docId));
          if (snap.exists()) {
            const d = snap.data() || {};
            setHeader({ companyName: d.companyName || d.name || "" });
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => (mounted = false);
  }, []);

  React.useEffect(() => {
    if (!logisticsDocId) return;

    setListenErr("");

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

      const docs = snap.docs;

      for (const d of docs) {
        const readingId = d.id;

        if (processedReadingIdsRef.current.has(readingId)) continue;
        processedReadingIdsRef.current.add(readingId);

        const r = d.data() || {};

        const pid = String(r.prescriptionId || r.prescriptionID || "").trim();
        if (!pid) continue;

        const deviceId = String(r.deviceId || "").trim();
        const temp = Number(r.temp || 0);
        const hum = Number(r.humidity || 0);

        const notifId = `temp_${logisticsDocId}_${pid}`;
        const notifRef = doc(db, "notifications", notifId);

        const existsSnap = await getDoc(notifRef);
        if (!existsSnap.exists()) {
          await setDoc(notifRef, {
            toRole: "logistics",
            toLogisticsDocId: logisticsDocId,
            type: "TEMP_OUT_OF_RANGE",
            title: "Temperature alert",
            message: `Prescription ${pid} is marked invalid due to unsafe temperature. Please initiate redispensing.`,
            orderId: pid,
            prescriptionID: pid,
            deviceId,
            read: false,
            createdAt: serverTimestamp(),
          });
        }

        // ==============================
        // BLOCKCHAIN BREACH RECORD
        // ==============================
        try {
          if (!processedBreachRef.current.has(pid)) {
            processedBreachRef.current.add(pid);

            const qRx = query(
              collection(db, "prescriptions"),
              where("prescriptionID", "==", pid),
              limit(1)
            );

            const rxQs = await getDocs(qRx);
            if (!rxQs.empty) {
              const rxDoc = rxQs.docs[0];
              const rx = rxDoc.data() || {};

              const onchainId = rx.onchainId;
              const already = rx.breachRecordedOnChain;

              if (onchainId && !already) {
                const txHash = await recordBreachOnChain({
                  prescriptionOnchainId: Number(onchainId),
                  breachType: "TEMP_OUT_OF_RANGE",

                 
                  measuredValue: Math.round(temp),
                  minAllowed: Math.round(Number(rx.tempMin || 0)),
                  maxAllowed: Math.round(Number(rx.tempMax || 0)),

                  breachTime: Math.floor(Date.now() / 1000),
                });

                await setDoc(
                  rxDoc.ref,
                  {
                    breachRecordedOnChain: true,
                    breachTxHash: txHash,
                    breachRecordedAt: serverTimestamp(),
                    breachType: "TEMP_OUT_OF_RANGE",
                    breachMeasuredValue: Math.round(temp),
                    breachMeasuredHumidity: Math.round(hum),
                  },
                  { merge: true }
                );
                await logEvent(
  `Blockchain breach recorded for prescription ${pid}`,
  "logistics",
  "breach_recorded_onchain"
);
              }
            }
          }
        } catch (e) {
          console.error("Blockchain breach record failed:", e);
          await logEvent(
    `Blockchain breach record failed for prescription ${pid}: ${e?.message || "unknown error"}`,
    "logistics",
    "breach_recorded_onchain_error"
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
            console.error("iotReadings -> notif failed:", e);
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
            return;
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
  }, [logisticsDocId]);

  
  React.useEffect(() => {
    if (!logisticsDocId) return;

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
        const cutoff24 = now - 24 * 60 * 60 * 1000;

        const tasks = [];
        const seenPrescriptionIds = new Set();

        snap.forEach((d) => {
          const rx = d.data() || {};
          const orderId = d.id;

          if (rx.deliveryConfirmed === true) return;
          if (rx.logisticsAccepted !== true) return;

          const acceptedMs = toMs(rx.logisticsAcceptedAt);
          if (!acceptedMs) return;
          if (acceptedMs > cutoff24) return;

          const prescriptionId =
            rx.prescriptionID ||
            rx.prescriptionId ||
            rx.prescriptionNum ||
            rx.prescriptionNumber ||
            orderId;

          const pid = String(prescriptionId);

          if (seenPrescriptionIds.has(pid)) return;
          seenPrescriptionIds.add(pid);

          const notifId = `lg24_${logisticsDocId}_${pid}`;
          const notifRef = doc(db, "notifications", notifId);

          tasks.push(
            (async () => {
              try {
                const existsSnap = await getDoc(notifRef);
                if (existsSnap.exists()) return;

                await setDoc(notifRef, {
                  toRole: "logistics",
                  toLogisticsDocId: logisticsDocId,
                  type: "DELIVERY_OVERDUE_24H",
                  title: "Delivery overdue (24h)",
                  message: `Prescription ${pid} has not been completed within 24 hours.`,
                  orderId,
                  prescriptionID: pid,
                  read: false,
                  createdAt: serverTimestamp(),
                });
              } catch (e) {
                console.error("Create logistics 24h notification failed:", e);
              }
            })()
          );
        });

        if (tasks.length) await Promise.all(tasks);
      },
      (err) => {
        console.error("prescriptions listen error (24h writer):", err);
        setListenErr("Missing or insufficient permissions (rules).");
      }
    );

    return () => {
      canceled = true;
      try {
        if (unsub) unsub();
      } catch {}
    };
  }, [logisticsDocId]);

  React.useEffect(() => {
    if (!logisticsDocId) return;

    setListenErr("");
    setLoading(true);

    let unsub = null;

    const base = [
      where("toRole", "==", "logistics"),
      where("toLogisticsDocId", "==", logisticsDocId),
    ];

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
  }, [logisticsDocId]);

  const unreadCount = items.filter((n) => !isReadVal(n.read)).length;

  async function markAsRead(n) {
    try {
      setListenErr("");

      const pid = String(n.prescriptionID || n.orderId || "");
      const typ = String(n.type || "");
      if (!pid || !typ || !logisticsDocId) return;

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
        where("toRole", "==", "logistics"),
        where("toLogisticsDocId", "==", logisticsDocId),
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
