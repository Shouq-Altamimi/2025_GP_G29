// src/pages/Shell.jsx
import React from "react";
import { Outlet } from "react-router-dom";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";

export default function Shell() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header onMenuClick={() => { /* افتحي السايدبار لو تبين */ }} />

      <main className="flex-1">
        {/* هنا تنعرض الصفحة الداخلية */}
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
