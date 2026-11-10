"use client";

import { useEffect, useRef, useState } from "react";
import { switchTheme, targetTheme, THEME_EVENT, type Theme } from "./liquidTheme";

/**
 * Interrupteur clair / sombre. Le thème initial est posé avant l’affichage par le script du layout racine ;
 * le changement se fait en « liquid pour » (voir liquidTheme.ts). Tous les interrupteurs de la page restent synchronisés.
 */
export default function ThemeToggle({ className = "theme-toggle" }: { className?: string }) {
  const [dark, setDark] = useState<boolean | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setDark(targetTheme() === "dark");
    const on = (e: Event) => setDark((e as CustomEvent<Theme>).detail === "dark");
    window.addEventListener(THEME_EVENT, on);
    return () => window.removeEventListener(THEME_EVENT, on);
  }, []);

  const label = dark ? "Passer en mode clair" : "Passer en mode sombre";
  return (
    <button ref={ref} type="button" role="switch" aria-checked={dark ?? false} aria-label={label} title={label}
      className={`${className} lq-toggle`} data-on={dark ? "" : undefined} data-ready={dark == null ? undefined : ""}
      onClick={() => ref.current && switchTheme(ref.current)}>
      <span className="lq-knob">
        <svg className="lq-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor" /><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7" /></svg>
        <svg className="lq-moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a.7.7 0 0 0-.9-.9A9.9 9.9 0 1 0 21.4 15.5a.7.7 0 0 0-.9-.9Z" /></svg>
      </span>
    </button>
  );
}
