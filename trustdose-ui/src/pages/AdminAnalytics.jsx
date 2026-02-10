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
} from "lucide-react";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate, useLocation } from "react-router-dom";

const C = {
  primary: "#B08CC1",
  teal: "#52B9C4",
  ink: "#4A2C59",
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

/* =======================
   UI
======================= */
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

  const periodLabel =
    period === "day"
      ? "Last 24 hours"
      : period === "month"
      ? "Last 30 days"
      : "Last 12 months";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "linear-gradient(180deg,#F7F7FB 0%, #F3FBFC 100%)",
      }}
    >
      <Header hideMenu={false} onMenuClick={() => setOpen(true)} />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-[1500px] px-8 mt-10 pb-10">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-[26px] leading-tight font-extrabold tracking-tight text-[#2A1E36]">
                Analytics
              </h1>
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
        </section>
      </main>

      <Footer />

      <Sidebar
        open={open}
        setOpen={setOpen}
        onNav={(p) => navigate(p)}
        onLogout={() => navigate("/auth", { replace: true })}
      />
    </div>
  );
}
