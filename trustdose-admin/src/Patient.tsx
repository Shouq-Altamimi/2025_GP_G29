// @ts-nocheck
"use client";
import React, { useEffect, useMemo, useState } from "react";

/**
 * Patient Portal — English only, working preview (no backend)
 * - Auto-starts with a demo patient (no Login)
 * - Optional Sign Up creates a new patient and auto-logs in
 * - My Prescriptions (Delivery only): timeline (Received → Nearby → Delivered) + pharmacy + 3-day doses
 * - Pharmacies tab with City dropdown
 * - Notifications tab with sample alerts
 * - Profile tab
 */
export default function PatientPortalPreview() {
  const DEMO_USER = {
    id: "1000000001",
    name: "Salem Al-Qahtani",
    phone: "+966500000001",
    birthDate: "1983-09-12",
    allergies: "Penicillin",
    password: "P@ssw0rd!",
  };

  const [users, setUsers] = useState({});
  const [currentId, setCurrentId] = useState("");
  const [view, setView] = useState("portal"); // "portal" | "signup"

  // Seed & load users
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("td.users") || "{}");
      if (Object.keys(u).length === 0) {
        u[DEMO_USER.id] = DEMO_USER;
      }
      setUsers(u);
      setCurrentId(DEMO_USER.id); // auto-login
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("td.users", JSON.stringify(users));
    } catch {}
  }, [users]);

  // ===== Prescriptions (Delivery only) =====
  const [prescriptions] = useState([
    {
      ref: "RX-0001",
      patientId: "1000000001",
      medicine: "Insulin",
      dose: "10u",
      durationDays: 30,
      timesPerDay: 2,
      notes: "Before breakfast & dinner",
      type: "Delivery",
      city: "Riyadh",
      status: "Pending Delivery", // New | Dispensed | Pending Delivery | Delivered | Cancelled | Re-dispensed
      createdAt: "2025-09-25 09:15",
      pharmacy: { name: "Nahdi - Olaya", address: "Olaya St.", phone: "+96611-111-1111" },
      history: [
        { t: "2025-09-25 09:15", label: "New" },
        { t: "2025-09-25 09:40", label: "Dispensed" },
        { t: "2025-09-25 10:10", label: "Pending Delivery" },
      ],
    },
    {
      ref: "RX-0003",
      patientId: "1000000001",
      medicine: "Metformin",
      dose: "850mg",
      durationDays: 14,
      timesPerDay: 2,
      notes: "After meals",
      type: "Delivery",
      city: "Jeddah",
      status: "Delivered",
      createdAt: "2025-08-15 10:05",
      pharmacy: { name: "Nahdi - Al Andalus", address: "Andalus St.", phone: "+96612-333-3333" },
      history: [
        { t: "2025-08-15 10:05", label: "New" },
        { t: "2025-08-15 12:00", label: "Dispensed" },
        { t: "2025-08-16 09:30", label: "Pending Delivery" },
        { t: "2025-08-16 12:15", label: "Delivered" },
      ],
    },
  ]);

  // ===== Pharmacies by city =====
  const pharmaciesByCity = {
    Riyadh: [
      { id: "PH-01", name: "Nahdi - Olaya", address: "Olaya St.", phone: "+96611-111-1111" },
      { id: "PH-02", name: "Al-Dawaa - King Fahd", address: "King Fahd Rd.", phone: "+96611-222-2222" },
    ],
    Jeddah: [{ id: "PH-10", name: "Nahdi - Al Andalus", address: "Andalus St.", phone: "+96612-333-3333" }],
    Dammam: [],
  };

  // ===== Actions =====
  const handleSignup = (u) => {
    if (users[u.id]) throw new Error("National ID already exists");
    const next = { ...users, [u.id]: u };
    setUsers(next);
    setCurrentId(u.id);
    setView("portal");
  };

  const activeUser = users[currentId] || users[DEMO_USER.id] || DEMO_USER; // safe user

  return (
    <div lang="en" dir="ltr" className="min-h-screen bg-slate-50 text-[color:#212938]">
      {view === "signup" ? (
        <AuthLayout>
          <SignupForm onSubmit={handleSignup} onBack={() => setView("portal")} />
        </AuthLayout>
      ) : (
        <PatientApp
          me={activeUser}
          prescriptions={prescriptions}
          pharmaciesByCity={pharmaciesByCity}
          onSignupClick={() => setView("signup")}
        />
      )}
    </div>
  );
}

/* ===================== AUTH ===================== */
function AuthLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden lg:flex w-2/5 bg-gradient-to-b from-[#B08CC1] to-[#52B9C4] text-white p-10 flex-col justify-between">
        <div>
          <div className="text-2xl font-bold">TrustDose</div>
          <div className="mt-4 text-white/90">Patient Portal</div>
        </div>
      </aside>
      <main className="flex-1 flex items-center justify-center p-6">{children}</main>
    </div>
  );
}

