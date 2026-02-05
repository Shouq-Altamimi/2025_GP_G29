import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import TrustDoseAuth from "./pages/Auth";
import AdminDashboard from "./pages/AdminDashboard";
import DoctorHome from "./DoctorHome";

import Doctor from "./pages/Doctor";
import Shell from "./pages/DoctorHeader.jsx";

import PShell from "./pages/PShell.jsx";
import Patient from "./pages/Patient";
import PrescriptionsPage from "./pages/PrescriptionsPage";
import PatientNotifications from "./pages/PatientNotifications";


import PharmacyShell from "./pages/PharmacyShell";
import Pharmacy from "./pages/pharmacy.jsx";
import DeliveryOrders from "./pages/DeliveryOrders.jsx";
import PendingOrders from "./pages/PendingOrders.jsx";
import PharmacyNotifications from "./pages/PharmacyNotifications";

import AuthEmailHandler from "./pages/AuthEmailHandler";
import PasswordReset from "./pages/PasswordReset";

import RequireAuth from "./auth/RequireAuth";
import Admin from "./pages/Admin";

import LogisticsHeader from "./pages/LogisticsHeader.jsx";
import Logistics from "./pages/Logistics.jsx";
import LogisticsPending from "./pages/LogisticsPending.jsx";
import LogisticsNotifications from "./pages/LogisticsNotifications.jsx";

import Dashboard from "./pages/Dashboard.jsx";
import Welcome from "./pages/Welcome";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Welcome />} />

        <Route path="/auth" element={<TrustDoseAuth />} />
        <Route path="/auth-email" element={<AuthEmailHandler />} />
        <Route path="/password-reset" element={<PasswordReset />} />

        <Route
          path="/admin"
          element={
            <RequireAuth allowedRoles={["admin"]}>
              <AdminDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/dashboard"
          element={
            <RequireAuth allowedRoles={["admin"]}>
              <Admin />
            </RequireAuth>
          }
        />

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

                  <Route path="/dashboard" element={<Dashboard />} />

        </Route>

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
          <Route path="notifications" element={<PatientNotifications />} />
        </Route>

        <Route
          path="/pharmacy"
          element={
            <RequireAuth allowedRoles={["pharmacy"]}>
              <PharmacyShell />
            </RequireAuth>
          }
        >
          <Route index element={<Pharmacy />} />
<<<<<<< HEAD

          <Route
            path="delivery"
            element={<DeliveryOrders pharmacyId="pharma_001" />}
          />

          <Route
            path="pending"
            element={<PendingOrders pharmacyId="pharma_001" />}
          />
          <Route path="notifications" element={<PharmacyNotifications />} />
</Route>
=======
          <Route path="delivery" element={<DeliveryOrders pharmacyId="pharma_001" />} />
          <Route path="pending" element={<PendingOrders pharmacyId="pharma_001" />} />
        </Route>
>>>>>>> 99e0b4b1ea374dc97501464cc010a2c3f6e7a281

        <Route
          path="/logistics"
          element={
            <RequireAuth allowedRoles={["logistics"]}>
              <LogisticsHeader />
            </RequireAuth>
          }
        >
          <Route index element={<Logistics />} />
          <Route path="pending" element={<LogisticsPending />} />
          <Route path="notifications" element={<LogisticsNotifications />} />
        </Route>

      

        {/* ❗ هذا آخر شي */}
        <Route path="*" element={<div style={{ padding: 24 }}>Page not found</div>} />
      </Routes>
    </BrowserRouter>
  );
}
