import { ImageResponse } from "next/og";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#1b2631" }}>
        {/* Logo « Le cap » (image fixe : l'écran d'accueil n'anime pas les icônes). */}
        <svg width="180" height="180" viewBox="0 0 512 512">
          <circle cx="256" cy="256" r="190" fill="none" stroke="#f4efe6" strokeOpacity=".35" strokeWidth="10" strokeLinecap="round" strokeDasharray="0 30" />
          <circle cx="256" cy="66" r="11" fill="#f4efe6" fillOpacity=".7" />
          <path d="M256 86 L334 256 H178 Z" fill="#ff6a2b" stroke="#ff6a2b" strokeWidth="8" strokeLinejoin="round" />
          <path d="M178 256 H334 L256 426 Z" fill="#f4efe6" fillOpacity=".24" />
          <circle cx="256" cy="256" r="17" fill="#1b2631" stroke="#f4efe6" strokeWidth="8" />
        </svg>
      </div>
    ),
    size,
  );
}
