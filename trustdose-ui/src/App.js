// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";

import AdminDashboard from "./pages/AdminDashboard";
import DoctorHome from "./DoctorHome";
import TrustDoseAuth from "./pages/Auth";

// الطبيب
import Doctor from "./pages/Doctor";
import Shell from "./pages/DoctorHeader.jsx"; // شِل الطبيب

// المريض
import PShell from "./pages/PShell.jsx";      // شِل المريض (جديد)
import Patient from "./pages/Patient";
import PrescriptionsPage from "./pages/PrescriptionsPage";

// الصيدلية
import PharmacyShell from "./pages/PharmacyShell";
import Pharmacy from "./pages/pharmacy.jsx";

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
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/doctor-home" element={<DoctorHome />} />

        {/* 🟣 صفحات الطبيب داخل شِل الطبيب */}
        <Route element={<Shell />}>
          <Route path="/doctor" element={<Doctor />} />
          {/* (اختياري) لو عندك صفحة وصفات خاصة بالطبيب خليها هنا */}
          {/* <Route path="/prescriptions" element={<PrescriptionsPage />} /> */}
        </Route>

        {/* 🔵 صفحات المريض داخل شِل المريض */}
        <Route path="/patient" element={<PShell />}>
          {/* منيو المريض (الصفحة الرئيسية) */}
          <Route index element={<Patient />} />
          {/* وصفات المريض: /patient/prescriptions */}
          <Route path="prescriptions" element={<PrescriptionsPage />} />
        </Route>

        {/* 🟢 صفحات الصيدلية داخل شِل الصيدلية */}
        <Route path="/pharmacy" element={<PharmacyShell />}>
          <Route index element={<Pharmacy />} />
        </Route>

        <Route path="*" element={<div style={{ padding: 24 }}>Page not found</div>} />
      </Routes>
    </BrowserRouter>
  );
}
