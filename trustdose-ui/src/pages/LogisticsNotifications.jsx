"use client";

import React from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDoc,
  doc,
} from "firebase/firestore";

import { Loader2, Clock, CheckCircle2 } from "lucide-react";

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

async function resolveLogisticsDocId() {
  const lgId =
    localStorage.getItem("userId") ||
    localStorage.getItem("logisticsId") ||
    localStorage.getItem("logisticsID") ||
    "";

  if (!lgId) return null;

  // Try by document ID
  const byId = await getDoc(doc(db, "logistics", String(lgId)));
  if (byId.exists()) return String(lgId);


  return null;
}

export default function LogisticsNotifications() {
  const [loading, setLoading] = React.useState(true);
  const [logisticsDocId, setLogisticsDocId] = React.useState(null);
  const [header, setHeader] = React.useState({ companyName: "" });


  const [virtualItems, setVirtualItems] = React.useState([]);


  const [virtualReadSet, setVirtualReadSet] = React.useState(() => {
    try {
      const raw = localStorage.getItem("lg_virtual_read") || "[]";
      return new Set(JSON.parse(raw));
    } catch {
      return new Set();
    }
  });

  const persistVirtualRead = React.useCallback((setObj) => {
    try {
      localStorage.setItem("lg_virtual_read", JSON.stringify(Array.from(setObj)));
    } catch {}
  }, []);


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
            const d = snap.data();
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
    let unsub = null;
    let canceled = false;

    const qRef = query(
      collection(db, "prescriptions"),
      where("deliveryConfirmed", "==", false)
    );

    unsub = onSnapshot(qRef, (snap) => {
      if (canceled) return;

      const now = Date.now();
      const cutoff24 = now - 24 * 60 * 60 * 1000;

      const v = [];

      snap.forEach((d) => {
        const rx = d.data() || {};
        const docId = d.id;

        if (rx.deliveryConfirmed === true) return;
        if (rx.logisticsAccepted !== true) return;

        const tsMs = toMs(rx.logisticsAcceptedAt);
        if (!tsMs) return;
        if (tsMs > cutoff24) return;

        const prescriptionId =
          rx.prescriptionID ||
          rx.prescriptionId ||
          rx.prescriptionNum ||
          rx.prescriptionNumber ||
          rx.prescriptionID ||
          docId;

        const vid = `v24_${docId}`;
        const isReadVirtual = virtualReadSet.has(vid);

        v.push({
          __virtual: true,
          id: vid,
          type: "DELIVERY_OVERDUE_24H",
          orderId: docId,
          prescriptionID: prescriptionId,
          createdAt: rx.logisticsAcceptedAt,
          read: isReadVirtual ? true : false,
          title: "Delivery overdue (24h)",
          message: `Prescription ${prescriptionId} has not been completed within 24 hours.`,
        });
      });

      v.sort((a, b) => (toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0));
      setVirtualItems(v);
    });

    return () => {
      canceled = true;
      try {
        if (unsub) unsub();
      } catch {}
    };
  }, [virtualReadSet]);

  const unreadCount = virtualItems.filter((n) => !(n.read === true || n.read === "true")).length;

  function markAsRead(n) {
    const next = new Set(virtualReadSet);
    next.add(n.id);
    setVirtualReadSet(next);
    persistVirtualRead(next);
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
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">

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
                  borderColor: unreadCount > 0 ? "rgba(220,38,38,0.35)" : "rgba(176,140,193,0.35)",
                  backgroundColor: unreadCount > 0 ? "rgba(220,38,38,0.08)" : "rgba(176,140,193,0.08)",
                }}
              >
                Unread: {unreadCount}
              </span>
            </div>
          </div>
        </div>

        {/* EMPTY */}
        {virtualItems.length === 0 && (
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

        {/* LIST */}
        {virtualItems.length > 0 && (
          <section className="grid grid-cols-1 gap-4 mt-4">
            {virtualItems.map((n) => {
              const isUnread = !(n.read === true || n.read === "true");
              const prescriptionId = n.prescriptionID || n.orderId || "—";

              return (
                <div
                  key={n.id}
                  className="p-4 border rounded-2xl bg-white shadow-sm flex items-start justify-between gap-3"
                  style={{
                    borderColor: isUnread ? "rgba(176,140,193,0.55)" : "rgba(226,232,240,1)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="h-11 w-11 rounded-2xl flex items-center justify-center"
                      style={{ backgroundColor: "rgba(220,38,38,0.10)" }}
                    >
                      <Clock size={20} style={{ color: "#DC2626" }} />
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm font-bold text-slate-800">
                          Delivery overdue (24h)
                        </div>

                        <span
                          className="px-2.5 py-1 rounded-full text-xs font-semibold border"
                          style={{
                            color: "#DC2626",
                            borderColor: "rgba(220,38,38,0.35)",
                            backgroundColor: "rgba(220,38,38,0.08)",
                          }}
                        >
                          Overdue (24h)
                        </span>

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

                      <div className="text-sm text-slate-700 mt-1">{n.message}</div>

                      <div className="mt-3 text-xs text-gray-500">
                        Prescription ID: <b className="text-slate-800">{prescriptionId}</b>
                        <span className="mx-2">•</span>
                        {formatFsTimestamp(n.createdAt)}
                      </div>
                    </div>
                  </div>

                  <button
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
