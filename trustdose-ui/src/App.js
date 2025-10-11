// src/App.js

/*import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";

// الصفحات / الكومبوننتات
import AdminDashboard from "./components/AdminDashboard";
/*import AddDoctorPage from "./pages/AdminAddDoctor";
import DoctorHome from "./DoctorHome";
import TrustDoseAuth from "./pages/Auth"; // صفحة تسجيل الدخول الجديدة

import { db } from "./firebase";
console.log("✅ Firebase connected:", db);


function App() {
  return (
    <BrowserRouter>
      {/* شريط تنقل بسيط للتجربة }
      <div style={{ padding: 12, borderBottom: "1px solid #eee" }}>
        <Link to="/auth" style={{ marginRight: 12 }}>Login</Link>
        <Link to="/admin" style={{ marginRight: 12 }}>Admin</Link>
        <Link to="/add-doctor" style={{ marginRight: 12 }}>Add Doctor</Link>
        <Link to="/doctor">Doctor</Link>
      </div>

      <Routes>
        {/* 👇 الصفحة الرئيسية حالياً تفتح على تسجيل الدخول }
        <Route path="/" element={<Navigate to="/auth" replace />} />

        {/* صفحة تسجيل الدخول }
        <Route path="/auth" element={<TrustDoseAuth />} />

        {/* باقي الصفحات *}
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/add-doctor" element={<AddDoctorPage />} />
        <Route path="/doctor" element={<DoctorHome />} />

        {/* صفحة الخطأ *}
        <Route path="*" element={<div style={{ padding: 24 }}>Page not found</div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;*/
// src/App.js
import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";

// الصفحات / الكومبوننتات
import AdminDashboard from "./pages/AdminDashboard";
import DoctorHome from "./DoctorHome";
import TrustDoseAuth from "./pages/Auth"; // صفحة تسجيل الدخول الجديدة

import { db } from "./firebase";
console.log("✅ Firebase connected:", db);

function App() {
  return (
    <BrowserRouter>
      {/* شريط تنقل بسيط للتجربة */}
      <div style={{ padding: 12, borderBottom: "1px solid #eee" }}>
        <Link to="/auth" style={{ marginRight: 12 }}>Login</Link>
        <Link to="/admin" style={{ marginRight: 12 }}>Admin</Link>
        <Link to="/doctor">Doctor</Link>
      </div>

      <Routes>
        {/* 👇 الصفحة الرئيسية حالياً تفتح على تسجيل الدخول */}
        <Route path="/" element={<Navigate to="/auth" replace />} />

        {/* صفحة تسجيل الدخول */}
        <Route path="/auth" element={<TrustDoseAuth />} />

        {/* لوحة التحكم الجديدة (AdminDashboard) */}
        <Route path="/admin" element={<AdminDashboard />} />

        {/* صفحة الدكتور (مؤقتة للتجربة) */}
        <Route path="/doctor" element={<DoctorHome />} />

        {/* صفحة الخطأ */}
        <Route path="*" element={<div style={{ padding: 24 }}>Page not found</div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
