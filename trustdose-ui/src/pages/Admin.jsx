// src/pages/Admin.jsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Users, Building2, Truck, Stethoscope, Search,
  X, LayoutDashboard, UserPlus, LogOut
} from "lucide-react";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate, useLocation } from "react-router-dom";

const C = { primary: "#B08CC1", teal: "#52B9C4", ink: "#4A2C59" };

/* ================= Sidebar (3 عناصر فقط) ================ */
function Sidebar({ open, setOpen, onNav, onLogout }) {
  const location = useLocation();
  const base = location.pathname; // يبقيك على نفس صفحة Admin.jsx
  const activeTab = new URLSearchParams(location.search).get("tab") || "overview";
  const isAdminConsole = base.includes("/admin/dashboard"); // لو مسار Admin.jsx هو /admin/dashboard

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
          <img src="/Images/TrustDose_logo.png" alt="TrustDose" className="h-7 w-auto" />
          <button
            onClick={() => setOpen(false)}
            className="h-9 w-9 grid place-items-center rounded-lg hover:bg-white/20 text-white"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="px-3">
          {/* Dashboard -> Admin.jsx (يفضّل /admin/dashboard) */}
          <button
            onClick={() => { setOpen(false); onNav("/admin/dashboard"); }}
            className={`w-full mb-3 inline-flex items-center gap-3 px-3 py-3 rounded-xl font-medium ${
              isAdminConsole ? "bg-white text-[#5B3A70]" : "bg-white/25 text-white hover:bg-white/35"
            }`}
          >
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </button>

          {/* Add Doctor -> صفحة الادمن القديمة على /admin */}
          <button
            onClick={() => { setOpen(false); onNav("/admin"); }}
            className="w-full mb-6 inline-flex items-center gap-3 px-3 py-3 rounded-xl font-medium bg-white/25 text-white hover:bg-white/35"
          >
            <UserPlus size={18} />
            <span>Add Doctor</span>
          </button>

          {/* Logout */}
          <button
            onClick={() => { setOpen(false); onLogout?.(); }}
            className="w-full mb-3 inline-flex items-center gap-3 px-3 py-3 rounded-xl font-medium text-white/90 hover:bg-white/10"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </nav>
      </aside>
    </>
  );
}

