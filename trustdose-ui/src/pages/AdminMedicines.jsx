// src/pages/AdminMedicines.jsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  LayoutDashboard,
  UserPlus,
  BarChart3,
  Pill,
  LogOut,
  Search,
  Trash2,
  Pencil,
  CheckCircle2,
  AlertCircle,
  Save,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";
import { logEvent } from "../utils/logEvent";
import app, { db } from "../firebase";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { getAuth, signOut } from "firebase/auth";


const C = { primary: "#B08CC1", teal: "#52B9C4", ink: "#4A2C59", pale: "#F6F1FA" };


function SidebarItem({ children, onClick, variant = "solid", active = false }) {
  const base =
    "w-full mb-3 inline-flex items-center gap-3 px-3 py-3 rounded-xl font-medium transition-colors";
  const styles = active
    ? "bg-white text-[#5B3A70]"
    : variant === "ghost"
    ? "text-white/90 hover:bg-white/10"
    : "bg-white/25 text-white hover:bg-white/35";
  return (
    <button
      onClick={onClick}
      className={`${base} ${styles}`}
      aria-current={active ? "page" : undefined}
      type="button"
    >
      {children}
    </button>
  );
}

function TDAdminSidebar({ open, setOpen, onNav, onLogout }) {
  const location = useLocation();
  const isActive = (path) => location.pathname + location.search === path;

  const go = (path) => {
    setOpen(false);
    onNav?.(path);
  };

  return (
    <>
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      <aside
        className="fixed top-0 left-0 z-50 h-full w-[290px] shadow-2xl"
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
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="px-3">
          <SidebarItem active={isActive("/admin/dashboard")} onClick={() => go("/admin/dashboard")}>
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </SidebarItem>

          <SidebarItem active={isActive("/admin")} onClick={() => go("/admin")}>
            <UserPlus size={18} />
            <span>Add Doctor</span>
          </SidebarItem>

          <SidebarItem active={isActive("/admin/medicines")} onClick={() => go("/admin/medicines")}>
            <Pill size={18} />
            <span>Add Medicine</span>
          </SidebarItem>

          <SidebarItem active={isActive("/admin/analytics")} onClick={() => go("/admin/analytics")}>
            <BarChart3 size={18} />
            <span>Analytics</span>
          </SidebarItem>

          <SidebarItem
            variant="ghost"
            onClick={() => {
              setOpen(false);
              onLogout?.();
            }}
          >
            <LogOut size={18} />
            <span>Sign out</span>
          </SidebarItem>
        </nav>
      </aside>
    </>
  );
}

/* =======================
   Helpers
======================= */
const FORMS = [
  "tablet",
  "capsule",
  "inhaler",
  "suspension",
  "drops",
  "injection",
  "cream",
  "ointment",
];

function normText(s) {
  return String(s || "").trim();
}
function toNumberOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function clamp(n, a, b) {
  if (n == null) return null;
  return Math.min(b, Math.max(a, n));
}
function isNonEmpty(v) {
  return normText(v).length > 0;
}
function okRange(minV, maxV) {
  if (minV == null || maxV == null) return false;
  return minV <= maxV;
}

function removeArabic(text) {
  return text.replace(/[\u0600-\u06FF]/g, "");
}

/* =======================
   Page
======================= */
export default function AdminMedicines() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    localStorage.clear();
    sessionStorage.clear();
    try {
      await signOut(getAuth(app));
    } catch {}
    navigate("/auth", { replace: true });
  }

  // list
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  // search
  const [q, setQ] = useState("");
  const ITEMS_PER_PAGE = 10;
const [page, setPage] = useState(1);

  // form
  const empty = () => ({
    id: null,
    label: "",
    name: "",
    dosageForm: "tablet",
    sensitivity: "NonSensitive", // "Sensitive" | "NonSensitive"
    minTemp: "",
    maxTemp: "",
    minHumidity: "",
    maxHumidity: "",
  });
  const [form, setForm] = useState(empty());
  const isSensitive = form.sensitivity === "Sensitive";

  // ui messages
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [successModal, setSuccessModal] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function loadMedicines() {
    setLoading(true);
    try {
      const qy = query(collection(db, "medicines"), orderBy("label", "asc"));
      const snap = await getDocs(qy);
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      setRows(list);
    } catch (e) {
      setErrorMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMedicines();
  }, []);

  const filtered = useMemo(() => {
    const s = normText(q).toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const a = `${r.label || ""} ${r.name || ""} ${r.dosageForm || ""} ${r.sensitivity || ""}`.toLowerCase();
      return a.includes(s);
    });
  }, [rows, q]);
  useEffect(() => {
  setPage(1);
}, [q]);

