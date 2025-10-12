// src/App.js
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

/* المكوّنات المشتركة */
import Header from "./components/Header";
import Footer from "./components/Footer";

/* صفحاتك */
import AdminDashboard from "./pages/AdminDashboard";
import DoctorHome from "./DoctorHome";
import TrustDoseAuth from "./pages/Auth";
import Doctor from "./pages/Doctor"; // صفحة الدكتور الجديدة

export default function App() {
  const openMenu = () => {
    // لو عندك سايدبار افتحيه هنا
  };

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Header onMenuClick={openMenu} />
        <main className="flex-1">
          <Routes>
            {/* الصفحة الافتراضية */}
            <Route path="/" element={<Navigate to="/auth" replace />} />

            {/* الصفحات */}
            <Route path="/auth" element={<TrustDoseAuth />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/doctor-home" element={<DoctorHome />} />
            <Route path="/doctor" element={<Doctor />} />

            {/* 404 */}
            <Route path="*" element={<div style={{ padding: 24 }}>Page not found</div>} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}
