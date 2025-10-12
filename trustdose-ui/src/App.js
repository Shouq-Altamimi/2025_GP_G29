import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";

import AdminDashboard from "./pages/AdminDashboard";
import DoctorHome from "./DoctorHome";
import TrustDoseAuth from "./pages/Auth";
import Doctor from "./pages/Doctor";
import Shell from "./pages/Shell";  // يضيف Header/Footer للمسارات اللي داخله فقط

export default function App() {
  return (
    <BrowserRouter>
      {/* تنقّل بسيط للتجربة */}
      <nav style={{ padding: 12, borderBottom: "1px solid #eee", display: "flex", gap: 12 }}>
        <Link to="/auth">Login</Link>
        <Link to="/admin">Admin</Link>
        <Link to="/doctor-home">DoctorHome</Link>
        <Link to="/doctor">Doctor</Link>
      </nav>

      <Routes>
        <Route path="/" element={<Navigate to="/auth" replace />} />
        <Route path="/auth" element={<TrustDoseAuth />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/doctor-home" element={<DoctorHome />} />

        {/* Doctor فقط داخل Shell (مع Header/Footer) */}
        <Route element={<Shell />}>
          <Route path="/doctor" element={<Doctor />} />
        </Route>

        <Route path="*" element={<div style={{ padding: 24 }}>Page not found</div>} />
      </Routes>
    </BrowserRouter>
  );
}
