import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trail Pilot", short_name: "Trail Pilot",
    description: "Check-in du matin, décision du jour : OK, allège ou récup.",
    start_url: "/espace", scope: "/", display: "standalone", orientation: "portrait",
    background_color: "#0b0f14", theme_color: "#0b0f14", lang: "fr",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
