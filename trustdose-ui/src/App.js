// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

/* Auth */
import TrustDoseAuth from "./pages/Auth";
import AuthEmailHandler from "./pages/AuthEmailHandler";
import PasswordReset from "./pages/PasswordReset";

/* Admin */
import AdminDashboard from "./pages/AdminDashboard";
import Admin from "./pages/Admin";

/* Doctor */
import DoctorHome from "./DoctorHome";
import Doctor from "./pages/Doctor";
import Shell from "./pages/DoctorHeader.jsx";
import PrescriptionsPage from "./pages/PrescriptionsPage";
import Dashboard from "./pages/Dashboard.jsx";

/* Patient */
import PShell from "./pages/PShell.jsx";
import Patient from "./pages/Patient";
import PatientNotifications from "./pages/PatientNotifications";


/* Pharmacy */
import PharmacyShell from "./pages/PharmacyShell";
import Pharmacy from "./pages/pharmacy.jsx";
import DeliveryOrders from "./pages/DeliveryOrders.jsx";
import PendingOrders from "./pages/PendingOrders.jsx";
import PharmacyNotifications from "./pages/PharmacyNotifications";

/* Logistics */
import LogisticsHeader from "./pages/LogisticsHeader.jsx";
import Logistics from "./pages/Logistics.jsx";
import LogisticsPending from "./pages/LogisticsPending.jsx";
import LogisticsNotifications from "./pages/LogisticsNotifications.jsx";

/* Shared */
import Welcome from "./pages/Welcome";
import RequireAuth from "./auth/RequireAuth";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Welcome />} />
        <Route path="/auth" element={<TrustDoseAuth />} />
        <Route path="/auth-email" element={<AuthEmailHandler />} />
        <Route path="/password-reset" element={<PasswordReset />} />

        {/* Admin */}
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

        {/* Doctor Home */}
        <Route
          path="/doctor-home"
          element={
            <RequireAuth allowedRoles={["doctor"]}>
              <DoctorHome />
            </RequireAuth>
          }
        />

        {/* Doctor Shell */}
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

        {/* Patient */}
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

        {/* Pharmacy */}
        <Route
          path="/pharmacy"
          element={
            <RequireAuth allowedRoles={["pharmacy"]}>
              <PharmacyShell />
            </RequireAuth>
          }
        >
          <Route index element={<Pharmacy />} />
          <Route
            path="delivery"
            element={<DeliveryOrders pharmacyId="pharma_001" />}
          />
          <Route
            path="pending"
            element={<PendingOrders pharmacyId="pharma_001" />}
          />
          <Route
            path="notifications"
            element={<PharmacyNotifications />}
          />
        </Route>

        {/* Logistics */}
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
          <Route
            path="notifications"
            element={<LogisticsNotifications />}
          />
        </Route>

        {/* 404 */}
        <Route
          path="*"
          element={<div style={{ padding: 24 }}>Page not found</div>}
        />
      </Routes>
    </BrowserRouter>
  );
}
