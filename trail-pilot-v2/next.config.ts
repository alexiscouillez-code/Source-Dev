import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // L’appli vit aussi dans un sous-dossier du dépôt Source-Dev : on fixe sa racine pour ne pas
  // reprendre la configuration (PostCSS, dépendances) du projet parent.
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  async redirects() {
    return [{ source: "/presentation", destination: "/", permanent: true }];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
      ],
    }];
  },
};
export default nextConfig;
