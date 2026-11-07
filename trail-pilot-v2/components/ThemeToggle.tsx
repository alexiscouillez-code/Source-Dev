"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "trail-pilot-theme";

/** Bascule clair / sombre. Le thème initial est posé avant l’affichage par le script du layout racine. */
export default function ThemeToggle({ className = "theme-toggle", withLabel = false }: { className?: string; withLabel?: boolean }) {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => { setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark"); }, []);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* navigation privée : le choix vaut pour la session */ }
    setTheme(next);
  };

  const label = theme === "light" ? "Passer en mode sombre" : "Passer en mode clair";
  return (
    <button type="button" className={className} onClick={toggle} aria-label={label} title={label}>
      {theme === "light" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" /></svg>
      )}
      {withLabel && <span>{theme === "light" ? "Mode sombre" : "Mode clair"}</span>}
    </button>
  );
}
