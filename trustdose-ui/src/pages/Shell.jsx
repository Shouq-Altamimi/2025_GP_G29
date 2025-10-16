// src/pages/Shell.jsx
import React from "react";
import { Outlet } from "react-router-dom";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";
import { useLocation } from "react-router-dom";


export default function Shell() {
  const location = useLocation();
  const isPatientPage = location.pathname.includes("/patient");

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* إذا كنا في صفحة المريض نخفي زر المنيو */}
      <Header
        hideMenu={isPatientPage}
        onMenuClick={() => {
          /* افتحي السايدبار لو تبين */
        }}
      />

      <main className="flex-1">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
