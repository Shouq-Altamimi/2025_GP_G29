import React from "react";
import { Menu } from "lucide-react";

/**
 * Header خفيف بارتفاع صغير — لا يغيّر اللوجو
 * مرّر onMenuClick لفتح السايدبار إن أردت
 */
export default function Header({
  onMenuClick,
  logoSrc = "/Images/TrustDose_logo.png",
}) {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b">
      <div className="relative w-full h-20">
        {/* زر القائمة */}
        <button
          type="button"
          aria-label="Open menu"
          onClick={onMenuClick}
          className="absolute left-4 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-xl text-white"
          style={{ background: "var(--td-primary)" }}
        >
          <Menu size={22} />
        </button>

        {/* اللوجو */}
        <img
          src={logoSrc}
          alt="TrustDose"
          className="
            absolute left-20 top-1/2 -translate-y-1/2
            block w-auto
            h-[200px] md:h-[180px] lg:h-[200px]
            object-contain select-none pointer-events-none
          "
          draggable="false"
        />
      </div>
    </header>
  );
}
