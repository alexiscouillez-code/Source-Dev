import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./liquid.css";
import "./cap.css";
import "./grass.css";
import { SITE_URL, SITE_NAME, SITE_DESC } from "@/lib/site";
import DotDefs from "@/components/DotDefs";
import GlassTouch from "@/components/GlassTouch";
import GrassField from "@/components/GrassField";
import AutoAppearance from "@/components/AutoAppearance";
import { SUN_INLINE } from "@/lib/engine/sun";

// Mode automatique, avant l'affichage : l'apparence du jour ou de la nuit selon le soleil à la position enregistrée
// (sinon le réglage clair ou sombre du téléphone), écrite comme choix courant que le script suivant applique.
const AUTO_BOOT = `try{var A=JSON.parse(localStorage.getItem('trail-pilot-auto')||'null');if(A&&A.day&&A.night){var S=${SUN_INLINE},u=typeof A.lat=='number'&&typeof A.lon=='number'?S(A.lat,A.lon)>-.833:!matchMedia('(prefers-color-scheme: dark)').matches;localStorage.setItem('trail-pilot-theme',u?A.day:A.night)}}catch{}`;

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
        <script dangerouslySetInnerHTML={{ __html: AUTO_BOOT + "try{const t=localStorage.getItem('trail-pilot-theme'),h=document.documentElement,f={topo:'light',frontale:'dark'}[t];h.dataset.theme=f||(t==='dark'||t==='light'||t==='glass'?t:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));if(f)h.dataset.ap=t}catch{}try{const g=JSON.parse(localStorage.getItem('trail-pilot-glass')||'null');if(g&&g.p)for(const k in g.p)if(/^--g-[a-z0-9-]+$/.test(k)&&/^#[0-9a-f]{6}$/i.test(g.p[k]))document.documentElement.style.setProperty(k,g.p[k])}catch{}" }} />
      </head>
      <body>
        <GrassField />
        <DotDefs />
        <GlassTouch />
        <AutoAppearance />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
