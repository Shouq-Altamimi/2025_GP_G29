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
  deleteField,
  serverTimestamp,
  Timestamp,
    addDoc,
    limit,
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

function toMs(ts) {
  if (!ts) return null;
  try {
    if (typeof ts?.toDate === "function") return ts.toDate().getTime();
  } catch {}
  if (typeof ts === "number") return ts;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.getTime();
}

async function resolvePharmacyDocId() {
  const phId =
    localStorage.getItem("userId") ||
    localStorage.getItem("pharmacyId") ||
    localStorage.getItem("pharmacyID") ||
    localStorage.getItem("PharmacyID") ||
    "";

  if (!phId) return null;

  // 1) Try by document ID
  const byId = await getDoc(doc(db, "pharmacies", String(phId)));
  if (byId.exists()) return String(phId);

  // 2) Try by PharmacyID / pharmacyId field (fallbacks)
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

export default function PharmacyNotifications() {
  const [loading, setLoading] = React.useState(true);
  const [pharmacyDocId, setPharmacyDocId] = React.useState(null);
  const [header, setHeader] = React.useState({ companyName: "" });

  // Real notifications (from notifications collection)
  const [items, setItems] = React.useState([]);
  const [listenErr, setListenErr] = React.useState("");

  // Virtual notifications (derived from prescriptions)
  const [virtualItems, setVirtualItems] = React.useState([]);

  // ✅ “read” for virtual items (local storage)
  const [virtualReadSet, setVirtualReadSet] = React.useState(() => {
    try {
      const raw = localStorage.getItem("ph_virtual_read") || "[]";
      return new Set(JSON.parse(raw));
    } catch {
      return new Set();
    }
  });

  const persistVirtualRead = React.useCallback((setObj) => {
    try {
      localStorage.setItem("ph_virtual_read", JSON.stringify(Array.from(setObj)));
    } catch {}
  }, []);

  // ✅ cache عشان ما نعيد fetch لنفس orderId كل مرة
  const rxIdCacheRef = React.useRef(new Map()); // orderId -> prescriptionID
  const fetchingRef = React.useRef(new Set()); // orderId being fetched

  // Resolve pharmacy doc id + header (بس للهيدر)
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
            const d = snap.data();
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

    return () => (mounted = false);
  }, []);

  // =========================
  // 1) REAL notifications listener (لصيدلية وحدة: بدون toPharmacyDocId)
  // =========================
  React.useEffect(() => {
    setLoading(true);
    setListenErr("");

    const base = [where("toRole", "==", "pharmacy")];

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
          setLoading(false);
          setListenErr("");
        },
        async (err) => {
          console.error(`notifications listen error (${label}):`, err);

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

          setLoading(false);
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
  }, []);

  // =========================
  // 2) Fetch prescriptionID for notifications that only have orderId
  // =========================
  React.useEffect(() => {
    if (!items?.length) return;

    const need = items.filter((n) => {
      const hasId = Boolean(n?.prescriptionID);
      const hasOrder = Boolean(n?.orderId);
      return hasOrder && !hasId;
    });

    if (need.length === 0) return;

    (async () => {
      const updatesByNotifId = new Map(); // notifId -> prescriptionID

      await Promise.all(
        need.map(async (n) => {
          const orderId = String(n.orderId);

          if (rxIdCacheRef.current.has(orderId)) {
            const pid = rxIdCacheRef.current.get(orderId);
            if (pid) updatesByNotifId.set(n.id, pid);
            return;
          }

          if (fetchingRef.current.has(orderId)) return;
          fetchingRef.current.add(orderId);

          try {
            const snap = await getDoc(doc(db, "prescriptions", orderId));
            if (!snap.exists()) {
              rxIdCacheRef.current.set(orderId, null);
              return;
            }

            const rx = snap.data() || {};
            const pid =
              rx.prescriptionID ||
              rx.prescriptionId ||
              rx.prescriptionNum ||
              rx.prescriptionNumber ||
              null;

            rxIdCacheRef.current.set(orderId, pid);

            if (pid) updatesByNotifId.set(n.id, pid);
          } catch (e) {
            console.error("Failed to fetch prescription for orderId:", orderId, e);
          } finally {
            fetchingRef.current.delete(orderId);
          }
        })
      );

      if (updatesByNotifId.size === 0) return;

      setItems((prev) =>
        prev.map((n) =>
          updatesByNotifId.has(n.id)
            ? { ...n, prescriptionID: updatesByNotifId.get(n.id) }
            : n
        )
      );
    })();
  }, [items]);