function SignupForm({ onSubmit, onBack }) {
  const [id, setId] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [allergies, setAllergies] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const validId = /^[0-9]{10}$/.test(id);
  const strongPass = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password);

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow p-6">
      <h1 className="text-xl font-bold">Sign Up</h1>
      <div className="mt-4 space-y-3">
        <L label="National ID">
          <input
            className="h-10 w-full rounded-lg border px-3"
            value={id}
            onChange={(e) => setId(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
          />
        </L>
        <L label="Full Name">
          <input className="h-10 w-full rounded-lg border px-3" value={name} onChange={(e) => setName(e.target.value)} />
        </L>
        <div className="grid grid-cols-2 gap-3">
          <L label="Phone">
            <input className="h-10 w-full rounded-lg border px-3" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+9665.." />
          </L>
          <L label="Birth Date">
            <input lang="en-US" type="date" className="h-10 w-full rounded-lg border px-3" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </L>
        </div>
        <L label="Allergies (optional)">
          <input className="h-10 w-full rounded-lg border px-3" value={allergies} onChange={(e) => setAllergies(e.target.value)} />
        </L>
        <L label="Password">
          <input type="password" className="h-10 w-full rounded-lg border px-3" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 8 chars incl. numbers" />
        </L>
        {msg && <div className="text-sm text-rose-600">{msg}</div>}
        <button
          className="w-full h-11 rounded-lg bg-[#52B9C4] text-white disabled:opacity-60"
          disabled={!validId || !strongPass || !name || !phone}
          onClick={() => {
            try {
              onSubmit({ id, phone, name, birthDate, allergies, password });
            } catch (e) {
              setMsg(e.message);
            }
          }}
        >
          Create account
        </button>
        <button className="w-full h-11 rounded-lg border bg-white" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

function L({ label, children }) {
  return (
    <label className="block text-sm">
      <div className="text-gray-600 mb-1">{label}</div>
      {children}
    </label>
  );
}

/* ===================== APP ===================== */
function PatientApp({ me, prescriptions, pharmaciesByCity, onSignupClick }) {
  const [tab, setTab] = useState("My Prescriptions");
  const [selectedCity, setSelectedCity] = useState(Object.keys(pharmaciesByCity)[0] || "Riyadh");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    return prescriptions
      .filter((r) => r.patientId === me.id && r.type === "Delivery")
      .filter((r) => (statusFilter === "All" ? true : r.status === statusFilter))
      .filter((r) => {
        if (!dateFrom && !dateTo) return true;
        const ts = new Date(r.createdAt.replace(" ", "T")).getTime();
        const min = dateFrom ? new Date(dateFrom).getTime() : -Infinity;
        const max = dateTo ? new Date(dateTo).getTime() : Infinity;
        return ts >= min && ts <= max;
      });
  }, [prescriptions, me.id, statusFilter, dateFrom, dateTo]);

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 shrink-0 bg-gradient-to-b from-[#52B9C4] to-[#B08CC1] text-white p-5">
        <div className="font-bold text-lg">TrustDose — Patient</div>
        <div className="mt-3 text-sm opacity-90">{me.name}</div>
        <nav className="mt-5 space-y-2">
          {["My Prescriptions", "Pharmacies", "Notifications", "Profile"].map((t) => (
            <div key={t} onClick={() => setTab(t)} className={`px-3 py-2 rounded-lg cursor-pointer ${tab === t ? "bg-white/25" : "hover:bg-white/15"}`}>{t}</div>
          ))}
        </nav>
        <button className="mt-6 w-full h-10 rounded-lg border bg-white/10 hover:bg-white/20" onClick={onSignupClick}>Sign Up new</button>
      </aside>

      <main className="flex-1 p-6 space-y-4 bg-slate-50 text-[color:#213547]">
        {tab === "My Prescriptions" && (
          <section className="space-y-4">
            {/* Filters */}
            <div className="rounded-xl border bg-white p-4 grid md:grid-cols-3 gap-3 items-end">
              <div>
                <div className="text-xs text-gray-600 mb-1">Status</div>
                <select className="h-10 px-2 rounded-lg border w-full" value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}>
                  {['All','New','Dispensed','Pending Delivery','Delivered','Cancelled','Re-dispensed'].map((s)=>(<option key={s} value={s}>{s}</option>))}
                </select>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">Date from</div>
                <input lang="en-US" type="date" className="h-10 w-full rounded-lg border px-3" value={dateFrom} onChange={(e)=>setDateFrom(e.target.value)} />
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">Date to</div>
                <input lang="en-US" type="date" className="h-10 w-full rounded-lg border px-3" value={dateTo} onChange={(e)=>setDateTo(e.target.value)} />
              </div>
            </div>

            {/* List */}
            {filtered.map((r) => (
              <div key={r.ref} className="rounded-xl border bg-white p-4">
                <div className="flex justify-between">
                  <div>
                    <div className="font-semibold">{r.medicine} — {r.dose}</div>
                    <div className="text-sm text-gray-600">Ref: {r.ref} • {r.status}</div>
                  </div>
                  <div className="text-sm text-gray-500">{r.createdAt}</div>
                </div>

                {/* Timeline + Pharmacy + Doses */}
                <div className="mt-3 border-t pt-3 space-y-3">
                  <DeliveryStepper status={r.status} />
                  {r.pharmacy && (
                    <div className="text-sm">
                      <div className="font-medium">Pharmacy</div>
                      <div>{r.pharmacy.name} — {r.pharmacy.address}</div>
                      <div className="text-gray-500">{r.pharmacy.phone}</div>
                    </div>
                  )}
                  <div>
                    <div className="font-medium">Upcoming Doses (next 3 days)</div>
                    <div className="grid sm:grid-cols-3 gap-3 mt-1">
                      {buildNextDoses(r).map((d, i) => (
                        <div key={i} className="rounded-xl border bg-slate-50 p-2 text-sm">
                          <div className="text-xs text-gray-500">{d.day}</div>
                          {d.slots.map((s, j) => (<div key={j}>• {s}</div>))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {tab === "Pharmacies" && (
          <section>
            <h1 className="text-2xl font-bold mb-3">Contracted Pharmacies</h1>
            <div className="mb-4 flex gap-2 items-center">
              <label htmlFor="city" className="text-sm text-gray-600">Select City:</label>
              <select id="city" className="h-10 px-2 rounded-lg border bg-white" value={selectedCity} onChange={(e)=>setSelectedCity(e.target.value)}>
                {Object.keys(pharmaciesByCity).map((city)=>(<option key={city} value={city}>{city}</option>))}
              </select>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {pharmaciesByCity[selectedCity]?.length ? (
                pharmaciesByCity[selectedCity].map((p)=>(
                  <div key={p.id} className="rounded-xl border bg-white p-4">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-sm text-gray-700">{p.address}</div>
                    <div className="text-sm text-gray-500">{p.phone}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">No pharmacies in this city.</div>
              )}
            </div>
          </section>
        )}

        {tab === "Notifications" && (
          <section className="space-y-3">
            <h1 className="text-2xl font-bold">Notifications</h1>
            <NotifCard title="Re-dispensed (after 48h)" body="Your prescription RX-0003 was re-dispensed after 48 hours for continuity of therapy." time="2h ago" />
            <NotifCard title="Unsafe temperature" body="Temperature spike detected during delivery for RX-0001. Pharmacy is verifying product integrity." time="5h ago" severity="warning" />
          </section>
        )}

        {tab === "Profile" && (
          <section>
            <h1 className="text-2xl font-bold">Profile</h1>
            <div className="mt-4 rounded-xl border bg-white p-4 grid sm:grid-cols-2 gap-3 text-sm">
              <Field label="Name" value={me.name} />
              <Field label="National ID" value={me.id} />
              <Field label="Phone" value={me.phone} />
              <Field label="Birth Date" value={me.birthDate} />
              <Field label="Allergies" value={me.allergies} />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function NotifCard({ title, body, time, severity }) {
  return (
    <div className={`rounded-xl border p-4 ${severity === 'warning' ? 'bg-amber-50' : 'bg-white'}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-sm text-gray-700">{body}</div>
        </div>
        <div className="text-xs text-gray-500">{time}</div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-gray-500 text-xs">{label}</div>
      <div className="font-medium">{value || "-"}</div>
    </div>
  );
}

/* ===================== DELIVERY STEPPER ===================== */
function DeliveryStepper({ status }) {
  const idx = mapStatusToIndex(status); // 0: Received, 1: Nearby, 2: Delivered
  const steps = [
    { key: 0, label: "Received" },
    { key: 1, label: "Nearby" },
    { key: 2, label: "Delivered" },
  ];
  return (
    <div className="relative">
      <div className="absolute left-4 right-4 top-4 h-0.5 bg-gray-200" />
      <div className="grid grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.key} className="flex flex-col items-center">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 ${i <= idx ? "border-[#52B9C4]" : "border-gray-300"} ${i < idx ? "bg-[#52B9C4] text-white" : "bg-white text-gray-700"}`}>
              {i < idx ? "✓" : i + 1}
            </div>
            <div className={`mt-2 text-xs ${i <= idx ? "text-[#0f766e]" : "text-gray-500"}`}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
function mapStatusToIndex(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("delivered")) return 2;
  if (s.includes("pending delivery") || s.includes("out")) return 1;
  return 0; // New / Dispensed / Re-dispensed / Cancelled → Received (for preview)
}

/* ===================== HELPERS ===================== */
function buildNextDoses(rx) {
  const out = [];
  const now = new Date();
  for (let d = 0; d < 3; d++) {
    const day = new Date(now);
    day.setDate(now.getDate() + d);
    out.push({ day: isoDay(day), slots: buildSlots(day, rx.timesPerDay) });
  }
  return out;
}
function buildSlots(day, timesPerDay) {
  const slots = [];
  const base = [9, 13, 17, 21];
  for (let i = 0; i < timesPerDay && i < base.length; i++) {
    const dt = new Date(day);
    dt.setHours(base[i], 0, 0, 0);
    slots.push(dt.toTimeString().slice(0, 5));
  }
  return slots;
}
function isoDay(d) {
  return d.toISOString().slice(0, 10);
}
