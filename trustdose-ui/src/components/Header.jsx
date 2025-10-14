import React from "react";

/**
 * Header رسمي وخفيف
 * - أصلحت تحذير eslint (no-useless-computed-key)
 * - اللوجو افتراضي 32px (قابِل للتغيير عبر prop)
 */
export default function Header({
  onMenuClick,
  logoSrc = "/Images/TrustDose_logo.png",
  logoHeight = 32,            // ← صغّرته نقطة وحدة. زيديه لو تبين (مثلاً 34)
  iconWidth = 20,
  barThickness = 2.5,
  barGap = 4.5,
  color = "var(--td-primary-ink, #7b5297)",
}) {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b">
      <div className="h-16 w-full px-4 flex items-center gap-3">
        {/* زر القائمة */}
        <button
          type="button"
          aria-label="Open menu"
          onClick={onMenuClick}
          className="
            inline-flex h-10 w-10 items-center justify-center
            rounded-lg select-none transition
            hover:bg-black/[0.03] focus:outline-none focus:ring-2
          "
          style={{
            color,
            '--tw-ring-color': 'rgba(159,118,180,.35)',
          }}
        >
          <span
            aria-hidden="true"
            className="flex flex-col items-center justify-center"
            style={{ rowGap: barGap }}
          >
            <span
              className="block rounded-full"
              style={{ width: iconWidth, height: barThickness, background: "currentColor" }}
            />
            <span
              className="block rounded-full"
              style={{ width: iconWidth, height: barThickness, background: "currentColor" }}
            />
            <span
              className="block rounded-full"
              style={{ width: iconWidth, height: barThickness, background: "currentColor" }}
            />
          </span>
        </button>

        {/* اللوجو بجانب الأيقونة */}
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