// =========================
// ✅ 3) VIRTUAL notifications from prescriptions (48h) + AUTO RESET
//    ✅ notification stays until deliveryConfirmed === true
// =========================
React.useEffect(() => {
  let unsub = null;
  let canceled = false;

  // يمنع تكرار الريست داخل نفس الجلسة
  const resetOnceRef = new Set();

  const attach = (qRef) => {
    unsub = onSnapshot(
      qRef,
      async (snap) => {
        if (canceled) return;

        const now = Date.now();
        const cutoff48 = now - 48 * 60 * 60 * 1000;

        const v = [];
        const toReset = [];

        snap.forEach((d) => {
          const rx = d.data() || {};
          const docId = d.id;

          // ✅ يختفي فقط إذا تم التسليم
          if (rx.deliveryConfirmed === true) return;

          const prescriptionId =
            rx.prescriptionID ||
            rx.prescriptionId ||
            rx.prescriptionNum ||
            rx.prescriptionNumber ||
            docId;

          const vid = `v48_${docId}`;
          const isReadVirtual = virtualReadSet.has(vid);

          // ✅ الحالة A: تم التعامل مع 48h سابقاً → يبقى الإشعار ظاهر
          if (rx.overdue48HandledAt) {
            const fixedMessage48 = `Prescription ${prescriptionId}  not completed within 48 hours and has been returned to the Delivery Orders list for redispensing.`;

            v.push({
              __virtual: true,
              id: vid,
              type: "DELIVERY_OVERDUE_48H",
              orderId: docId,
              prescriptionID: prescriptionId,
              // ✅ نستخدم overdue48BaseAt (أو handledAt) بدل logisticsAcceptedAt
              createdAt: rx.overdue48BaseAt || rx.overdue48HandledAt,
              read: isReadVirtual ? true : false,
              title: "Delivery Overdue (48h)",
              message: fixedMessage48,
            });
            return;
          }

          // ✅ الحالة B: لسه ما تسجلت 48h → نفحص logisticsAcceptedAt
          const tsMs = toMs(rx.logisticsAcceptedAt);
          if (!tsMs) return;
          if (tsMs > cutoff48) return;

          // ✅ وصلنا 48h → اعرض إشعار
          const fixedMessage48 = `Prescription ${prescriptionId} not completed within 48 hours and has been returned to the Delivery Orders list for redispensing.`;

          v.push({
            __virtual: true,
            id: vid,
            type: "DELIVERY_OVERDUE_48H",
            orderId: docId,
            prescriptionID: prescriptionId,
            createdAt: rx.logisticsAcceptedAt,
            read: isReadVirtual ? true : false,
            title: "Delivery Overdue (48h)",
            message: fixedMessage48,
          });

          // ✅ وجدنا متأخر → جهز للريست مرة وحدة
          if (!resetOnceRef.has(docId)) {
            resetOnceRef.add(docId);
            toReset.push({ docId, baseAt: rx.logisticsAcceptedAt });
          }
        });

        // ✅ اعرض الإشعارات
        v.sort((a, b) => (toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0));
        setVirtualItems(v);

        // ✅ AUTO RESET + حفظ overdue48BaseAt (عشان الإشعار ما يختفي)
        if (toReset.length > 0) {
          await Promise.all(
            toReset.map(async ({ docId, baseAt }) => {
              
              try {
                // 1) هات بيانات الوصفة (قبل التحديث) عشان نجيب patient + pid
  const rxSnap = await getDoc(doc(db, "prescriptions", docId));
  const rxData = rxSnap.exists() ? (rxSnap.data() || {}) : {};

  const nid = String(rxData.nationalID || rxData.nationalId || "");
  const patientDocId = String(rxData.patientDocId || "");

  //const patientDocId = nid ? `Ph_${nid}` : "";

  const pid = String(
    rxData.prescriptionID ||
    rxData.prescriptionId ||
    rxData.prescriptionNum ||
    rxData.prescriptionNumber ||
    docId
  );
                await updateDoc(doc(db, "prescriptions", docId), {
                  logisticsAccepted: false,
                  logisticsAcceptedAt: deleteField(),

                  acceptDelivery: false,
                  acceptDeliveryAt: deleteField(),
                  acceptDeliveryTx: deleteField(),

                  // ✅ أهم سطر: نخزن وقت القبول الأصلي
                  overdue48BaseAt: baseAt || serverTimestamp(),

                  overdue48HandledAt: serverTimestamp(),
                  overdue48Reason: "DELIVERY_NOT_COMPLETED_48H",
                  updatedAt: serverTimestamp(),
                });
                // 3) ✅ ثانياً: بعد نجاح التحديث… ارسل إشعار للمريض
  if (patientDocId) {
    const dupQ = query(
      collection(db, "notifications"),
      where("toRole", "==", "patient"),
      where("toPatientDocId", "==", patientDocId),
      where("orderId", "==", docId),
      where("type", "==", "PRESCRIPTION_REDISPENSED_48H"),
      limit(1)
    );

    const dupSnap = await getDocs(dupQ);

    if (dupSnap.empty) {
      await addDoc(collection(db, "notifications"), {
        toRole: "patient",
        toPatientDocId: patientDocId,

        type: "PRESCRIPTION_REDISPENSED_48H",
        title: "Prescription Redispensed",
        message: `Your prescription ${pid} has been returned for redispensing (delivery was not completed within 48 hours).`,

        orderId: docId,
        prescriptionID: pid,

        read: false,
        createdAt: serverTimestamp(),
      });
    }
  }
              } catch (e) {
                console.error("AUTO RESET (48h) failed for prescription:", docId, e);
              }
            })
          );
        }
      },
      (err) => {
        console.error("prescriptions overdue listen error:", err);
        setVirtualItems([]);
      }
    );
  };

  // ✅ صيدلية وحدة: نجيب كل الوصفات غير المسلّمة ونفلتر بالواجهة
  const qRef = query(collection(db, "prescriptions"), where("deliveryConfirmed", "==", false));
  attach(qRef);

  return () => {
    canceled = true;
    try {
      if (unsub) unsub();
    } catch {}
  };
}, [virtualReadSet]);



  // =========================
  // ✅ combine virtual + real
  // =========================
  const allItems = React.useMemo(() => {
    return [...virtualItems, ...items];
  }, [virtualItems, items]);

  const unreadCount = allItems.filter((n) => !(n.read === true || n.read === "true")).length;

  async function markAsRead(n) {
    // virtual: local فقط
    if (n?.__virtual) {
      const next = new Set(virtualReadSet);
      next.add(n.id);
      setVirtualReadSet(next);
      persistVirtualRead(next);
      return;
    }

    // real notification
    await updateDoc(doc(db, "notifications", n.id), { read: true });
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

        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <img src="/Images/TrustDose-pill.png" alt="TrustDose Capsule" style={{ width: 64 }} />

          <div className="w-full">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="font-extrabold text-[24px]" style={{ color: "#334155" }}>
                  {header.companyName ? `Notifications — ${header.companyName}` : "Notifications"}
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
        {allItems.length === 0 && (
          <div className="p-8 border rounded-2xl bg-white shadow-sm text-center">
            <div className="mx-auto mb-3 flex items-center justify-center w-12 h-12 rounded-full" style={{ backgroundColor: "#ECFDF3" }}>
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
        {allItems.length > 0 && (
          <section className="grid grid-cols-1 gap-4 mt-4">
            {allItems.map((n) => {
              const isOverdue48 = n.type === "DELIVERY_OVERDUE_48H";
              const isOverdue24 = n.type === "DELIVERY_OVERDUE_24H";
              const isOverdue = isOverdue24 || isOverdue48;

              const isUnread = !(n.read === true || n.read === "true");
              const prescriptionId = n.prescriptionID || n.orderId || "—";

              const cardTitle =
                isOverdue48 ? "Delivery Overdue (48h)"
                : isOverdue24 ? "Delivery Overdue (24h)"
                : n.title || "Notification";

              const fixedMessage48 = `Prescription ${prescriptionId} was  not completed within 48 hours and has been returned to the Delivery Orders list for redispensing`;
              const fixedMessage24 = `Prescription ${prescriptionId} was  not completed within 24 hours and has been returned to the Delivery Orders list for redispensing`;

              const messageToShow =
                isOverdue48 ? fixedMessage48
                : isOverdue24 ? fixedMessage24
                : n.message || "-";

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
                        backgroundColor: isOverdue ? "rgba(220,38,38,0.10)" : "rgba(176,140,193,0.15)",
                      }}
                    >
                      {isOverdue ? <Clock size={20} style={{ color: "#DC2626" }} /> : <Bell size={20} style={{ color: C.ink }} />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm font-bold text-slate-800">{cardTitle}</div>

                        {isOverdue && (
                          <span
                            className="px-2.5 py-1 rounded-full text-xs font-semibold border"
                            style={{
                              color: "#DC2626",
                              borderColor: "rgba(220,38,38,0.35)",
                              backgroundColor: "rgba(220,38,38,0.08)",
                            }}
                          >
                            {isOverdue48 ? "Overdue (48h)" : "Overdue (24h)"}
                          </span>
                        )}

                        {isUnread && (
                          <span
                            className="px-2.5 py-1 rounded-full text-xs font-semibold border"
                            style={{ color: "#166534", borderColor: "#BBE5C8", backgroundColor: "#ECFDF3" }}
                          >
                            New
                          </span>
                        )}

                    
                  
                      </div>

                      <div className="text-sm text-slate-700 mt-1">{messageToShow}</div>

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
