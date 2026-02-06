"use client";

import React from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
} from "firebase/firestore";

import { Loader2, Bell, Clock, CheckCircle2, AlertCircle } from "lucide-react";

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

async function resolveLogisticsDocId() {
  const saved = localStorage.getItem("logisticsDocId");
  if (saved && String(saved).trim() !== "") return String(saved).trim();

  const lgId =
    localStorage.getItem("userId") ||
    localStorage.getItem("logisticsId") ||
    localStorage.getItem("logisticsID") ||
    "";

  if (!lgId) return null;

  // 1) Try as docId
  const byId = await getDoc(doc(db, "logistics", String(lgId)));
  if (byId.exists()) return String(lgId);

  // 2) Try by LogisticsID
  const col = collection(db, "logistics");
  const qs = await getDocs(query(col, where("LogisticsID", "==", String(lgId))));
  if (!qs.empty) return qs.docs[0].id;

  return null;
}

export default function LogisticsNotifications() {
  const [loading, setLoading] = React.useState(true);
  const [logisticsDocId, setLogisticsDocId] = React.useState(null);
  const [header, setHeader] = React.useState({ companyName: "" });
  const [items, setItems] = React.useState([]);
  const [errMsg, setErrMsg] = React.useState("");

  // Resolve logistics doc id + header
  React.useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setErrMsg("");
        const docId = await resolveLogisticsDocId();
        if (!mounted) return;

        setLogisticsDocId(docId);

        if (!docId) {
          setErrMsg("Logistics record not resolved (docId is missing).");
          return;
        }

        const snap = await getDoc(doc(db, "logistics", docId));
        if (snap.exists()) {
          const d = snap.data();
          setHeader({ companyName: d.companyName || d.name || "" });
        }
      } catch (e) {
        console.error("resolve logistics doc id error:", e);
        setErrMsg(e?.message || "Failed to resolve logistics docId.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => (mounted = false);
  }, []);

  // Listen to notifications with fallback if index missing
  React.useEffect(() => {
    if (!logisticsDocId) return;

    setLoading(true);
    setErrMsg("");

    const baseWheres = [
      where("toRole", "==", "logistics"),
      where("toLogisticsDocId", "==", logisticsDocId),
    ];

    // Try with orderBy first
    let qN = query(collection(db, "notifications"), ...baseWheres, orderBy("createdAt", "desc"));

    let unsub = null;

    function startListen(qRef) {
      return onSnapshot(
        qRef,
        (snap) => {
          setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoading(false);
        },
        async (err) => {
          console.error("notifications listen error:", err);

          // If index missing or orderBy not allowed, fallback WITHOUT orderBy
          const msg = String(err?.message || "");
          const code = String(err?.code || "");

          const looksLikeIndex =
            code === "failed-precondition" ||
            msg.toLowerCase().includes("index") ||
            msg.toLowerCase().includes("requires an index");

          if (looksLikeIndex) {
            try {
              const qFallback = query(collection(db, "notifications"), ...baseWheres);
              // stop previous listener then start fallback
              unsub?.();
              unsub = onSnapshot(
                qFallback,
                (snap2) => {
                  // sort locally by createdAt
                  const arr = snap2.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => {
                      const aT = a?.createdAt?.toDate?.()?.getTime?.() || 0;
                      const bT = b?.createdAt?.toDate?.()?.getTime?.() || 0;
                      return bT - aT;
                    });
                  setItems(arr);
                  setLoading(false);
                  setErrMsg(""); // ok now
                },
                (err2) => {
                  console.error("fallback listen error:", err2);
                  setErrMsg(err2?.message || "Notifications error (fallback).");
                  setLoading(false);
                }
              );
              setErrMsg("Note: Firestore index missing for ordered query. Using fallback view.");
            } catch (e2) {
              setErrMsg(e2?.message || "Failed to fallback notifications query.");
              setLoading(false);
            }
          } else {
            setErrMsg(err?.message || "Notifications listener failed.");
            setLoading(false);
          }
        }
      );
    }

    unsub = startListen(qN);

    return () => unsub?.();
  }, [logisticsDocId]);

  const unreadCount = items.filter((n) => !n.read).length;

  async function markAsRead(id) {
    try {
      await updateDoc(doc(db, "notifications", id), { read: true });
    } catch (e) {
      console.error("markAsRead error:", e);
      setErrMsg(e?.message || "Failed to mark as read.");
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
        {/* DEBUG / ERROR */}
        {(errMsg || !logisticsDocId) && (
          <div className="mb-4 p-4 rounded-xl flex items-start gap-2 text-rose-800 bg-rose-50 border border-rose-200">
            <AlertCircle size={18} className="mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold">Notifications Debug</div>
              <div className="mt-1">
                <div>
                  <b>Resolved logisticsDocId:</b>{" "}
                  <span className="font-mono">{logisticsDocId || "NULL"}</span>
                </div>
                {!!errMsg && <div className="mt-1"><b>Error:</b> {errMsg}</div>}
              </div>
            </div>
          </div>
        )}

        {/* HEADER */}
        <div className="mb-6 flex items-center gap-3">
          <img
            src="/Images/TrustDose-pill.png"
            alt="TrustDose Capsule"
            style={{ width: 64 }}
          />

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
                    unreadCount > 0 ? "rgba(220,38,38,0.35)" : "rgba(176,140,193,0.35)",
                  backgroundColor:
                    unreadCount > 0 ? "rgba(220,38,38,0.08)" : "rgba(176,140,193,0.08)",
                }}
              >
                Unread: {unreadCount}
              </span>
            </div>
          </div>
        </div>

        {/* EMPTY */}
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

        {/* LIST */}
        {items.length > 0 && (
          <section className="grid grid-cols-1 gap-4 mt-4">
            {items.map((n) => {
              const isOverdue = n.type === "DELIVERY_OVERDUE_24H";
              const isUnread = !n.read;

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
                      style={{
                        backgroundColor: isOverdue
                          ? "rgba(220,38,38,0.10)"
                          : "rgba(176,140,193,0.15)",
                      }}
                    >
                      {isOverdue ? (
                        <Clock size={20} style={{ color: "#DC2626" }} />
                      ) : (
                        <Bell size={20} style={{ color: C.ink }} />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm font-bold text-slate-800">
                          {n.title || "Notification"}
                        </div>

                        {isOverdue && (
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

                      <div className="text-sm text-slate-700 mt-1">
                        {n.message || "-"}
                      </div>

                      <div className="mt-3 text-xs text-gray-500">
                        Order: <b className="text-slate-800">{n.orderId || "—"}</b>
                        <span className="mx-2">•</span>
                        {formatFsTimestamp(n.createdAt)}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => markAsRead(n.id)}
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
