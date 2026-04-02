"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Truck,
  BarChart3,
  LayoutDashboard,
  UserPlus,
  LogOut,
  X,
    Pill,
      Search,
} from "lucide-react";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate, useLocation } from "react-router-dom";
import { logEvent } from "../utils/logEvent";

const C = {
  primary: "#B08CC1",
  teal: "#52B9C4",
  ink: "#4A2C59",

   success: "#166534",
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",

  danger: "#991B1B",
  dangerBg: "#FEE2E2",
  dangerBorder: "#FCA5A5",
};

function toDateSafe(ts) {
  if (!ts) return null;
  try {
    if (typeof ts?.toDate === "function") return ts.toDate();
    if (ts?.seconds) return new Date(ts.seconds * 1000);
    if (typeof ts === "number") return new Date(ts);
    return null;
  } catch {
    return null;
  }
}

function startOfHour(d) {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x;
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function monthStart(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
function labelHour(d) {
  return `${pad2(d.getHours())}:00`;
}
function labelDay(d) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}
function labelMonth(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function formatDateTime(ts) {
  const d = toDateSafe(ts);
  if (!d) return "—";
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildAxis(period) {
  const now = new Date();
  if (period === "day") {
    const end = startOfHour(now);
    const arr = [];
    for (let i = 23; i >= 0; i--) {
      const d = new Date(end);
      d.setHours(end.getHours() - i);
      arr.push({ key: d.toISOString(), label: labelHour(d), date: d });
    }
    return arr;
  }
  if (period === "month") {
    const end = startOfDay(now);
    const arr = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      arr.push({ key: d.toISOString(), label: labelDay(d), date: d });
    }
    return arr;
  }
  const end = monthStart(now);
  const arr = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    arr.push({ key: d.toISOString(), label: labelMonth(d), date: d });
  }
  return arr;
}

function inSameBucket(period, dt, bucketDate) {
  if (period === "day") {
    return (
      dt.getFullYear() === bucketDate.getFullYear() &&
      dt.getMonth() === bucketDate.getMonth() &&
      dt.getDate() === bucketDate.getDate() &&
      dt.getHours() === bucketDate.getHours()
    );
  }
  if (period === "month") {
    return (
      dt.getFullYear() === bucketDate.getFullYear() &&
      dt.getMonth() === bucketDate.getMonth() &&
      dt.getDate() === bucketDate.getDate()
    );
  }
  return (
    dt.getFullYear() === bucketDate.getFullYear() &&
    dt.getMonth() === bucketDate.getMonth()
  );
}

function Sidebar({ open, setOpen, onNav, onLogout }) {
  const location = useLocation();
  const isActive = (p) => location.pathname + location.search === p;

  return (
    <>
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      <aside
        className="fixed top-0 left-0 z-[60] h-full w-[290px] shadow-2xl"
        style={{
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 180ms ease",
          background:
            "linear-gradient(180deg, rgba(176,140,193,0.95) 0%, rgba(146,137,186,0.95) 45%, rgba(82,185,196,0.92) 100%)",
        }}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <img
            src="/Images/TrustDose_logo.png"
            alt="TrustDose"
            className="h-7 w-auto"
          />
          <button
            onClick={() => setOpen(false)}
            className="h-9 w-9 grid place-items-center rounded-lg hover:bg-white/20 text-white"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="px-3">
          <button
            onClick={() => {
              setOpen(false);
              onNav("/admin/dashboard");
            }}
            className={`w-full mb-3 inline-flex items-center gap-3 px-3 py-3 rounded-xl font-medium ${
              isActive("/admin/dashboard")
                ? "bg-white text-[#5B3A70]"
                : "bg-white/25 text-white hover:bg-white/35"
            }`}
          >
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => {
              setOpen(false);
              onNav("/admin");
            }}
            className="w-full mb-3 inline-flex items-center gap-3 px-3 py-3 rounded-xl font-medium bg-white/25 text-white hover:bg-white/35"
          >
            <UserPlus size={18} />
            <span>Add Doctor</span>
          </button>

          <button
  onClick={() => {
    setOpen(false);
    onNav("/admin/medicines");
  }}
  className={`w-full mb-3 inline-flex items-center gap-3 px-3 py-3 rounded-xl font-medium ${
    isActive("/admin/medicines")
      ? "bg-white text-[#5B3A70]"
      : "bg-white/25 text-white hover:bg-white/35"
  }`}
>
  <Pill size={18} />
  <span>Add Medicine</span>
</button>

          <button
            onClick={() => {
              setOpen(false);
              onNav("/admin/analytics");
            }}
            className={`w-full mb-3 inline-flex items-center gap-3 px-3 py-3 rounded-xl font-medium ${
              isActive("/admin/analytics")
                ? "bg-white text-[#5B3A70]"
                : "bg-white/25 text-white hover:bg-white/35"
            }`}
          >
            <BarChart3 size={18} />
            <span>Analytics</span>
          </button>

          <button
            onClick={() => {
              setOpen(false);
              onLogout?.();
            }}
            className="w-full mb-3 inline-flex items-center gap-3 px-3 py-3 rounded- xl font-medium text-white/90 hover:bg-white/10"
          >
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        </nav>
      </aside>
    </>
  );
}

