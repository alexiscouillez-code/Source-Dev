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
          <path d="M40 330 C220 320 300 260 420 250 C560 240 560 150 700 120" fill="none" stroke="#ff6a2b" strokeWidth="10" strokeLinecap="round" />
          <circle cx="700" cy="120" r="14" fill="#f4efe6" />
        </svg>
        <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, color: "#ff6a2b" }}>△ TRAIL PILOT</div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 96, fontWeight: 800, lineHeight: 1 }}>
          <span>Je sais quoi faire</span>
          <span style={{ color: "#ff6a2b" }}>aujourd’hui.</span>
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#b7c0c8" }}>Check-in du soir → OK · allège · récup</div>
      </div>
    ),
    size,
  );
}
