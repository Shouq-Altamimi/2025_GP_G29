import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";

import AdminDashboard from "./pages/AdminDashboard";
import DoctorHome from "./DoctorHome";
import TrustDoseAuth from "./pages/Auth";

// الطبيب
import Doctor from "./pages/Doctor";
import Shell from "./pages/DoctorHeader.jsx";

// المريض
import PShell from "./pages/PShell.jsx";
import Patient from "./pages/Patient";
import PrescriptionsPage from "./pages/PrescriptionsPage";

// الصيدلية
import PharmacyShell from "./pages/PharmacyShell";
import Pharmacy from "./pages/pharmacy.jsx";

// ✅ أضيفي هذا السطر
import AuthEmailHandler from "./pages/AuthEmailHandler";

export default function App() {
  return (
    <BrowserRouter>
      <nav style={{ padding: 12, borderBottom: "1px solid #eee", display: "flex", gap: 12 }}>
        <Link to="/auth">Login</Link>
        <Link to="/admin">Admin</Link>
        <Link to="/doctor-home">DoctorHome</Link>
        <Link to="/doctor">Doctor</Link>
        <Link to="/pharmacy">Pharmacy</Link>
        <Link to="/patient">Patient</Link>
      </nav>

      <Routes>
        <Route path="/" element={<Navigate to="/auth" replace />} />
        <Route path="/auth" element={<TrustDoseAuth />} />
        
        {/* ✅ أضيفي هذا الـ route للتحقق من الإيميل */}
        <Route path="/auth-email" element={<AuthEmailHandler />} />
        
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/doctor-home" element={<DoctorHome />} />

        <Route element={<Shell />}>
          <Route path="/doctor" element={<Doctor />} />
          <Route path="/prescriptions" element={<PrescriptionsPage />} />
        </Route>

        <Route path="/patient" element={<PShell />}>
          <Route index element={<Patient />} />
          <Route path="prescriptions" element={<PrescriptionsPage />} />
        </Route>

        <Route path="/pharmacy" element={<PharmacyShell />}>
          <Route index element={<Pharmacy />} />
        </Route>

        <Route path="*" element={<div style={{ padding: 24 }}>Page not found</div>} />
      </Routes>
    </BrowserRouter>
  );
}
