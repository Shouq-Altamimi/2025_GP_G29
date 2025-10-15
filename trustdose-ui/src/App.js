import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";

import AdminDashboard from "./pages/AdminDashboard";
import DoctorHome from "./DoctorHome";
import TrustDoseAuth from "./pages/Auth";
import Doctor from "./pages/Doctor";
import Shell from "./pages/Shell";
import Pharmacy from "./pages/pharmacy.jsx";
import Patient from "./pages/Patient";

import RequireAuth from "./auth/RequireAuth"; // 👈 أضفنا الحماية

export default function App() {
  return (
    <BrowserRouter>
      {/* شريط تنقل للتجربة فقط */}
      <nav
        style={{
          padding: 12,
          borderBottom: "1px solid #eee",
          display: "flex",
          gap: 12,
        }}
      >
        <Link to="/auth">Login</Link>
        <Link to="/admin">Admin</Link>
        <Link to="/doctor-home">DoctorHome</Link>
        <Link to="/doctor">Doctor</Link>
        <Link to="/pharmacy">Pharmacy</Link>
        <Link to="/patient">Patient</Link>
      </nav>

      <Routes>
        {/* التوجيه الافتراضي */}
        <Route path="/" element={<Navigate to="/auth" replace />} />

        {/* صفحة الدخول / التسجيل */}
        <Route path="/auth" element={<TrustDoseAuth />} />

        {/* صفحات عامة أو إدارية */}
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/doctor-home" element={<DoctorHome />} />

        {/* الصفحات داخل الـ Shell (محمية حسب الدور) */}
        <Route element={<Shell />}>
          <Route
            path="/doctor"
            element={
              <RequireAuth allowedRoles={["doctor"]}>
                <Doctor />
              </RequireAuth>
            }
          />
          <Route
            path="/pharmacy"
            element={
              <RequireAuth allowedRoles={["pharmacy"]}>
                <Pharmacy />
              </RequireAuth>
            }
          />
          <Route
            path="/patient"
            element={
              <RequireAuth allowedRoles={["patient"]}>
                <Patient />
              </RequireAuth>
            }
          />
        </Route>

        {/* صفحة الخطأ */}
        <Route
          path="*"
          element={<div style={{ padding: 24 }}>Page not found</div>}
        />
      </Routes>
    </BrowserRouter>
  );
}
