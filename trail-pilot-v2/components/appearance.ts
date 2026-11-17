"use client";

import { switchTheme, THEME_EVENT } from "./liquidTheme";

/**
 * Apparence du site : Jour (clair), Nuit (sombre) ou Verre (nuit et verre dépoli).
 * Le choix est gardé dans le navigateur (même clé que l'ancien choix clair / sombre, qui reste valable)
 * et posé avant l'affichage par le script du layout racine.
 *
 * Transitions
 *  - Jour ↔ Nuit : le « liquide versé » d'origine (liquidTheme.ts).
 *  - Vers ou depuis Verre : la nouvelle apparence se révèle en cercle depuis le bouton cliqué.
 *  - Sans transitions de vue, ou si l'appareil demande moins d'animations : changement immédiat.
 */
export type Appearance = "light" | "dark" | "glass";
export const APPEARANCES: { id: Appearance; label: string; hint: string }[] = [
  { id: "light", label: "Jour", hint: "Clair, pour l'extérieur en plein soleil" },
  { id: "dark", label: "Nuit", hint: "Sombre, reposant pour les yeux" },
  { id: "glass", label: "Verre", hint: "Nuit étoilée et cartes en verre dépoli" },
];
export const APPEARANCE_EVENT = THEME_EVENT;
const KEY = "trail-pilot-theme";

type VTDocument = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };

export const currentAppearance = (): Appearance => {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "glass" ? t : "dark";
};

/** Apparence suivante dans le cycle du bouton : Jour → Nuit → Verre → Jour. */
export const nextAppearance = (a: Appearance): Appearance => (a === "light" ? "dark" : a === "dark" ? "glass" : "light");

function announce(a: Appearance) {
  try { localStorage.setItem(KEY, a); } catch { /* navigation privée : le choix vaut pour la session */ }
  window.dispatchEvent(new CustomEvent<Appearance>(APPEARANCE_EVENT, { detail: a }));
}

/** Change d'apparence. `from` : l'élément cliqué, d'où part l'animation. */
export function setAppearance(next: Appearance, from?: HTMLElement | null) {
  const html = document.documentElement, cur = currentAppearance();
  if (cur === next) return;
  // Jour ↔ Nuit : on garde le liquide versé.
  if (from && ((cur === "light" && next === "dark") || (cur === "dark" && next === "light"))) { switchTheme(from); return; }

  const doc = document as VTDocument;
  const apply = () => { html.dataset.theme = next; };
  announce(next);
  if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { apply(); return; }
  // Révélation circulaire depuis le bouton (ou depuis le centre de l'écran).
  const r = from?.getBoundingClientRect();
  html.style.setProperty("--vt-x", `${r ? r.left + r.width / 2 : innerWidth / 2}px`);
  html.style.setProperty("--vt-y", `${r ? r.top + r.height / 2 : innerHeight / 2}px`);
  html.classList.add("vt-reveal");
  doc.startViewTransition(apply).finished.catch(() => {}).finally(() => html.classList.remove("vt-reveal"));
}
