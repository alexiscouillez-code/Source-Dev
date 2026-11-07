import { ImageResponse } from "next/og";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0b0f14" }}>
        <svg width="180" height="180" viewBox="0 0 512 512">
          <path d="M76 380 L196 196 L256 276 L320 156 L436 380 Z" fill="#1d2a36" />
          <path d="M96 372 C170 360 196 300 236 300 C280 300 280 222 320 196" fill="none" stroke="#ff6a2b" strokeWidth="26" strokeLinecap="round" />
          <circle cx="320" cy="196" r="26" fill="#f4efe6" />
        </svg>
      </div>
    ),
    size,
  );
}
