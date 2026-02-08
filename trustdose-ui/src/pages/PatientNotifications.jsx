// src/pages/PatientNotifications.jsx
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

import { Loader2, Bell, CheckCircle2, AlertCircle } from "lucide-react";

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
  if (!ts) return 0;
  try {
    if (typeof ts?.toDate === "function") return ts.toDate().getTime();
  } catch {}
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}


/*async function resolvePatientDocId() {
  // 1) prefer what PShell stores
  const cached =
    localStorage.getItem("patientDocId") ||
    localStorage.getItem("patientDocID") ||
    "";

  if (cached) {
    const byId = await getDoc(doc(db, "patients", String(cached)));
    if (byId.exists()) return String(cached);
  }

  // 2) fallback: from userId (national id) and query by fields
  const pid =
    localStorage.getItem("userId") ||
    localStorage.getItem("patientId") ||
    localStorage.getItem("patientID") ||
    "";

  if (!pid) return null;

  // if doc id matches directly
  const byId2 = await getDoc(doc(db, "patients", String(pid)));
  if (byId2.exists()) return String(pid);

  const col = collection(db, "patients");
  const tries = [
    query(col, where("nationalId", "==", String(pid))),
    query(col, where("nationalID", "==", String(pid))),
    query(col, where("nid", "==", String(pid))),
    query(col, where("NID", "==", String(pid))),
  ];

  for (const tq of tries) {
    const qs = await getDocs(tq);
    if (!qs.empty) return qs.docs[0].id;
  }

  return null;
}*/

async function resolvePatientDocId() {
  const cached =
    localStorage.getItem("patientDocId") ||
    localStorage.getItem("patientDocID") ||
    "";

  const pid =
    localStorage.getItem("userId") ||
    localStorage.getItem("patientId") ||
    localStorage.getItem("patientID") ||
    "";

  // ✅ إذا فيه cached: لا تقبله إلا إذا يخص نفس المستخدم الحالي
  if (cached && pid) {
    const byId = await getDoc(doc(db, "patients", String(cached)));
    if (byId.exists()) {
      const d = byId.data() || {};
      const nid =
        String(d.nationalID || d.nationalId || d.nid || d.NID || "");

      if (nid && String(nid) === String(pid)) {
        return String(cached); // ✅ نفس الشخص
      }

      // ❌ cached لشخص ثاني → تجاهله
      localStorage.removeItem("patientDocId");
      localStorage.removeItem("patientDocID");
    }
  }

  if (!pid) return null;

  // if doc id matches directly
  const byId2 = await getDoc(doc(db, "patients", String(pid)));
  if (byId2.exists()) return String(pid);

  const col = collection(db, "patients");
  const tries = [
    query(col, where("nationalId", "==", String(pid))),
    query(col, where("nationalID", "==", String(pid))),
    query(col, where("nid", "==", String(pid))),
    query(col, where("NID", "==", String(pid))),
  ];

  for (const tq of tries) {
    const qs = await getDocs(tq);
    if (!qs.empty) return qs.docs[0].id;
  }

  return null;
}


export default function PatientNotifications() {
  const [loading, setLoading] = React.useState(true);
  const [patientDocId, setPatientDocId] = React.useState(null);
  const [header, setHeader] = React.useState({ fullName: "" });

  const [items, setItems] = React.useState([]);
  const [listenErr, setListenErr] = React.useState("");

  // Resolve patient doc id + header
  React.useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const docId = await resolvePatientDocId();
        if (!mounted) return;

        setPatientDocId(docId);
        if (docId) localStorage.setItem("patientDocId", docId);

        if (docId) {
          const snap = await getDoc(doc(db, "patients", docId));
          if (snap.exists()) {
            const d = snap.data() || {};
            setHeader({
              fullName: d.fullName || d.name || d.fullname || "",
            });
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

  // Real notifications listener (for this patient)
  React.useEffect(() => {
    setListenErr("");

    if (!patientDocId) return;

    const base = [
      where("toRole", "==", "patient"),
      where("toPatientDocId", "==", String(patientDocId)),
    ];

    const orderedQ = query(
      collection(db, "notifications"),
      ...base,
      orderBy("createdAt", "desc")
    );
    const plainQ = query(collection(db, "notifications"), ...base);

    let unsub = null;

    const attach = (qq, label) => {
      unsub = onSnapshot(
        qq,
        (snap) => {
          setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setListenErr("");
        },
        (err) => {
          console.error(`patient notifications listen error (${label}):`, err);

          const msg = String(err?.message || "");
          const isIndex =
            err?.code === "failed-precondition" ||
            msg.toLowerCase().includes("index") ||
            msg.toLowerCase().includes("requires an index");

          if (isIndex && label === "ordered") {
            try {
              if (unsub) unsub();
            } catch {}
            attach(plainQ, "plain");
            return;
          }

          setListenErr(
            isIndex
              ? "Firestore index is required for ordered query. Fallback applied."
              : "Failed to load notifications (check rules / console)."
          );
        }
      );
    };

    attach(orderedQ, "ordered");

    return () => {
      try {
        if (unsub) unsub();
      } catch {}
    };
  }, [patientDocId]);

  async function markAsRead(n) {
    await updateDoc(doc(db, "notifications", n.id), { read: true });
  }
const sortedItems = React.useMemo(() => {
  const arr = [...items];
  arr.sort((a, b) => (toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0));
  return arr;
}, [items]);

  const unreadCount = items.filter((n) => !(n.read === true || n.read === "true")).length;

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

        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <img
            src="/Images/TrustDose-pill.png"
            alt="TrustDose Capsule"
            style={{ width: 64 }}
          />

          <div className="w-full">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1
                  className="font-extrabold text-[24px]"
                  style={{ color: "#334155" }}
                >
                  {header.fullName
                    ? `Notifications — ${header.fullName}`
                    : "Notifications"}
                </h1>

                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p
                    className="text-[15px] font-medium"
                    style={{ color: "#64748b" }}
                  >
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
            {sortedItems.map((n) => {
              const isUnread = !(n.read === true || n.read === "true");
              const prescriptionId =
                n.prescriptionID || n.prescriptionId || n.orderId || "—";

              const cardTitle = n.title || "Notification";
              const messageToShow = n.message || "-";

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
                      style={{
                        backgroundColor: "rgba(176,140,193,0.15)",
                      }}
                    >
                      <Bell size={20} style={{ color: C.ink }} />
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm font-bold text-slate-800">
                          {cardTitle}
                        </div>

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
                        {messageToShow}
                      </div>

                      <div className="mt-3 text-xs text-gray-500">
                        Prescription ID:{" "}
                        <b className="text-slate-800">{prescriptionId}</b>
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