const totalItems = filtered.length;
const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));

const currentPage = Math.min(page, totalPages);
const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
const endIndex = startIndex + ITEMS_PER_PAGE;

const paginatedRows = filtered.slice(startIndex, endIndex);

const showingFrom = totalItems === 0 ? 0 : startIndex + 1;
const showingTo = Math.min(endIndex, totalItems);

useEffect(() => {
  if (page > totalPages) {
    setPage(totalPages);
  }
}, [page, totalPages]);

  function startEdit(r) {
    setStatus("");
    setErrorMsg("");
    setForm({
      id: r.id,
      label: r.label || "",
      name: r.name || "",
      dosageForm: r.dosageForm || "tablet",
      sensitivity: r.sensitivity || "NonSensitive",
      minTemp: r.minTemp ?? "",
      maxTemp: r.maxTemp ?? "",
      minHumidity: r.minHumidity ?? "",
      maxHumidity: r.maxHumidity ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setForm(empty());
  }

  function validate() {
    const label = normText(form.label);
    const name = normText(form.name);
    if (!label) return "Label is required.";
    if (!name) return "Name is required.";

    /*const minT = toNumberOrNull(form.minTemp);
    const maxT = toNumberOrNull(form.maxTemp);
    const minH = toNumberOrNull(form.minHumidity);
    const maxH = toNumberOrNull(form.maxHumidity);

    if ((minT != null || maxT != null) && !okRange(minT, maxT)) return "Temp range must be valid (min ≤ max).";
    if ((minH != null || maxH != null) && !okRange(minH, maxH)) return "Humidity range must be valid (min ≤ max).";

    if ((minT != null && maxT == null) || (minT == null && maxT != null)) return "Please fill both minTemp and maxTemp.";
    if ((minH != null && maxH == null) || (minH == null && maxH != null)) return "Please fill both minHumidity and maxHumidity.";
*/
const minT = toNumberOrNull(form.minTemp);
const maxT = toNumberOrNull(form.maxTemp);
const minH = toNumberOrNull(form.minHumidity);
const maxH = toNumberOrNull(form.maxHumidity);

if (form.sensitivity === "Sensitive") {
  if (minT == null || maxT == null) {
    return "Temperature range is required for sensitive medicines.";
  }
  if (minH == null || maxH == null) {
    return "Humidity range is required for sensitive medicines.";
  }
}

if ((minT != null && maxT == null) || (minT == null && maxT != null)) {
  return "Please fill both minTemp and maxTemp.";
}

if ((minH != null && maxH == null) || (minH == null && maxH != null)) {
  return "Please fill both minHumidity and maxHumidity.";
}

if ((minT != null || maxT != null) && !okRange(minT, maxT)) {
  return "Temp range must be valid (min ≤ max).";
}

if ((minH != null || maxH != null) && !okRange(minH, maxH)) {
  return "Humidity range must be valid (min ≤ max).";
}
    return "";
  }

  async function handleSave() {
    setStatus("");
    setErrorMsg("");
    const err = validate();
    if (err) {
      setErrorMsg(err);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        label: normText(form.label),
        name: normText(form.name),
        dosageForm: form.dosageForm,
        sensitivity: form.sensitivity, 
        minTemp: toNumberOrNull(form.minTemp),
        maxTemp: toNumberOrNull(form.maxTemp),
        minHumidity: toNumberOrNull(form.minHumidity),
        maxHumidity: toNumberOrNull(form.maxHumidity),
        updatedAt: serverTimestamp(),
      };

      /*if (!form.id) {
        await addDoc(collection(db, "medicines"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setSuccessModal({ title: "Medicine added", msg: "The medicine has been saved successfully." });
      } else {
        await updateDoc(doc(db, "medicines", form.id), payload);
        setSuccessModal({ title: "Medicine updated", msg: "The medicine has been updated successfully." });
      }*/

        if (!form.id) {
  await addDoc(collection(db, "medicines"), {
    ...payload,
    createdAt: serverTimestamp(),
  });

  await logEvent(`Admin added medicine: ${payload.label}`, "admin", "medicine_create");

  setSuccessModal({ title: "Medicine added", msg: "The medicine has been saved successfully." });
} else {
  await updateDoc(doc(db, "medicines", form.id), payload);

  await logEvent(`Admin updated medicine: ${payload.label}`, "admin", "medicine_update");

  setSuccessModal({ title: "Medicine updated", msg: "The medicine has been updated successfully." });
}

      resetForm();
      await loadMedicines();
    } catch (e) {
      setErrorMsg(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    const ok = window.confirm("Are you sure you want to delete this medicine?");
    if (!ok) return;
    setErrorMsg("");
    try {
      await deleteDoc(doc(db, "medicines", id));
      await logEvent(`Admin deleted medicine: ${id}`, "admin", "medicine_delete");
      await loadMedicines();
    } catch (e) {
      setErrorMsg(String(e?.message || e));
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header hideMenu={false} onMenuClick={() => setOpen(true)} />

      {errorMsg && (
        <div className="w-full">
          <div className="mx-auto w-full max-w-6xl px-4 mt-4">
            <div className="mb-4 p-4 rounded-xl flex items-center gap-2 text-red-700 bg-red-100 border border-red-300">
              <AlertCircle size={20} />
              <span className="text-sm font-medium">{errorMsg}</span>
            </div>
          </div>
        </div>
      )}

      {successModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm px-6 py-5 rounded-3xl shadow-xl border" style={{ background: C.pale, borderColor: C.primary }}>
            <div className="flex flex-col items-center text-center">
              <div className="mx-auto mb-3 flex items-center justify-center w-12 h-12 rounded-full" style={{ backgroundColor: "#ECFDF3" }}>
                <CheckCircle2 size={28} style={{ color: "#16A34A" }} />
              </div>
              <h3 className="text-lg font-semibold mb-1" style={{ color: C.ink }}>
                {successModal.title}
              </h3>
              <p className="text-sm mb-4" style={{ color: "#4B5563" }}>
                {successModal.msg}
              </p>
              <button
                onClick={() => setSuccessModal(null)}
                className="px-5 py-2.5 rounded-xl text-sm font-medium shadow-sm"
                style={{ backgroundColor: C.primary, color: "#FFFFFF" }}
                type="button"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="mx-auto w-full max-w-6xl px-6 mt-10 mb-2">
        <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-[#2A1E36]">
          Add Medicine
        </h1>
        <div className="mt-3 h-px w-full bg-gray-200" />
      </section>

      <main className="flex-1 mx-auto w-full max-w-6xl px-6 pb-10">
        {/* Form */}
        <div className="mt-6 bg-white rounded-3xl shadow-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
  <h3 className="text-xl font-semibold text-[#4A2C59]">
    {form.id ? "Edit Medicine" : "Create Medicine"}
  </h3>

  {form.id && (
    <button
      onClick={resetForm}
      className="rounded-2xl border border-gray-200 px-4 py-2 text-[#4A2C59] hover:bg-[#F5F0FA]"
      type="button"
    >
      Cancel Edit
    </button>
  )}
</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Label <span className="text-rose-600">*</span>
              </label>
              <input
  value={form.label}
  onChange={(e) =>
    setForm((p) => ({
      ...p,
      label: removeArabic(e.target.value),
    }))
  }
  placeholder="e.g., azithromycin 500 mg"
  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1]"
/>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Name <span className="text-rose-600">*</span>
              </label>
             <input
  value={form.name}
  onChange={(e) =>
    setForm((p) => ({
      ...p,
      name: removeArabic(e.target.value),
    }))
  }
  placeholder="e.g., azithromycin"
  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1]"
/>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">Dosage Form</label>
              <select
                value={form.dosageForm}
                onChange={(e) => setForm((p) => ({ ...p, dosageForm: e.target.value }))}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1] bg-white"
              >
                {FORMS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">Sensitivity</label>
              <select
                value={form.sensitivity}
                onChange={(e) => setForm((p) => ({ ...p, sensitivity: e.target.value }))}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1] bg-white"
              >
                <option value="NonSensitive">NonSensitive</option>
                <option value="Sensitive">Sensitive</option>
              </select>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50">
        <div className="text-sm font-semibold text-gray-700 mb-3">
  Temperature Range (°C) {isSensitive ? "*" : "— optional"}
</div>
              <div className="grid grid-cols-2 gap-3">
  <input
  type="number"
  step="0.1"
  min="-50"
  max="100"
  required={isSensitive}
  value={form.minTemp}
  onChange={(e) => setForm((p) => ({ ...p, minTemp: e.target.value }))}
  placeholder="minTemp"
  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1] bg-white"
/>
           <input
  type="number"
  step="0.1"
  min="-50"
  max="100"
  required={isSensitive}
  value={form.maxTemp}
  onChange={(e) => setForm((p) => ({ ...p, maxTemp: e.target.value }))}
  placeholder="maxTemp"
  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1] bg-white"
/>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50">
              <div className="text-sm font-semibold text-gray-700 mb-3">
  Humidity Range (%) {isSensitive ? "*" : "— optional"}
</div>
              <div className="grid grid-cols-2 gap-3">
   <input
  type="number"
  step="0.1"
  min="0"
  max="100"
  required={isSensitive}
  value={form.minHumidity}
  onChange={(e) => setForm((p) => ({ ...p, minHumidity: e.target.value }))}
  placeholder="minHumidity"
  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1] bg-white"
/>
        <input
  type="number"
  step="0.1"
  min="0"
  max="100"
  required={isSensitive}
  value={form.maxHumidity}
  onChange={(e) => setForm((p) => ({ ...p, maxHumidity: e.target.value }))}
  placeholder="maxHumidity"
  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-800 outline-none focus:ring-2 focus:ring-[#B08CC1] bg-white"
/>
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
  <button
    onClick={handleSave}
    disabled={saving}
    className={`rounded-2xl px-5 py-3 font-medium text-white shadow-md transition-all ${
      saving ? "bg-[#CBB4D9] cursor-not-allowed" : "bg-[#B08CC1] hover:bg-[#9A7EAF]"
    }`}
    type="button"
  >
    <span className="inline-flex items-center gap-2">
      <Save size={18} /> {saving ? "Saving…" : form.id ? "Update" : "Save"}
    </span>
  </button>
</div>

          {status ? <p className="mt-3 text-center text-xs text-gray-500">{status}</p> : null}
        </div>

        {/* List */}
        <div className="mt-6 bg-white rounded-3xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Pill size={18} style={{ color: C.primary }} />
              <div className="text-lg font-semibold text-[#2A1E36]">Medicines</div>
              <div className="text-xs text-gray-500">
  {loading ? "…" : `${totalItems} item(s)`}
</div>
            </div>

            <div className="w-full sm:w-[360px] relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by label/name/form/sensitivity…"
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-gray-200 outline-none focus:ring-2 focus:ring-[#B08CC1]"
              />
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-3 pr-4">Label</th>
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Form</th>
                  <th className="py-3 pr-4">Sensitivity</th>
                  <th className="py-3 pr-4">Temp (min→max)</th>
                  <th className="py-3 pr-4">Hum (min→max)</th>
                  <th className="py-3 pr-2 text-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td className="py-6 text-gray-400" colSpan={7}>
                      Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td className="py-6 text-gray-400" colSpan={7}>
                      No medicines found.
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="py-3 pr-4 font-semibold text-[#2A1E36]">
                        {r.label || "—"}
                      </td>
                      <td className="py-3 pr-4">{r.name || "—"}</td>
                      <td className="py-3 pr-4">{r.dosageForm || "—"}</td>
                      <td className="py-3 pr-4">
                        <span
                          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border"
                          style={{
                            background:
                              String(r.sensitivity) === "Sensitive" ? "#FEF2F2" : "#F1F8F5",
                            color:
                              String(r.sensitivity) === "Sensitive" ? "#991B1B" : "#166534",
                            borderColor:
                              String(r.sensitivity) === "Sensitive" ? "#FECACA" : "#BBE5C8",
                          }}
                        >
                          {r.sensitivity || "NonSensitive"}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-gray-700">
                        {r.minTemp ?? "—"} → {r.maxTemp ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-gray-700">
                        {r.minHumidity ?? "—"} → {r.maxHumidity ?? "—"}
                      </td>
                      <td className="py-3 pr-2">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => startEdit(r)}
                            className="h-9 w-9 grid place-items-center rounded-xl border border-gray-200 hover:bg-gray-50"
                            title="Edit"
                            type="button"
                          >
                            <Pencil size={16} className="text-gray-700" />
                          </button>
                          <button
                            onClick={() => handleDelete(r.id)}
                            className="h-9 w-9 grid place-items-center rounded-xl border border-gray-200 hover:bg-rose-50"
                            title="Delete"
                            type="button"
                          >
                            <Trash2 size={16} className="text-rose-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
  <div className="text-sm text-gray-500">
    {loading ? "Loading…" : `Showing ${showingFrom}–${showingTo} of ${totalItems}`}
  </div>

  <div className="flex items-center gap-3">
    <button
      onClick={() => setPage((p) => Math.max(1, p - 1))}
      disabled={currentPage === 1 || loading}
      className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
      type="button"
    >
      Previous
    </button>

    <div className="text-sm text-gray-700">
      Page {currentPage} / {totalPages}
    </div>

    <button
      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
      disabled={currentPage === totalPages || loading}
      className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
      type="button"
    >
      Next
    </button>
  </div>
</div>
        </div>
      </main>

      <Footer />

      <TDAdminSidebar
        open={open}
        setOpen={setOpen}
        onNav={(path) => navigate(path)}
        onLogout={handleLogout}
      />
    </div>
  );
}