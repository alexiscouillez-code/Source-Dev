import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./liquid.css";
import { SITE_URL, SITE_NAME, SITE_DESC } from "@/lib/site";
import DotDefs from "@/components/DotDefs";
import GlassTouch from "@/components/GlassTouch";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — je sais quoi faire aujourd’hui`, template: `%s · ${SITE_NAME}` },
  description: SITE_DESC,
  applicationName: SITE_NAME,
  keywords: ["entraînement trail", "plan trail", "charge d'entraînement", "préparation ultra", "check-in récupération"],
  alternates: { canonical: "./" },
  openGraph: { type: "website", locale: "fr_FR", siteName: SITE_NAME, url: "./" },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "black-translucent" },
  robots: { index: true, follow: true },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0b0f14" }, { media: "(prefers-color-scheme: light)", color: "#0b0f14" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{const t=localStorage.getItem('trail-pilot-theme');document.documentElement.dataset.theme=t==='dark'||t==='light'||t==='glass'?t:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch{}try{const g=JSON.parse(localStorage.getItem('trail-pilot-glass')||'null');if(g&&g.p)for(const k in g.p)if(/^--g-[a-z0-9-]+$/.test(k)&&/^#[0-9a-f]{6}$/i.test(g.p[k]))document.documentElement.style.setProperty(k,g.p[k])}catch{}" }} />
      </head>
      <body>
        <DotDefs />
        <GlassTouch />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
