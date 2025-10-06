// src/App.js
import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";

// صفحاتك/كومبوننتاتك
import AdminDashboard from "./components/AdminDashboard";
import AddDoctorPage from "./pages/AdminAddDoctor";// أنشأناه قبل شوية

function App() {
  return (
    <BrowserRouter>
      {/* ناڤ بسيط للتجربة */}
      <div style={{ padding: 12, borderBottom: "1px solid #eee" }}>
        <Link to="/admin" style={{ marginRight: 12 }}>Admin</Link>
        <Link to="/add-doctor">Add Doctor</Link>
      </div>

      <Routes>
        {/* وجّه الجذر مباشرة لصفحة الأدمن */}
        <Route path="/" element={<Navigate to="/admin" replace />} />

        {/* صفحاتك */}
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/add-doctor" element={<AddDoctorPage />} />

        {/* أي مسار غير معروف */}
        <Route path="*" element={<div style={{ padding: 24 }}>Page not found</div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
