// src/auth/RequireAuth.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";

export default function RequireAuth({ allowedRoles, children }) {
  const location = useLocation();
  const userId = localStorage.getItem("userId");
  const userRole = localStorage.getItem("userRole");

  if (!userId || !userRole) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (allowedRoles?.length && !allowedRoles.includes(userRole)) {
    const fallback =
      userRole === "doctor"
        ? "/doctor"
        : userRole === "pharmacy"
        ? "/pharmacy"
        : userRole === "patient"
        ? "/patient"
        : "/auth";
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
