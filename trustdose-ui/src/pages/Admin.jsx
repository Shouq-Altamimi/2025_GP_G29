"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Users,
  Building2,
  Truck,
  Stethoscope,
  Search,
  X,
  LayoutDashboard,
  UserPlus,
  LogOut,
  CheckCircle2,     
} from "lucide-react";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate, useLocation } from "react-router-dom";

const C = { primary: "#B08CC1", teal: "#52B9C4", ink: "#4A2C59" };
async function hashPasswordSHA256(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateTempPassword() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const a = letters[Math.floor(Math.random() * letters.length)];
  const b = letters[Math.floor(Math.random() * letters.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${a}${b}-${num}`;
}

/* ================= Sidebar ================ */
function Sidebar({ open, setOpen, onNav, onLogout }) {
  const location = useLocation();
  const isActive = (p) => location.pathname + location.search === p;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />
      {/* Drawer */}
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
          <button
            onClick={() => {
              setOpen(false);
              onNav("/admin?tab=patients");
            }}
            className={`w-full mb-3 inline-flex items-center gap-3 px-3 py-3 rounded-xl font-medium ${
              isActive("/admin?tab=patients")
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
              onLogout?.();
            }}
            className="w-full mb-3 inline-flex items-center gap-3 px-3 py-3 rounded-xl font-medium text-white/90 hover:bg-white/10"
          >
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        </nav>
      </aside>
    </>
  );
}

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
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return "—";
  }
}

