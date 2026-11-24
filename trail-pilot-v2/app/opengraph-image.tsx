import { ImageResponse } from "next/og";

export const alt = "Trail Pilot — je sais quoi faire aujourd’hui";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", padding: 72, color: "#f4efe6",
          background: "linear-gradient(180deg, #121a23 0%, #0b0f14 100%)", position: "relative",
        }}
      >
        <svg width="1200" height="360" viewBox="0 0 1200 360" style={{ position: "absolute", left: 0, bottom: 0 }}>
          <path d="M0 360 L0 250 L180 140 L300 220 L470 60 L640 210 L780 120 L960 240 L1080 170 L1200 230 L1200 360 Z" fill="#17222d" />
          <path d="M0 360 L0 300 L220 230 L380 290 L560 190 L760 290 L940 220 L1200 300 L1200 360 Z" fill="#1f2d3a" />
        </svg>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 28, letterSpacing: 6, color: "#f4efe6" }}>
          <svg width="64" height="64" viewBox="0 0 512 512">
            <rect width="512" height="512" rx="112" fill="#1b2631" />
            <circle cx="256" cy="256" r="190" fill="none" stroke="#f4efe6" strokeOpacity=".35" strokeWidth="10" strokeLinecap="round" strokeDasharray="0 30" />
            <path d="M256 86 L334 256 H178 Z" fill="#ff6a2b" stroke="#ff6a2b" strokeWidth="8" strokeLinejoin="round" />
            <path d="M178 256 H334 L256 426 Z" fill="#f4efe6" fillOpacity=".24" />
            <circle cx="256" cy="256" r="17" fill="#1b2631" stroke="#f4efe6" strokeWidth="8" />
          </svg>
          TRAIL PILOT
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 96, fontWeight: 800, lineHeight: 1 }}>
          <span>Je sais quoi faire</span>
          <span style={{ color: "#ff6a2b" }}>aujourd’hui.</span>
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#b7c0c8" }}>Check-in du matin → OK · allège · récup</div>
      </div>
    ),
    size,
  );
}
