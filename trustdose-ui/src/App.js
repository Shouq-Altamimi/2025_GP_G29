// src/App.js
import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";

import TrustDoseAuth from "./pages/Auth";
import AdminDashboard from "./pages/AdminDashboard";
import DoctorHome from "./DoctorHome";

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
// ✅ NEW: صفحة طلبات التوصيل الحسّاسة
import DeliveryOrders from "./pages/DeliveryOrders.jsx";

// البريد / إعادة تعيين
import AuthEmailHandler from "./pages/AuthEmailHandler";
import PasswordReset from "./pages/PasswordReset";

// ✅ الحماية بالأدوار
import RequireAuth from "./auth/RequireAuth";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* افتراضي → auth */}
        <Route path="/" element={<Navigate to="/auth" replace />} />

        {/* صفحات عامة */}
        <Route path="/auth" element={<TrustDoseAuth />} />
        <Route path="/auth-email" element={<AuthEmailHandler />} />
        <Route path="/password-reset" element={<PasswordReset />} />

        {/* الأدمن (محمي) */}
        <Route
          path="/admin"
          element={
            <RequireAuth allowedRoles={["admin"]}>
              <AdminDashboard />
            </RequireAuth>
          }
        />

        {/* الطبيب */}
        <Route
          path="/doctor-home"
          element={
            <RequireAuth allowedRoles={["doctor"]}>
              <DoctorHome />
            </RequireAuth>
          }
        />
        <Route
          element={
            <RequireAuth allowedRoles={["doctor"]}>
              <Shell />
            </RequireAuth>
          }
        >
          <Route path="/doctor" element={<Doctor />} />
          <Route path="/prescriptions" element={<PrescriptionsPage />} />
        </Route>

        {/* المريض */}
        <Route
          path="/patient"
          element={
            <RequireAuth allowedRoles={["patient"]}>
              <PShell />
            </RequireAuth>
          }
        >
          <Route index element={<Patient />} />
          <Route path="prescriptions" element={<PrescriptionsPage />} />
        </Route>

        {/* الصيدلية */}
        <Route
          path="/pharmacy"
          element={
            <RequireAuth allowedRoles={["pharmacy"]}>
              <PharmacyShell />
            </RequireAuth>
          }
        >
          <Route index element={<Pharmacy />} />
          {/* ✅ NEW: /pharmacy/delivery */}
          <Route
            path="delivery"
            element={<DeliveryOrders pharmacyId="pharma_001" />}
          />
        </Route>

        {/* 404 */}
        <Route path="*" element={<div style={{ padding: 24 }}>Page not found</div>} />
      </Routes>
    </BrowserRouter>
  );
}