"use client";

import { useEffect, useRef, useState } from "react";
import { APPEARANCE_EVENT, APPEARANCES, currentAppearance, nextAppearance, setAppearance, type Appearance } from "./appearance";

const Sun = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor" /><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7" /></svg>;
const Moon = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a.7.7 0 0 0-.9-.9A9.9 9.9 0 1 0 21.4 15.5a.7.7 0 0 0-.9-.9Z" /></svg>;
/** Verre : un losange facetté et trois étoiles. */
const Glass = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 20 10 12 21 4 10Z" fill="currentColor" fillOpacity=".22" /><path d="M4 10h16M9 3.8 12 10l3-6.2M12 10v11" strokeOpacity=".8" /><circle cx="20" cy="4" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="19" r=".8" fill="currentColor" stroke="none" /></svg>;
const ICON: Record<Appearance, () => React.JSX.Element> = { light: Sun, dark: Moon, glass: Glass };

/**
 * Bouton d'apparence : un clic passe à la suivante (Jour → Nuit → Verre). L'icône montre l'apparence actuelle.
 * Tous les boutons de la page restent synchronisés. Le choix direct entre les trois est aussi dans Compte.
 */
export default function ThemeToggle({ className = "theme-toggle" }: { className?: string }) {
  const [a, setA] = useState<Appearance | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setA(currentAppearance());
    const on = (e: Event) => setA((e as CustomEvent<Appearance>).detail);
    window.addEventListener(APPEARANCE_EVENT, on);
    return () => window.removeEventListener(APPEARANCE_EVENT, on);
  }, []);
  const cur = a ?? "dark", next = nextAppearance(cur);
  const label = `Apparence : ${APPEARANCES.find((x) => x.id === cur)!.label}. Passer en mode ${APPEARANCES.find((x) => x.id === next)!.label}`;
  const Icon = ICON[cur];
  return (
    <button ref={ref} type="button" className={`${className} ap-toggle`} data-ap={cur} aria-label={label} title={label}
      onClick={() => setAppearance(next, ref.current)}>
      <span className="ap-icon" key={cur}><Icon /></span>
    </button>
  );
}
