"use client";

import { useEffect, useRef, useState } from "react";
import { APPEARANCE_EVENT, APPEARANCES, currentAppearance, nextAppearance, setAppearance, type Appearance } from "./appearance";

const Sun = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor" /><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7" /></svg>;
const Moon = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a.7.7 0 0 0-.9-.9A9.9 9.9 0 1 0 21.4 15.5a.7.7 0 0 0-.9-.9Z" /></svg>;
/** Verre : un losange facetté et trois étoiles. */
const Glass = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 20 10 12 21 4 10Z" fill="currentColor" fillOpacity=".22" /><path d="M4 10h16M9 3.8 12 10l3-6.2M12 10v11" strokeOpacity=".8" /><circle cx="20" cy="4" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="19" r=".8" fill="currentColor" stroke="none" /></svg>;
/** Topo : trois courbes de niveau autour d'un sommet. */
const Topo = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M12 9.2c1.6 0 2.6.9 2.6 2.1 0 1.4-1.3 2.3-2.8 2.3s-2.5-.8-2.5-2c0-1.4 1.1-2.4 2.7-2.4Z" /><path d="M11.8 5.6c3.6-.2 6.6 2 6.6 5.3 0 3.6-3.1 6.1-6.7 6.1-3.5 0-6-2.3-6-5.3 0-3.3 2.6-5.9 6.1-6.1Z" strokeOpacity=".8" /><path d="M12.4 2.4c5.3.1 9.2 3.6 9 8.6-.2 5.6-4.6 9.9-9.9 9.6C6.6 20.4 2.6 17 2.7 12 2.8 6.6 7 2.3 12.4 2.4Z" strokeOpacity=".55" /></svg>;
/** Frontale : la lampe et son faisceau. */
const Frontale = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="8.5" width="7" height="7" rx="2.2" fill="currentColor" fillOpacity=".25" /><path d="M9.5 10 21 5.5M9.5 14 21 18.5" /><path d="M13 12h7.5" strokeOpacity=".6" /><circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none" /></svg>;
const ICON: Record<Appearance, () => React.JSX.Element> = { light: Sun, dark: Moon, glass: Glass, topo: Topo, frontale: Frontale };

/**
 * Bouton d'apparence : un clic passe à la suivante (Jour → Nuit → Verre → Topo → Frontale). L'icône montre
 * l'apparence actuelle. Tous les boutons de la page restent synchronisés. Le choix direct est dans Compte.
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
