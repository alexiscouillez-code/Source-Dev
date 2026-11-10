import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page introuvable" };

/** Page 404 : sobre, aux couleurs du site, avec un retour vers l’accueil et l’espace. */
export default function NotFound() {
  const btn = { display: "inline-block", padding: "13px 22px", borderRadius: 999, fontWeight: 700, textDecoration: "none" } as const;
  return (
    <main style={{ position: "fixed", inset: 0, overflow: "auto", display: "grid", placeItems: "center", padding: 24, background: "#0b0f14", color: "#f4efe6", fontFamily: "'Bricolage Grotesque Variable', system-ui, sans-serif", textAlign: "center" }}>
      <div style={{ display: "grid", gap: 18, justifyItems: "center", maxWidth: 460 }}>
        <svg viewBox="0 0 512 512" width="64" height="64" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#1b2631" /><path d="M96 372 C170 360 196 300 236 300 C280 300 280 222 320 196" fill="none" stroke="#ff6a2b" strokeWidth="30" strokeLinecap="round" /><circle cx="320" cy="196" r="30" fill="#f4efe6" /></svg>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, letterSpacing: ".16em", color: "#ff6a2b" }}>ERREUR 404</span>
        <h1 style={{ margin: 0, fontSize: "clamp(34px, 8vw, 56px)", lineHeight: 1, letterSpacing: "-.03em" }}>Tu es sorti du sentier.</h1>
        <p style={{ margin: 0, color: "#c9d0d6", fontSize: 17, lineHeight: 1.5 }}>Cette page n’existe pas ou a été déplacée. Reprends la trace depuis l’accueil.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
          <Link href="/" style={{ ...btn, background: "#ff6a2b", color: "#0b0f14" }}>Retour à l’accueil</Link>
          <Link href="/espace" style={{ ...btn, border: "1px solid #26333f", color: "#f4efe6" }}>Mon espace</Link>
        </div>
      </div>
    </main>
  );
}