function mask(str, head = 6, tail = 4) {
  const s = String(str || "");
  if (!s) return "—";
  if (s.length <= head + tail) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

const normalize = {

  patient: (id, d) => {
    const national =
      d.nationalId || d.nid || d.nationalIdHash || d.accessId || "";
    return {
      id,
      accessId: national,
      name:
        d.name ||
        d.fullName ||
        d.patientName ||
        `${d.firstName || ""} ${d.lastName || ""}`.trim() ||
        "—",
      email: d.email || "",
      phone: d.phone || "",
      nationalId: national || "",
      wallet: d.walletAddress || d.address || "",
      status:
        d.status ??
        (d.isActive === true
          ? "Active"
          : d.isActive === false
          ? "Inactive"
          : ""),
      createdAt: d.createdAt || d.created_at || d.created || null,
    };
  },

  doctor: (id, d) => {
    const temp = d.tempPassword || {};
    let tempExpired = false;

    try {
      let expMs = null;
      if (typeof temp.expiresAtMs === "number") {
        expMs = temp.expiresAtMs;
      } else if (temp.expiresAtMs?.toMillis) {
        expMs = temp.expiresAtMs.toMillis();
      } else if (temp.expiresAtMs?.seconds) {
        expMs = temp.expiresAtMs.seconds * 1000;
      }
      if (expMs && Date.now() > expMs) {
        tempExpired = true;
      }
    } catch {
      tempExpired = false;
    }

    let status =
      d.status ??
      (d.isActive === true
        ? "Active"
        : d.isActive === false
        ? "Inactive"
        : "");

    if (tempExpired) {
      status = "Inactive";
    }

    return {
      id,
      accessId: d.accessId || d.doctorId || d.DoctorID || "—",
      name: d.name || d.fullName || "—",
      specialty: d.specialty || d.speciality || "",
      license: d.licenseNumber || d.license || "",
      facility: d.facility || d.hospital || "",
      wallet: d.walletAddress || d.address || "",
      status,
      createdAt: d.createdAt || d.created_at || d.created || null,
      tempExpired,
    };
  },

  pharmacy: (id, d) => ({
    id,
    accessId:
      d.accessId ||
      d.pharmacyId ||
      d.PharmacyID ||
      d.branchId ||
      d.BranchID ||
      "—",
    name: d.name || d.pharmacyName || "—",
    email: d.email || "",
    phone: d.phone || "",
    license: d.licenseNumber || d.license || "",
    address: d.branchAddress || d.BranchAddress || d.address || "",
    wallet: d.walletAddress || "",
    status:
      d.status ??
      (d.isActive === true
        ? "Active"
        : d.isActive === false
        ? "Inactive"
        : ""),
    createdAt: d.createdAt || d.created_at || d.created || null,
  }),

  logistics: (id, d) => ({
    id,
    accessId: d.accessId || d.logisticsId || d.LogisticsID || "—",
    name: d.name || d.company || d.partnerName || "—",
    contact: d.contact || d.email || "",
    sla: d.sla || d.SLA || "",
    wallet: d.walletAddress || d.address || "",
    status:
      d.status ??
      (d.isActive === true
        ? "Active"
        : d.isActive === false
        ? "Inactive"
        : ""),
    createdAt: d.createdAt || d.created_at || d.created || null,
  }),
};

/* ============== page ============== */
export default function Admin() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryTab = new URLSearchParams(location.search).get("tab");
  const [active, setActive] = useState(queryTab || "patients");
  const [open, setOpen] = useState(false);


  const [resetModal, setResetModal] = useState(null); // { doctorLabel, tempPassword, expiresAt }

  // sync tab with URL
  useEffect(() => {
    const s = new URLSearchParams(location.search).get("tab") || "patients";
    if (s !== active) setActive(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // stats
  const [counts, setCounts] = useState({
    users: 0,
    doctors: 0,
    patients: 0,
    pharmacies: 0,
    logistics: 0,
  });
  const [loadingCards, setLoadingCards] = useState(true);

  // data
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [pharmacies, setPharmacies] = useState([]);
  const [logistics, setLogistics] = useState([]);

  // loading per tab
  const [loading, setLoading] = useState({
    patients: true,
    doctors: true,
    pharmacies: true,
    logistics: true,
  });

  // search + paging per tab
  const [qPatients, setQPatients] = useState("");
  const [pPatients, setPPatients] = useState(1);
  const [qDoctors, setQDoctors] = useState("");
  const [pDoctors, setPDoctors] = useState(1);
  const [qPharms, setQPharms] = useState("");
  const [pPharms, setPPharms] = useState(1);
  const [qLogs, setQLogs] = useState("");
  const [pLogs, setPLogs] = useState(1);
  const PAGE = 10;

  /* load counters */
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
          doctors: d.size,
          patients: p.size,
          pharmacies: ph.size,
          logistics: l.size,
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingCards(false);
      }
    }
    loadCounts();
  }, []);

  /* load tables once */
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "patients"));
        const rows = [];
        snap.forEach((docSnap) =>
          rows.push(normalize.patient(docSnap.id, docSnap.data() || {}))
        );
        rows.sort(
          (a, b) =>
            (b.createdAt?.seconds || b.createdAt || 0) -
            (a.createdAt?.seconds || a.createdAt || 0)
        );
        setPatients(rows);
      } finally {
        setLoading((s) => ({ ...s, patients: false }));
      }

      try {
        const snap = await getDocs(collection(db, "doctors"));
        const rows = [];
        snap.forEach((docSnap) =>
          rows.push(normalize.doctor(docSnap.id, docSnap.data() || {}))
        );
        rows.sort(
          (a, b) =>
            (b.createdAt?.seconds || b.createdAt || 0) -
            (a.createdAt?.seconds || a.createdAt || 0)
        );
        setDoctors(rows);
      } finally {
        setLoading((s) => ({ ...s, doctors: false }));
      }

      try {
        const snap = await getDocs(collection(db, "pharmacies"));
        const rows = [];
        snap.forEach((docSnap) =>
          rows.push(normalize.pharmacy(docSnap.id, docSnap.data() || {}))
        );
        rows.sort(
          (a, b) =>
            (b.createdAt?.seconds || b.createdAt || 0) -
            (a.createdAt?.seconds || a.createdAt || 0)
        );
        setPharmacies(rows);
      } finally {
        setLoading((s) => ({ ...s, pharmacies: false }));
      }

      try {
        const snap = await getDocs(collection(db, "logistics"));
        const rows = [];
        snap.forEach((docSnap) =>
          rows.push(normalize.logistics(docSnap.id, docSnap.data() || {}))
        );
        rows.sort(
          (a, b) =>
            (b.createdAt?.seconds || b.createdAt || 0) -
            (a.createdAt?.seconds || a.createdAt || 0)
        );
        setLogistics(rows);
      } finally {
        setLoading((s) => ({ ...s, logistics: false }));
      }
    })();
  }, []);

  /* ======== reset doctor temp password ======== */
  async function handleResetDoctor(row) {
    if (!row?.id) return;

    try {
      const plain = generateTempPassword();
      const hash = await hashPasswordSHA256(plain);
      const now = Date.now();
      const expiresAtMs = now + 24 * 60 * 60 * 1000;

      await updateDoc(doc(db, "doctors", row.id), {
        passwordHash: hash,
        isActive: true,
        status: "Active",
        tempPassword: {
          value: plain,
          valid: true,
          generatedAtMs: now,
          expiresAtMs,
        },
      });

      setDoctors((prev) =>
        prev.map((d) =>
          d.id === row.id
            ? { ...d, status: "Active", tempExpired: false }
            : d
        )
      );

      const expiresText = new Date(expiresAtMs).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      setResetModal({
        doctorLabel: row.accessId || row.name || "Doctor",
        tempPassword: plain,
        expiresAt: expiresText,
      });
    } catch (e) {
      console.error(e);
      alert("Failed to reset password: " + (e?.message || e));
    }
  }

  const fPatients = useMemo(() => {
    const q = qPatients.trim().toLowerCase();
    const list = !q
      ? patients
      : patients.filter((r) =>
          [r.name, r.email, r.phone, r.nationalId].some((v) =>
            String(v || "").toLowerCase().includes(q)
          )
        );
    const flags = {
      hasEmail: list.some((r) => r.email && r.email.trim() !== ""),
      hasPhone: list.some((r) => r.phone && r.phone.trim() !== ""),
      hasNationalId: list.some(
        (r) => r.nationalId && r.nationalId.trim() !== ""
      ),
      hasWallet: list.some((r) => r.wallet && r.wallet.trim() !== ""),
      hasStatus: list.some((r) => r.status && r.status.trim() !== ""),
      hasCreated: list.some((r) => r.createdAt),
    };
    return {
      total: list.length,
      rows: list.slice((pPatients - 1) * PAGE, pPatients * PAGE),
      flags,
    };
  }, [patients, qPatients, pPatients]);

  const fDoctors = useMemo(() => {
    const q = qDoctors.trim().toLowerCase();
    const list = !q
      ? doctors
      : doctors.filter((r) =>
          [r.name, r.specialty, r.accessId, r.license, r.facility].some((v) =>
            String(v || "").toLowerCase().includes(q)
          )
        );
    const flags = {
      hasSpecialty: list.some(
        (r) => r.specialty && r.specialty.trim() !== ""
      ),
      hasLicense: list.some((r) => r.license && r.license.trim() !== ""),
      hasFacility: list.some((r) => r.facility && r.facility.trim() !== ""),
      hasWallet: list.some((r) => r.wallet && r.wallet.trim() !== ""),
      hasStatus: list.some((r) => r.status && r.status.trim() !== ""),
      hasCreated: list.some((r) => r.createdAt),
    };
    return {
      total: list.length,
      rows: list.slice((pDoctors - 1) * PAGE, pDoctors * PAGE),
      flags,
    };
  }, [doctors, qDoctors, pDoctors]);

  const fPharms = useMemo(() => {
    const q = qPharms.trim().toLowerCase();
    const list = !q
      ? pharmacies
      : pharmacies.filter((r) =>
          [r.name, r.email, r.phone, r.license, r.accessId, r.address].some(
            (v) => String(v || "").toLowerCase().includes(q)
          )
        );
    const flags = {
      hasEmail: list.some((r) => r.email && r.email.trim() !== ""),
      hasPhone: list.some((r) => r.phone && r.phone.trim() !== ""),
      hasLicense: list.some((r) => r.license && r.license.trim() !== ""),
      hasAddress: list.some((r) => r.address && r.address.trim() !== ""),
      hasStatus: list.some((r) => r.status && r.status.trim() !== ""),
      hasCreated: list.some((r) => r.createdAt),
    };
    return {
      total: list.length,
      rows: list.slice((pPharms - 1) * PAGE, pPharms * PAGE),
      flags,
    };
  }, [pharmacies, qPharms, pPharms]);

  const fLogs = useMemo(() => {
    const q = qLogs.trim().toLowerCase();
    const list = !q
      ? logistics
      : logistics.filter((r) =>
          [r.name, r.contact, r.sla, r.accessId].some((v) =>
            String(v || "").toLowerCase().includes(q)
          )
        );
    const flags = {
      hasContact: list.some((r) => r.contact && r.contact.trim() !== ""),
      hasSla: list.some((r) => r.sla && r.sla.trim() !== ""),
      hasWallet: list.some((r) => r.wallet && r.wallet.trim() !== ""),
      hasStatus: list.some((r) => r.status && r.status.trim() !== ""),
      hasCreated: list.some((r) => r.createdAt),
    };
    return {
      total: list.length,
      rows: list.slice((pLogs - 1) * PAGE, pLogs * PAGE),
      flags,
    };
  }, [logistics, qLogs, pLogs]);

  const tabs = [
    { key: "patients", label: "Patients" },
    { key: "doctors", label: "Doctors" },
    { key: "pharmacies", label: "Pharmacies" },
    { key: "logistics", label: "Logistics" },
  ];

  const changeTab = (key) => {
    setActive(key);
    const sp = new URLSearchParams(location.search);
    sp.set("tab", key);
    navigate(`${location.pathname}?${sp.toString()}`, { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header hideMenu={false} onMenuClick={() => setOpen(true)} />
      <section className="mx-auto w-full max-w-[1500px] px-8 mt-10">
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
              Manage identities & compliance.
            </p>
          </div>
        </div>

        {/* top cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-7">
          <StatCard
            title="Total Users"
            count={loadingCards ? "…" : counts.users}
            icon={Users}
            accent={C.primary}
          />
          <StatCard
            title="Doctors"
            count={loadingCards ? "…" : counts.doctors}
            icon={Stethoscope}
            accent={C.teal}
          />
          <StatCard
            title="Pharmacies"
            count={loadingCards ? "…" : counts.pharmacies}
            icon={Building2}
            accent={C.primary}
          />
          <StatCard
            title="Logistics"
            count={loadingCards ? "…" : counts.logistics}
            icon={Truck}
            accent={C.teal}
          />
        </div>

        {/* pills (tabs) */}
        <Pills tabs={tabs} active={active} onChange={changeTab} />

        {/* ==== CONTENT (one tab visible) ==== */}
        <div className="mt-6 mb-16">
          {/* Patients */}
          {active === "patients" && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
              <SectionHeader
                title="Patients"
                search={qPatients}
                setSearch={(v) => {
                  setQPatients(v);
                  setPPatients(1);
                }}
              />
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-3">Name</th>
                      {fPatients.flags.hasNationalId && (
                        <th className="text-left px-4 py-3">
                          National ID / Hash
                        </th>
                      )}
                      {fPatients.flags.hasEmail && (
                        <th className="text-left px-4 py-3">Email</th>
                      )}
                      {fPatients.flags.hasPhone && (
                        <th className="text-left px-4 py-3">Phone</th>
                      )}
                      {fPatients.flags.hasWallet && (
                        <th className="text-left px-4 py-3">Wallet</th>
                      )}
                      {fPatients.flags.hasStatus && (
                        <th className="text-left px-4 py-3">Status</th>
                      )}
                      {fPatients.flags.hasCreated && (
                        <th className="text-left px-4 py-3">Created</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {loading.patients ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-4 py-6 text-center text-gray-500"
                        >
                          Loading…
                        </td>
                      </tr>
                    ) : fPatients.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-4 py-6 text-center text-gray-500"
                        >
                          No patients found.
                        </td>
                      </tr>
                    ) : (
                      fPatients.rows.map((r) => (
                        <tr
                          key={r.id}
                          className="border-t border-gray-100"
                        >
                          <td className="px-4 py-3 font-medium text-[#2A1E36]">
                            {r.name}
                          </td>
                          {fPatients.flags.hasNationalId && (
                            <td className="px-4 py-3">
                              {r.nationalId
                                ? mask(r.nationalId, 4, 3)
                                : "—"}
                            </td>
                          )}
                          {fPatients.flags.hasEmail && (
                            <td className="px-4 py-3">
                              {r.email || "—"}
                            </td>
                          )}
                          {fPatients.flags.hasPhone && (
                            <td className="px-4 py-3">
                              {r.phone || "—"}
                            </td>
                          )}
                          {fPatients.flags.hasWallet && (
                            <td className="px-4 py-3">
                              {r.wallet ? mask(r.wallet) : "—"}
                            </td>
                          )}
                          {fPatients.flags.hasStatus && (
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 rounded-full text-xs bg-gray-50 text-gray-700">
                                {r.status || "—"}
                              </span>
                            </td>
                          )}
                          {fPatients.flags.hasCreated && (
                            <td className="px-4 py-3">
                              {fmtDate(r.createdAt)}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pager
                page={pPatients}
                pageCount={Math.ceil(fPatients.total / PAGE)}
                total={fPatients.total}
                pageSize={PAGE}
                setPage={setPPatients}
              />
            </div>
          )}

          {/* Doctors */}
          {active === "doctors" && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-8">
              <SectionHeader
                title="Doctors"
                search={qDoctors}
                setSearch={(v) => {
                  setQDoctors(v);
                  setPDoctors(1);
                }}
              />
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-3">Access ID</th>
                      <th className="text-left px-4 py-3">Name</th>
                      {fDoctors.flags.hasSpecialty && (
                        <th className="text-left px-4 py-3">Specialty</th>
                      )}
                      {fDoctors.flags.hasLicense && (
                        <th className="text-left px-4 py-3">License</th>
                      )}
                      {fDoctors.flags.hasFacility && (
                        <th className="text-left px-4 py-3">Facility</th>
                      )}
                      {fDoctors.flags.hasWallet && (
                        <th className="text-left px-4 py-3">Wallet</th>
                      )}
                      {fDoctors.flags.hasStatus && (
                        <th className="text-left px-4 py-3">Status</th>
                      )}
                      {fDoctors.flags.hasCreated && (
                        <th className="text-left px-4 py-3">Created</th>
                      )}
                      <th className="text-left px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading.doctors ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-4 py-6 text-center text-gray-500"
                        >
                          Loading…
                        </td>
                      </tr>
                    ) : fDoctors.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-4 py-6 text-center text-gray-500"
                        >
                          No doctors found.
                        </td>
                      </tr>
                    ) : (
                      fDoctors.rows.map((r) => (
                        <tr
                          key={r.id}
                          className="border-t border-gray-100"
                        >
                          <td className="px-4 py-3 font-medium text-[#2A1E36]">
                            {r.accessId}
                          </td>
                          <td className="px-4 py-3">{r.name}</td>
                          {fDoctors.flags.hasSpecialty && (
                            <td className="px-4 py-3">
                              {r.specialty || "—"}
                            </td>
                          )}
                          {fDoctors.flags.hasLicense && (
                            <td className="px-4 py-3">
                              {r.license || "—"}
                            </td>
                          )}
                          {fDoctors.flags.hasFacility && (
                            <td className="px-4 py-3">
                              {r.facility || "—"}
                            </td>
                          )}
                          {fDoctors.flags.hasWallet && (
                            <td className="px-4 py-3">
                              {r.wallet ? mask(r.wallet) : "—"}
                            </td>
                          )}
                          {fDoctors.flags.hasStatus && (
                            <td className="px-4 py-3">
                              <span
                                className={`px-2 py-1 rounded-full text-xs ${
                                  r.status === "Active"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : r.status === "Inactive"
                                    ? "bg-rose-50 text-rose-700"
                                    : "bg-gray-50 text-gray-700"
                                }`}
                              >
                                {r.status || "—"}
                              </span>
                            </td>
                          )}
                          {fDoctors.flags.hasCreated && (
                            <td className="px-4 py-3">
                              {fmtDate(r.createdAt)}
                            </td>
                          )}
                          <td className="px-4 py-3">
                            {r.status === "Inactive" ? (
                              <button
                                onClick={() => handleResetDoctor(r)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#B08CC1] text-white hover:bg-[#9A7EAF] shadow-sm"
                              >
                                Reset temp password
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pager
                page={pDoctors}
                pageCount={Math.ceil(fDoctors.total / PAGE)}
                total={fDoctors.total}
                pageSize={PAGE}
                setPage={setPDoctors}
              />
            </div>
          )}

          {active === "pharmacies" && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
              <SectionHeader
                title="Pharmacies"
                search={qPharms}
                setSearch={(v) => {
                  setQPharms(v);
                  setPPharms(1);
                }}
              />
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-3">Access ID</th>
                      <th className="text-left px-4 py-3">Name</th>
                      {fPharms.flags.hasEmail && (
                        <th className="text-left px-4 py-3">Email</th>
                      )}
                      {fPharms.flags.hasPhone && (
                        <th className="text-left px-4 py-3">Phone</th>
                      )}
                      {fPharms.flags.hasLicense && (
                        <th className="text-left px-4 py-3">License</th>
                      )}
                      {fPharms.flags.hasAddress && (
                        <th className="text-left px-4 py-3">Address</th>
                      )}
                      {fPharms.flags.hasStatus && (
                        <th className="text-left px-4 py-3">Status</th>
                      )}
                      {fPharms.flags.hasCreated && (
                        <th className="text-left px-4 py-3">Created</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {loading.pharmacies ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-4 py-6 text-center text-gray-500"
                        >
                          Loading…
                        </td>
                      </tr>
                    ) : fPharms.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-4 py-6 text-center text-gray-500"
                        >
                          No pharmacies found.
                        </td>
                      </tr>
                    ) : (
                      fPharms.rows.map((r) => (
                        <tr
                          key={r.id}
                          className="border-t border-gray-100"
                        >
                          <td className="px-4 py-3 font-medium text-[#2A1E36]">
                            {r.accessId}
                          </td>
                          <td className="px-4 py-3">{r.name}</td>
                          {fPharms.flags.hasEmail && (
                            <td className="px-4 py-3">
                              {r.email || "—"}
                            </td>
                          )}
                          {fPharms.flags.hasPhone && (
                            <td className="px-4 py-3">
                              {r.phone || "—"}
                            </td>
                          )}
                          {fPharms.flags.hasLicense && (
                            <td className="px-4 py-3">
                              {r.license || "—"}
                            </td>
                          )}
                          {fPharms.flags.hasAddress && (
                            <td className="px-4 py-3">
                              {r.address || "—"}
                            </td>
                          )}
                          {fPharms.flags.hasStatus && (
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 rounded-full text-xs bg-gray-50 text-gray-700">
                                {r.status || "—"}
                              </span>
                            </td>
                          )}
                          {fPharms.flags.hasCreated && (
                            <td className="px-4 py-3">
                              {fmtDate(r.createdAt)}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pager
                page={pPharms}
                pageCount={Math.ceil(fPharms.total / PAGE)}
                total={fPharms.total}
                pageSize={PAGE}
                setPage={setPPharms}
              />
            </div>
          )}

          {/* Logistics */}
          {active === "logistics" && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
              <SectionHeader
                title="Logistics"
                search={qLogs}
                setSearch={(v) => {
                  setQLogs(v);
                  setPLogs(1);
                }}
              />
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-3">Access ID</th>
                      <th className="text-left px-4 py-3">
                        Company / Name
                      </th>
                      {fLogs.flags.hasContact && (
                        <th className="text-left px-4 py-3">Contact</th>
                      )}
                      {fLogs.flags.hasSla && (
                        <th className="text-left px-4 py-3">SLA</th>
                      )}
                      {fLogs.flags.hasWallet && (
                        <th className="text-left px-4 py-3">Wallet</th>
                      )}
                      {fLogs.flags.hasStatus && (
                        <th className="text-left px-4 py-3">Status</th>
                      )}
                      {fLogs.flags.hasCreated && (
                        <th className="text-left px-4 py-3">Created</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {loading.logistics ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-6 text-center text-gray-500"
                        >
                          Loading…
                        </td>
                      </tr>
                    ) : fLogs.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-6 text-center text-gray-500"
                        >
                          No logistics found.
                        </td>
                      </tr>
                    ) : (
                      fLogs.rows.map((r) => (
                        <tr
                          key={r.id}
                          className="border-t border-gray-100"
                        >
                          <td className="px-4 py-3 font-medium text-[#2A1E36]">
                            {r.accessId}
                          </td>
                          <td className="px-4 py-3">{r.name}</td>
                          {fLogs.flags.hasContact && (
                            <td className="px-4 py-3">
                              {r.contact || "—"}
                            </td>
                          )}
                          {fLogs.flags.hasSla && (
                            <td className="px-4 py-3">
                              {r.sla || "—"}
                            </td>
                          )}
                          {fLogs.flags.hasWallet && (
                            <td className="px-4 py-3">
                              {r.wallet ? mask(r.wallet) : "—"}
                            </td>
                          )}
                          {fLogs.flags.hasStatus && (
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 rounded-full text-xs bg-gray-50 text-gray-700">
                                {r.status || "—"}
                              </span>
                            </td>
                          )}
                          {fLogs.flags.hasCreated && (
                            <td className="px-4 py-3">
                              {fmtDate(r.createdAt)}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pager
                page={pLogs}
                pageCount={Math.ceil(fLogs.total / PAGE)}
                total={fLogs.total}
                pageSize={PAGE}
                setPage={setPLogs}
              />
            </div>
          )}
        </div>
      </section>

      <Footer />

      {/* Sidebar hook-up */}
      <Sidebar
        open={open}
        setOpen={setOpen}
        onNav={(p) => navigate(p)}
        onLogout={() => navigate("/auth", { replace: true })}
      />
      {resetModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40">
          <div
            className="w-full max-w-sm px-6 py-5 rounded-3xl shadow-xl border"
            style={{
              background: "#F6F1FA",
              borderColor: C.primary,
            }}
          >
            <div className="flex flex-col items-center text-center">
              <div
                className="mx-auto mb-3 flex items-center justify-center w-12 h-12 rounded-full"
                style={{ backgroundColor: "#ECFDF3" }}
              >
                <CheckCircle2 size={28} style={{ color: "#16A34A" }} />
              </div>

              <h3
                className="text-lg font-semibold mb-1"
                style={{ color: C.ink }}
              >
                Temporary password reset successfully
              </h3>

              <p className="text-sm mb-1" style={{ color: "#4B5563" }}>
                New temp password for{" "}
                <span className="font-semibold">
                  {resetModal.doctorLabel}
                </span>
                :
              </p>

              <p
                className="text-base font-semibold mb-2"
                style={{ color: C.ink }}
              >
                {resetModal.tempPassword}
              </p>

              <p className="text-xs mb-4" style={{ color: "#6B7280" }}>
                Valid until {resetModal.expiresAt}. Please share it securely
                with the doctor.
              </p>

              <button
                onClick={() => setResetModal(null)}
                className="px-5 py-2.5 rounded-xl text-sm font-medium shadow-sm"
                style={{
                  backgroundColor: C.primary,
                  color: "#FFFFFF",
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
