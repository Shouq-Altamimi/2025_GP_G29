// src/components/Footer.jsx
import React from "react";

export default function Footer() {
  return (
    <footer className="py-6 bg-white border-t">
      <div className="mx-auto max-w-6xl px-6 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} TrustDose — All Rights Reserved.
      </div>
    </footer>
  );
}