function PeriodTabs({ value, onChange }) {
  const items = [
    { k: "day", label: "Daily" },
    { k: "month", label: "Monthly" },
    { k: "year", label: "Yearly" },
  ];
  return (
    <div className="inline-flex rounded-2xl border border-gray-200 bg-white/70 p-1 shadow-sm">
      {items.map((it) => {
        const active = value === it.k;
        return (
          <button
            key={it.k}
            onClick={() => onChange(it.k)}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition ${
              active
                ? "bg-white shadow text-[#4A2C59]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function Kpi({ title, value, icon: Icon, accent, hint }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm p-6 flex items-center justify-between">
      <div>
        <div className="text-sm font-semibold text-gray-600">{title}</div>
        <div className="text-3xl font-extrabold text-[#2A1E36] mt-1">
          {value}
        </div>
        {hint ? <div className="text-xs text-gray-500 mt-1">{hint}</div> : null}
      </div>
      <div
        className="h-12 w-12 rounded-2xl grid place-items-center"
        style={{ background: `${accent}18`, color: accent }}
      >
        <Icon size={20} />
      </div>
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm p-6">
      <div className="mb-4">
        <div className="text-[13px] font-extrabold text-[#2A1E36]">{title}</div>
        {subtitle ? (
          <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function SvgAreaLineChart({ data, color, height = 260 }) {
  const W = 920;
  const H = height;
  const pad = { t: 18, r: 16, b: 44, l: 44 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  const max = Math.max(1, ...data.map((d) => d.value || 0));

  const points = data.map((d, i) => {
    const x =
      pad.l + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
    const y = pad.t + (1 - (d.value || 0) / max) * plotH;
    return { ...d, x, y };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  const areaPath =
    `${linePath} L ${points[points.length - 1].x.toFixed(
      2
    )} ${(pad.t + plotH).toFixed(2)} ` +
    `L ${points[0].x.toFixed(2)} ${(pad.t + plotH).toFixed(2)} Z`;

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) =>
    Math.round((max * i) / ticks)
  );
  const [hover, setHover] = useState(null);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        <defs>
          <linearGradient
            id={`grad-${color.replace("#", "")}`}
            x1="0"
            x2="0"
            y1="0"
            y2="1"
          >
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {yTicks.map((t, i) => {
          const y = pad.t + plotH - (t / max) * plotH;
          return (
            <g key={i}>
              <line
                x1={pad.l}
                x2={pad.l + plotW}
                y1={y}
                y2={y}
                stroke="#E5E7EB"
                strokeDasharray="4 4"
              />
              <text
                x={pad.l - 10}
                y={y + 4}
                fontSize="12"
                fill="#6B7280"
                textAnchor="end"
              >
                {t}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill={`url(#grad-${color.replace("#", "")})`} />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="5"
            fill="#fff"
            stroke={color}
            strokeWidth="3"
            onMouseEnter={() => setHover(p)}
            onMouseLeave={() => setHover(null)}
          />
        ))}

        {points.map((p, i) => {
          const show = data.length <= 12 || i % Math.ceil(data.length / 10) === 0;
          if (!show) return null;
          return (
            <text
              key={`x-${i}`}
              x={p.x}
              y={pad.t + plotH + 28}
              fontSize="12"
              fill="#6B7280"
              textAnchor="middle"
            >
              {p.label}
            </text>
          );
        })}

        {hover && (
          <g>
            <line
              x1={hover.x}
              x2={hover.x}
              y1={pad.t}
              y2={pad.t + plotH}
              stroke="#111827"
              strokeOpacity="0.08"
            />
            <rect
              x={hover.x - 46}
              y={hover.y - 40}
              width="92"
              height="26"
              rx="10"
              fill="#111827"
              opacity="0.92"
            />
            <text
              x={hover.x}
              y={hover.y - 22}
              fontSize="12"
              fill="#fff"
              textAnchor="middle"
              fontWeight="800"
            >
              {hover.value} • {hover.label}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

/* =======================
   Page
======================= */
export default function AdminAnalytics() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const [period, setPeriod] = useState("month");
  const axis = useMemo(() => buildAxis(period), [period]);

  const [loading, setLoading] = useState(true);
  const [rx, setRx] = useState([]);
  const [iotLoading, setIotLoading] = useState(true);
const [readings, setReadings] = useState([]);
const [statusTab, setStatusTab] = useState("all");
const [search, setSearch] = useState("");
const [page, setPage] = useState(1);
const PAGE_SIZE = 10;
useEffect(() => {
  setPage(1);
}, [statusTab, search]);
  useEffect(() => {
  logEvent("Admin opened analytics page", "admin", "analytics_open");
}, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const rxSnap = await getDocs(collection(db, "prescriptions"));
        const rows = [];
        rxSnap.forEach((s) => rows.push({ id: s.id, ...(s.data() || {}) }));
        setRx(rows);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
  (async () => {
    setIotLoading(true);
    try {
      const snap = await getDocs(collection(db, "iotReadings"));
      const rows = [];
      snap.forEach((s) => rows.push({ id: s.id, ...(s.data() || {}) }));
      setReadings(rows);
    } finally {
      setIotLoading(false);
    }
  })();
}, []);

  const { dispSeries, delSeries, totals } = useMemo(() => {
    const dispBuckets = Object.fromEntries(axis.map((b) => [b.key, 0]));
    const delBuckets = Object.fromEntries(axis.map((b) => [b.key, 0]));
    let totalDisp = 0;
    let totalDel = 0;

    for (const r of rx) {
      if (r.dispensed === true) {
        const dt = toDateSafe(r.updatedAt || r.createdAt);
        if (dt) {
          for (const b of axis) {
            if (inSameBucket(period, dt, b.date)) {
              dispBuckets[b.key] += 1;
              totalDisp += 1;
              break;
            }
          }
        }
      }

      if (r.deliveryConfirmed === true) {
        const dt = toDateSafe(
          r.acceptDeliveryAt || r.logisticsAcceptedAt || r.updatedAt
        );
        if (dt) {
          for (const b of axis) {
            if (inSameBucket(period, dt, b.date)) {
              delBuckets[b.key] += 1;
              totalDel += 1;
              break;
            }
          }
        }
      }
    }

    return {
      dispSeries: axis.map((b) => ({
        label: b.label,
        value: dispBuckets[b.key] || 0,
      })),
      delSeries: axis.map((b) => ({
        label: b.label,
        value: delBuckets[b.key] || 0,
      })),
      totals: { dispensed: totalDisp, delivered: totalDel },
    };
  }, [rx, axis, period]);

  const filteredReadings = useMemo(() => {
  let data = [...readings];

  if (statusTab === "successful") {
    data = data.filter((item) => item.outOfRange === false);
  } else if (statusTab === "failed") {
    data = data.filter((item) => item.outOfRange === true);
  }

  if (search.trim()) {
    const q = search.toLowerCase();
    data = data.filter(
      (item) =>
        String(item.prescriptionId || "").toLowerCase().includes(q) ||
        String(item.deviceId || "").toLowerCase().includes(q) ||
        String(item.orderId || "").toLowerCase().includes(q)
    );
  }

  data.sort((a, b) => {
    const da = toDateSafe(a.createdAt)?.getTime?.() || 0;
    const dbb = toDateSafe(b.createdAt)?.getTime?.() || 0;
    return dbb - da;
  });

  return data;
}, [readings, statusTab, search]);

const pageCount = Math.max(1, Math.ceil(filteredReadings.length / PAGE_SIZE));

const pagedReadings = useMemo(() => {
  const start = (page - 1) * PAGE_SIZE;
  return filteredReadings.slice(start, start + PAGE_SIZE);
}, [filteredReadings, page]);

const startItem = filteredReadings.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
const endItem = Math.min(page * PAGE_SIZE, filteredReadings.length);

  const periodLabel =
    period === "day"
      ? "Last 24 hours"
      : period === "month"
      ? "Last 30 days"
      : "Last 12 months";

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      <Header hideMenu={false} onMenuClick={() => setOpen(true)} />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-[1500px] px-8 mt-10 pb-10">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-[26px] leading-tight font-extrabold tracking-tight text-[#2A1E36]">
                Analytics
              </h1>
              <div className="mt-3 pt-3 border-t border-gray-200"></div>
              <p className="text-sm text-gray-500">{periodLabel}</p>
            </div>

            <PeriodTabs value={period} onChange={setPeriod} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-6">
            <Kpi
              title="Dispensed"
              value={loading ? "…" : totals.dispensed}
              icon={Building2}
              accent={C.primary}
            />
            <Kpi
              title="Delivered"
              value={loading ? "…" : totals.delivered}
              icon={Truck}
              accent={C.teal}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
            <Card title="Dispensed timeline" subtitle="Pharmacy activity over time">
              {loading ? (
                <div className="text-sm text-gray-400">Loading…</div>
              ) : (
                <SvgAreaLineChart data={dispSeries} color={C.primary} />
              )}
            </Card>

            <Card title="Delivered timeline" subtitle="Logistics deliveries over time">
              {loading ? (
                <div className="text-sm text-gray-400">Loading…</div>
              ) : (
                <SvgAreaLineChart data={delSeries} color={C.teal} />
              )}
            </Card>
          </div>
<div className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm p-4">  <div className="flex flex-col gap-4">
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div>
       <h2 className="text-lg font-semibold text-[#2A1E36]">
  Prescription Status
</h2>
<p className="text-sm text-gray-500 mt-1">
  Track all, successful, and failed prescriptions
</p>
      </div>

     <div className="relative w-full sm:w-[240px]">
  <Search
    size={16}
    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
  />
  <input
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    placeholder="Search..."
    className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-[#B08CC1]"
  />
</div>
    </div>

    <div className="flex gap-3 flex-wrap">
      <button
        onClick={() => setStatusTab("all")}
        className={`px-5 py-3 rounded-2xl border text-sm font-semibold transition ${
          statusTab === "all"
            ? "text-white border-transparent"
            : "bg-white text-[#4A2C59] border-gray-200 hover:bg-gray-50"
        }`}
        style={statusTab === "all" ? { backgroundColor: C.primary } : {}}
      >
        All Prescriptions
      </button>

      <button
        onClick={() => setStatusTab("successful")}
        className={`px-5 py-3 rounded-2xl border text-sm font-semibold transition ${
          statusTab === "successful"
            ? "text-white border-transparent"
            : "bg-white text-[#4A2C59] border-gray-200 hover:bg-gray-50"
        }`}
        style={statusTab === "successful" ? { backgroundColor: C.primary } : {}}
      >
        Successful
      </button>

      <button
        onClick={() => setStatusTab("failed")}
        className={`px-5 py-3 rounded-2xl border text-sm font-semibold transition ${
          statusTab === "failed"
            ? "text-white border-transparent"
            : "bg-white text-[#4A2C59] border-gray-200 hover:bg-gray-50"
        }`}
        style={statusTab === "failed" ? { backgroundColor: C.primary } : {}}
      >
        Failed
      </button>
    </div>

<div className="overflow-auto">
        <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
  <tr>
    <th className="text-left px-4 py-3">Prescription ID</th>
    <th className="text-left px-4 py-3">Device ID</th>
    <th className="text-left px-4 py-3">Order ID</th>
    <th className="text-left px-4 py-3">Temp</th>
    <th className="text-left px-4 py-3">Humidity</th>
    <th className="text-left px-4 py-3">Status</th>
    <th className="text-left px-4 py-3">Created</th>
  </tr>
</thead>

        <tbody>
          {iotLoading ? (
            <tr>
              <td colSpan="7" className="px-4 py-6 text-center text-gray-500">
                Loading...
              </td>
            </tr>
          ) : filteredReadings.length === 0 ? (
            <tr>
              <td colSpan="7" className="px-4 py-6 text-center text-gray-500">
                No readings found
              </td>
            </tr>
          ) : (
            pagedReadings.map((item) => (
              <tr key={item.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-[#2A1E36]">
                  {item.prescriptionId || "—"}
                </td>
                <td className="px-4 py-3">{item.deviceId || "—"}</td>
                <td className="px-4 py-3">{item.orderId || "—"}</td>
                <td className="px-4 py-3">
                  {item.temp !== undefined ? `${item.temp}°C` : "—"}
                </td>
                <td className="px-4 py-3">
                  {item.humidity !== undefined ? `${item.humidity}%` : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
  className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold"
  style={{
    backgroundColor: item.outOfRange ? C.dangerBg : C.successBg,
    color: item.outOfRange ? C.danger : C.success,
    border: `1px solid ${
      item.outOfRange ? C.dangerBorder : C.successBorder
    }`,
  }}
>
  {item.outOfRange ? "Failed" : "Successful"}
</span>
                </td>
                <td className="px-4 py-3">{formatDateTime(item.createdAt)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
    <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
  <div>
    {filteredReadings.length > 0
      ? `Showing ${startItem}–${endItem} of ${filteredReadings.length}`
      : "No records"}
  </div>

  <div className="flex items-center gap-2">
    <button
      onClick={() => setPage((p) => Math.max(1, p - 1))}
      disabled={page <= 1}
      className={`px-3 py-1 rounded-lg border ${
        page <= 1
          ? "text-gray-400 border-gray-200"
          : "text-[#4A2C59] border-gray-300 hover:bg-gray-50"
      }`}
    >
      Prev
    </button>

    <span>
      Page {page} / {pageCount}
    </span>

    <button
      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
      disabled={page >= pageCount}
      className={`px-3 py-1 rounded-lg border ${
        page >= pageCount
          ? "text-gray-400 border-gray-200"
          : "text-[#4A2C59] border-gray-300 hover:bg-gray-50"
      }`}
    >
      Next
    </button>
  </div>
</div>
  </div>
</div>
        </section>
      </main>

      <Footer />

      <Sidebar
        open={open}
        setOpen={setOpen}
        onNav={(p) => navigate(p)}
  onLogout={async () => {
    await logEvent("Admin signed out", "admin", "logout");
    navigate("/auth", { replace: true });
  }}      />
    </div>
  );
}