/* ============== small UI bits ============== */
function StatCard({ title, count, icon: Icon, accent }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-5 flex items-center justify-between">
      <div>
        <div className="text-sm font-semibold text-gray-600">{title}</div>
        <div className="text-2xl font-extrabold text-[#2A1E36] mt-1">{count}</div>
      </div>
      <div
        className="h-10 w-10 grid place-items-center rounded-xl"
        style={{ backgroundColor: `${accent}15`, color: accent }}
      >
        <Icon size={18} />
      </div>
    </div>
  );
}
function Pills({ tabs, active, onChange }) {
  return (
    <div className="flex flex-wrap gap-2 mt-7">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-2 rounded-xl border transition-all ${
            active === t.key
              ? "bg-white text-[#5B3A70] border-gray-200 shadow-sm"
              : "bg-white/60 text-gray-600 border-gray-200 hover:bg-white"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
function SectionHeader({ title, search, setSearch }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-lg font-semibold text-[#2A1E36]">{title}</h2>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-[#B08CC1]"
        />
      </div>
    </div>
  );
}
function Pager({ page, pageCount, total, pageSize, setPage }) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
      <div>{total > 0 ? `Showing ${start}–${end} of ${total}` : "No records"}</div>
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
          Page {page} / {pageCount || 1}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(pageCount || 1, p + 1))}
          disabled={page >= (pageCount || 1)}
          className={`px-3 py-1 rounded-lg border ${
            page >= (pageCount || 1)
              ? "text-gray-400 border-gray-200"
              : "text-[#4A2C59] border-gray-300 hover:bg-gray-50"
          }`}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/* ============== helpers ============== */
function fmtDate(ts) {
  try {
    if (!ts) return "—";
    const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  } catch { return "—"; }
}
function mask(str, head = 6, tail = 4) {
  const s = String(str || "");
  if (!s) return "—";
  if (s.length <= head + tail) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}
const normalize = {
  patient: (id, d) => ({
    id,
    accessId: d.accessId || d.patientId || d.PatientID || "—",
    name: d.name || d.fullName || d.patientName || `${d.firstName || ""} ${d.lastName || ""}`.trim() || "—",
    email: d.email || "—",
    phone: d.phone || "—",
    nationalId: d.nationalId || d.nid || d.nationalIdHash || "—",
    wallet: d.walletAddress || d.address || "—",
    status: d.status ?? (d.isActive === true ? "Active" : d.isActive === false ? "Inactive" : "—"),
    createdAt: d.createdAt || d.created_at || d.created || null,
  }),
  doctor: (id, d) => ({
    id,
    accessId: d.accessId || d.doctorId || d.DoctorID || "—",
    name: d.name || d.fullName || "—",
    specialty: d.specialty || d.speciality || "—",
    license: d.licenseNumber || d.license || "—",
    facility: d.facility || d.hospital || "—",
    wallet: d.walletAddress || d.address || "—",
    status: d.status ?? (d.isActive === true ? "Active" : d.isActive === false ? "Inactive" : "—"),
    createdAt: d.createdAt || d.created_at || d.created || null,
  }),
  pharmacy: (id, d) => ({
    id,
    accessId: d.accessId || d.pharmacyId || d.PharmacyID || "—",
    name: d.name || d.pharmacyName || "—",
    email: d.email || "—",
    phone: d.phone || "—",
    license: d.licenseNumber || d.license || "—",
    wallet: d.walletAddress || d.address || "—",
    status: d.status ?? (d.isActive === true ? "Active" : d.isActive === false ? "Inactive" : "—"),
    createdAt: d.createdAt || d.created_at || d.created || null,
  }),
  logistics: (id, d) => ({
    id,
    accessId: d.accessId || d.logisticsId || d.LogisticsID || "—",
    name: d.name || d.company || d.partnerName || "—",
    contact: d.contact || d.email || "—",
    sla: d.sla || d.SLA || "—",
    wallet: d.walletAddress || d.address || "—",
    status: d.status ?? (d.isActive === true ? "Active" : d.isActive === false ? "Inactive" : "—"),
    createdAt: d.createdAt || d.created_at || d.created || null,
  }),
};

/* ============== page ============== */
export default function Admin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const queryTab = new URLSearchParams(location.search).get("tab");
  const [active, setActive] = useState(queryTab || "overview");

  // مزامنة التبويب مع الـ URL
  useEffect(() => {
    const s = new URLSearchParams(location.search).get("tab") || "overview";
    if (s !== active) setActive(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // إحصائيات
  const [counts, setCounts] = useState({ users: 0, doctors: 0, patients: 0, pharmacies: 0, logistics: 0 });
  const [loadingCards, setLoadingCards] = useState(true);

  // البيانات
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [pharmacies, setPharmacies] = useState([]);
  const [logistics, setLogistics] = useState([]);

  const [loading, setLoading] = useState({ patients: true, doctors: true, pharmacies: true, logistics: true });

  // بحث وترقيم
  const [qPatients, setQPatients] = useState(""); const [pPatients, setPPatients] = useState(1);
  const [qDoctors, setQDoctors] = useState("");   const [pDoctors, setPDoctors] = useState(1);
  const [qPharms, setQPharms] = useState("");     const [pPharms, setPPharms] = useState(1);
  const [qLogs, setQLogs] = useState("");         const [pLogs, setPLogs] = useState(1);
  const PAGE = 10;

  /* تحميل العدّادات */
  useEffect(() => {
    async function loadCounts() {
      try {
        const [d, p, ph, l] = await Promise.all([
          getDocs(collection(db, "doctors")),
          getDocs(collection(db, "patients")),
          getDocs(collection(db, "pharmacies")),
          getDocs(collection(db, "logistics")),
        ]);
        setCounts({
          users: d.size + p.size + ph.size + l.size,
          doctors: d.size, patients: p.size, pharmacies: ph.size, logistics: l.size,
        });
      } catch (e) { console.error(e); }
      finally { setLoadingCards(false); }
    }
    loadCounts();
  }, []);

  /* تحميل الجداول */
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "patients"));
        const rows = []; snap.forEach((doc) => rows.push(normalize.patient(doc.id, doc.data() || {})));
        rows.sort((a, b) => (b.createdAt?.seconds || b.createdAt || 0) - (a.createdAt?.seconds || a.createdAt || 0));
        setPatients(rows);
      } finally { setLoading((s)=>({ ...s, patients:false })); }

      try {
        const snap = await getDocs(collection(db, "doctors"));
        const rows = []; snap.forEach((doc) => rows.push(normalize.doctor(doc.id, doc.data() || {})));
        rows.sort((a, b) => (b.createdAt?.seconds || b.createdAt || 0) - (a.createdAt?.seconds || a.createdAt || 0));
        setDoctors(rows);
      } finally { setLoading((s)=>({ ...s, doctors:false })); }

      try {
        const snap = await getDocs(collection(db, "pharmacies"));
        const rows = []; snap.forEach((doc) => rows.push(normalize.pharmacy(doc.id, doc.data() || {})));
        rows.sort((a, b) => (b.createdAt?.seconds || b.createdAt || 0) - (a.createdAt?.seconds || a.createdAt || 0));
        setPharmacies(rows);
      } finally { setLoading((s)=>({ ...s, pharmacies:false })); }

      try {
        const snap = await getDocs(collection(db, "logistics"));
        const rows = []; snap.forEach((doc) => rows.push(normalize.logistics(doc.id, doc.data() || {})));
        rows.sort((a, b) => (b.createdAt?.seconds || b.createdAt || 0) - (a.createdAt?.seconds || a.createdAt || 0));
        setLogistics(rows);
      } finally { setLoading((s)=>({ ...s, logistics:false })); }
    })();
  }, []);

  /* فلاتر وترقيم */
  const fPatients = useMemo(() => {
    const q = qPatients.trim().toLowerCase();
    const list = !q ? patients : patients.filter((r) =>
      [r.name, r.email, r.phone, r.accessId, r.nationalId].some((v)=>String(v||"").toLowerCase().includes(q))
    );
    return { total: list.length, rows: list.slice((pPatients - 1) * PAGE, pPatients * PAGE) };
  }, [patients, qPatients, pPatients]);

  const fDoctors = useMemo(() => {
    const q = qDoctors.trim().toLowerCase();
    const list = !q ? doctors : doctors.filter((r) =>
      [r.name, r.specialty, r.accessId, r.license, r.facility].some((v)=>String(v||"").toLowerCase().includes(q))
    );
    return { total: list.length, rows: list.slice((pDoctors - 1) * PAGE, pDoctors * PAGE) };
  }, [doctors, qDoctors, pDoctors]);

  const fPharms = useMemo(() => {
    const q = qPharms.trim().toLowerCase();
    const list = !q ? pharmacies : pharmacies.filter((r) =>
      [r.name, r.email, r.phone, r.license, r.accessId].some((v)=>String(v||"").toLowerCase().includes(q))
    );
    return { total: list.length, rows: list.slice((pPharms - 1) * PAGE, pPharms * PAGE) };
  }, [pharmacies, qPharms, pPharms]);

  const fLogs = useMemo(() => {
    const q = qLogs.trim().toLowerCase();
    const list = !q ? logistics : logistics.filter((r) =>
      [r.name, r.contact, r.sla, r.accessId].some((v)=>String(v||"").toLowerCase().includes(q))
    );
    return { total: list.length, rows: list.slice((pLogs - 1) * PAGE, pLogs * PAGE) };
  }, [logistics, qLogs, pLogs]);

  const tabs = [
    { key: "overview",   label: "Overview" },
    { key: "patients",   label: "Users" },
    { key: "doctors",    label: "Doctors" },
    { key: "pharmacies", label: "Pharmacies" },
    { key: "logistics",  label: "Logistics" },
  ];

  const changeTab = (key) => {
    setActive(key);
    const sp = new URLSearchParams(location.search);
    sp.set("tab", key);
    // تحديث نفس الصفحة بدون الذهاب إلى /admin
    navigate(`${location.pathname}?${sp.toString()}`, { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* زر المينيو لفتح السايدبار */}
      <Header hideMenu={false} onMenuClick={() => setOpen(true)} />

      <section className="mx-auto w-full max-w-6xl px-6 mt-10">
        <div className="flex items-center gap-3">
          <img
            src="/Images/TrustDose-pill.png"
            alt="pill"
            className="w-[75px] h-[75px] shrink-0 select-none"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <div>
            <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-[#2A1E36]">
              Welcome, Admin
            </h1>
            <p className="text-gray-500 text-sm">
              Manage identities & compliance, and monitor medicine transfers.
            </p>
          </div>
        </div>

        {/* بطاقات علوية */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-7">
          <StatCard title="Total Users"   count={loadingCards ? "…" : counts.users}      icon={Users}        accent={C.primary} />
          <StatCard title="Doctors"       count={loadingCards ? "…" : counts.doctors}    icon={Stethoscope}  accent={C.teal} />
          <StatCard title="Pharmacies"    count={loadingCards ? "…" : counts.pharmacies} icon={Building2}    accent={C.primary} />
          <StatCard title="Logistics"     count={loadingCards ? "…" : counts.logistics}  icon={Truck}        accent={C.teal} />
        </div>

        {/* تبويبات */}
        <Pills tabs={tabs} active={active} onChange={changeTab} />

        {/* المحتوى حسب التبويب */}
        <div className="mt-6 mb-16">
          {active === "overview" && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 text-gray-700">
              <p>Choose a section above to view and manage records.</p>
            </div>
          )}

          {active === "patients" && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
              <SectionHeader title="Patients" search={qPatients} setSearch={(v)=>{ setQPatients(v); setPPatients(1); }} />
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-3">Access ID</th>
                      <th className="text-left px-4 py-3">Name</th>
                      <th className="text-left px-4 py-3">Email</th>
                      <th className="text-left px-4 py-3">Phone</th>
                      <th className="text-left px-4 py-3">National ID / Hash</th>
                      <th className="text-left px-4 py-3">Wallet</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading.patients ? (
                      <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>
                    ) : fPatients.rows.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-500">No patients found.</td></tr>
                    ) : (
                      fPatients.rows.map((r) => (
                        <tr key={r.id} className="border-t border-gray-100">
                          <td className="px-4 py-3 font-medium text-[#2A1E36]">{r.accessId}</td>
                          <td className="px-4 py-3">{r.name}</td>
                          <td className="px-4 py-3">{r.email}</td>
                          <td className="px-4 py-3">{r.phone}</td>
                          <td className="px-4 py-3">{mask(r.nationalId, 4, 3)}</td>
                          <td className="px-4 py-3">{mask(r.wallet)}</td>
                          <td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-xs bg-gray-50 text-gray-700">{r.status || "—"}</span></td>
                          <td className="px-4 py-3">{fmtDate(r.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pager page={pPatients} pageCount={Math.ceil(fPatients.total / PAGE)} total={fPatients.total} pageSize={PAGE} setPage={setPPatients} />
            </div>
          )}

          {active === "doctors" && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
              <SectionHeader title="Doctors" search={qDoctors} setSearch={(v)=>{ setQDoctors(v); setPDoctors(1); }} />
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-3">Access ID</th>
                      <th className="text-left px-4 py-3">Name</th>
                      <th className="text-left px-4 py-3">Specialty</th>
                      <th className="text-left px-4 py-3">License</th>
                      <th className="text-left px-4 py-3">Facility</th>
                      <th className="text-left px-4 py-3">Wallet</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading.doctors ? (
                      <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>
                    ) : fDoctors.rows.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-500">No doctors found.</td></tr>
                    ) : (
                      fDoctors.rows.map((r) => (
                        <tr key={r.id} className="border-t border-gray-100">
                          <td className="px-4 py-3 font-medium text-[#2A1E36]">{r.accessId}</td>
                          <td className="px-4 py-3">{r.name}</td>
                          <td className="px-4 py-3">{r.specialty}</td>
                          <td className="px-4 py-3">{r.license}</td>
                          <td className="px-4 py-3">{r.facility}</td>
                          <td className="px-4 py-3">{mask(r.wallet)}</td>
                          <td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-xs bg-gray-50 text-gray-700">{r.status || "—"}</span></td>
                          <td className="px-4 py-3">{fmtDate(r.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pager page={pDoctors} pageCount={Math.ceil(fDoctors.total / PAGE)} total={fDoctors.total} pageSize={PAGE} setPage={setPDoctors} />
            </div>
          )}

          {active === "pharmacies" && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
              <SectionHeader title="Pharmacies" search={qPharms} setSearch={(v)=>{ setQPharms(v); setPPharms(1); }} />
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-3">Access ID</th>
                      <th className="text-left px-4 py-3">Name</th>
                      <th className="text-left px-4 py-3">Email</th>
                      <th className="text-left px-4 py-3">Phone</th>
                      <th className="text-left px-4 py-3">License</th>
                      <th className="text-left px-4 py-3">Wallet</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading.pharmacies ? (
                      <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>
                    ) : fPharms.rows.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-500">No pharmacies found.</td></tr>
                    ) : (
                      fPharms.rows.map((r) => (
                        <tr key={r.id} className="border-t border-gray-100">
                          <td className="px-4 py-3 font-medium text-[#2A1E36]">{r.accessId}</td>
                          <td className="px-4 py-3">{r.name}</td>
                          <td className="px-4 py-3">{r.email}</td>
                          <td className="px-4 py-3">{r.phone}</td>
                          <td className="px-4 py-3">{r.license}</td>
                          <td className="px-4 py-3">{mask(r.wallet)}</td>
                          <td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-xs bg-gray-50 text-gray-700">{r.status || "—"}</span></td>
                          <td className="px-4 py-3">{fmtDate(r.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pager page={pPharms} pageCount={Math.ceil(fPharms.total / PAGE)} total={fPharms.total} pageSize={PAGE} setPage={setPPharms} />
            </div>
          )}

          {active === "logistics" && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
              <SectionHeader title="Logistics" search={qLogs} setSearch={(v)=>{ setQLogs(v); setPLogs(1); }} />
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-3">Access ID</th>
                      <th className="text-left px-4 py-3">Company / Name</th>
                      <th className="text-left px-4 py-3">Contact</th>
                      <th className="text-left px-4 py-3">SLA</th>
                      <th className="text-left px-4 py-3">Wallet</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading.logistics ? (
                      <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>
                    ) : fLogs.rows.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">No logistics found.</td></tr>
                    ) : (
                      fLogs.rows.map((r) => (
                        <tr key={r.id} className="border-t border-gray-100">
                          <td className="px-4 py-3 font-medium text-[#2A1E36]">{r.accessId}</td>
                          <td className="px-4 py-3">{r.name}</td>
                          <td className="px-4 py-3">{r.contact}</td>
                          <td className="px-4 py-3">{r.sla}</td>
                          <td className="px-4 py-3">{mask(r.wallet)}</td>
                          <td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-xs bg-gray-50 text-gray-700">{r.status || "—"}</span></td>
                          <td className="px-4 py-3">{fmtDate(r.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pager page={pLogs} pageCount={Math.ceil(fLogs.total / PAGE)} total={fLogs.total} pageSize={PAGE} setPage={setPLogs} />
            </div>
          )}
        </div>
      </section>

      <Footer />

      {/* ربط السايدبار */}
      <Sidebar
        open={open}
        setOpen={setOpen}
        onNav={(p) => navigate(p)}
        onLogout={() => navigate("/auth", { replace: true })}
      />
    </div>
  );
}
