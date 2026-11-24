"use client";

import { useEffect, useState } from "react";
import { switchTheme, THEME_EVENT } from "./liquidTheme";
import { cleanTint, glassPalette, TINT_KEY, type GlassTint } from "./glassPalette";
import { nextSunChange, sunUp } from "@/lib/engine/sun";

/**
 * Apparence du site : Jour (clair), Nuit (sombre), Verre (nuit et verre dépoli), Topo (carte de randonnée)
 * ou Frontale (rouge sur noir, pour courir de nuit).
 * Le choix est gardé dans le navigateur (même clé que l'ancien choix clair / sombre, qui reste valable)
 * et posé avant l'affichage par le script du layout racine.
 *
 * Sur <html> : `data-theme` donne la famille de couleurs (light, dark ou glass) et `data-ap` l'apparence.
 * Topo s'appuie sur le thème clair et Frontale sur le thème sombre : tous leurs réglages s'appliquent, puis
 * modes.css change les couleurs. Rien d'autre à maintenir pour les nouvelles pages.
 *
 * Transitions : chaque changement joue un effet, celui de l'apparence d'arrivée.
 *  - Jour ↔ Nuit : le « liquide versé » d'origine (liquidTheme.ts).
 *  - Vers Verre : une trame de points part du bouton (des points qui grossissent puis se rejoignent), puis
 *    les cartes se givrent.
 *  - Vers Topo : les courbes de niveau se dessinent autour du bouton et la carte se déplie avec elles.
 *  - Vers Frontale : l'écran s'éteint, puis le faisceau d'une lampe frontale balaie depuis le bouton.
 *  - Depuis Verre, Topo ou Frontale vers Jour ou Nuit : l'effet de l'apparence qu'on quitte, à l'envers
 *    (la nouvelle apparence apparaît par le même motif).
 *  - Couleur de fond du mode Verre : fondu de la teinte (variables de couleur animées, voir glass-theme.css).
 *  - Mode automatique (coucher ou lever du soleil) : l'horizon. La nouvelle apparence monte depuis le bas de
 *    l'écran pendant qu'un soleil se couche (ou se lève) derrière.
 *  - Sans transitions de vue, ou si l'appareil demande moins d'animations : changement immédiat.
 */
export type Appearance = "light" | "dark" | "glass" | "topo" | "frontale";
export const APPEARANCES: { id: Appearance; label: string; hint: string }[] = [
  { id: "light", label: "Jour", hint: "Clair, pour l'extérieur en plein soleil" },
  { id: "dark", label: "Nuit", hint: "Sombre, reposant pour les yeux" },
  { id: "glass", label: "Verre", hint: "Nuit étoilée et cartes en verre dépoli" },
  { id: "topo", label: "Topo", hint: "Papier et courbes de niveau, comme une carte de randonnée" },
  { id: "frontale", label: "Frontale", hint: "Rouge sur noir : n'éblouit pas et garde ta vision de nuit" },
];
/** Famille de couleurs de chaque apparence (attribut data-theme). */
export const FAMILY: Record<Appearance, "light" | "dark" | "glass"> = { light: "light", dark: "dark", glass: "glass", topo: "light", frontale: "dark" };
export const APPEARANCE_EVENT = THEME_EVENT;
const KEY = "trail-pilot-theme";

type VTDocument = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };

export const currentAppearance = (): Appearance => {
  const { theme: t, ap } = document.documentElement.dataset;
  if (ap === "topo" && t === "light") return "topo";
  if (ap === "frontale" && t === "dark") return "frontale";
  return t === "light" || t === "glass" ? t : "dark";
};

/** Apparence suivante dans le cycle du bouton : Jour → Nuit → Verre → Topo → Frontale → Jour. */
const CYCLE: Appearance[] = ["light", "dark", "glass", "topo", "frontale"];
export const nextAppearance = (a: Appearance): Appearance => CYCLE[(CYCLE.indexOf(a) + 1) % CYCLE.length];

/** Pose l'apparence sur <html> (famille de couleurs + apparence). */
function paint(a: Appearance) {
  const html = document.documentElement;
  html.dataset.theme = FAMILY[a];
  if (a === "topo" || a === "frontale") html.dataset.ap = a; else delete html.dataset.ap;
}

/** Effet propre à chaque apparence (classe posée sur <html> pendant la transition, voir liquid.css et modes.css). */
const EFFECT: Partial<Record<Appearance, string>> = { glass: "vt-dots", topo: "vt-topo", frontale: "vt-beam" };

/** Courbes de niveau qui se dessinent autour du point de départ (effet Topo), dans leur propre calque de transition. */
function contourOverlay(x: number, y: number) {
  const NS = "http://www.w3.org/2000/svg";
  const box = document.createElement("div");
  box.className = "vt-topo-lines"; box.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${innerWidth} ${innerHeight}`);
  const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  for (let k = 1; k <= 9; k++) {
    // Anneau irrégulier : un cercle déformé par quelques vagues, comme une courbe de niveau autour d'un sommet.
    const r = (R * k) / 8, pts: string[] = [];
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const w = 1 + 0.07 * Math.sin(3 * a + k) + 0.05 * Math.sin(5 * a - k * 0.7) + 0.03 * Math.sin(9 * a + k * 1.3);
      pts.push(`${(x + Math.cos(a) * r * w).toFixed(1)} ${(y + Math.sin(a) * r * w).toFixed(1)}`);
    }
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", `M${pts.join(" L")}Z`);
    p.setAttribute("pathLength", "1");
    p.setAttribute("class", k % 4 === 0 ? "idx" : "");
    p.style.setProperty("--k", String(k));
    svg.appendChild(p);
  }
  box.appendChild(svg);
  return box;
}

/** Mode Verre : une vague de points couleur d'accent court devant la trame (calque à part, voir liquid.css). */
function dotsRing() {
  const box = document.createElement("div");
  box.className = "vt-dots-ring"; box.setAttribute("aria-hidden", "true");
  return box;
}
/** Mode automatique : le soleil qui se couche (ou se lève) derrière l'horizon (voir modes.css). */
function sunOverlay(rise: boolean) {
  const box = document.createElement("div");
  box.className = `vt-sun ${rise ? "is-rise" : "is-set"}`; box.setAttribute("aria-hidden", "true");
  box.appendChild(document.createElement("i"));
  return box;
}

function announce(a: Appearance) {
  try { localStorage.setItem(KEY, a); } catch { /* navigation privée : le choix vaut pour la session */ }
  window.dispatchEvent(new CustomEvent<Appearance>(APPEARANCE_EVENT, { detail: a }));
}

/**
 * Change d'apparence. `from` : l'élément cliqué, d'où part l'animation.
 * Un choix fait à la main coupe le mode automatique ; `auto` : changement décidé par le mode automatique.
 */
export function setAppearance(next: Appearance, from?: HTMLElement | null, opts: { auto?: boolean } = {}) {
  const html = document.documentElement, cur = currentAppearance();
  if (!opts.auto) stopAuto();
  if (cur === next) return;
  // Jour ↔ Nuit : on garde le liquide versé.
  if (from && !opts.auto && ((cur === "light" && next === "dark") || (cur === "dark" && next === "light"))) { switchTheme(from); return; }

  const doc = document as VTDocument;
  announce(next);
  if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { paint(next); return; }
  // Effet de l'apparence d'arrivée ; vers Jour ou Nuit, celui de l'apparence qu'on quitte. Mode automatique : l'horizon.
  const rise = FAMILY[next] === "light";
  const effect = opts.auto ? "vt-horizon" : EFFECT[next] ?? EFFECT[cur] ?? "vt-dots";
  if (opts.auto) html.dataset.sun = rise ? "rise" : "set";
  const r = from?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : innerWidth / 2, y = r ? r.top + r.height / 2 : innerHeight / 2;
  html.style.setProperty("--vt-x", `${x}px`);
  html.style.setProperty("--vt-y", `${y}px`);
  html.classList.add(effect);
  if (next === "glass") html.classList.add("glass-frost");
  let lines: HTMLElement | null = null;
  doc.startViewTransition(() => {
    paint(next);
    if (effect === "vt-topo") lines = contourOverlay(x, y);
    else if (effect === "vt-dots") lines = dotsRing();
    else if (effect === "vt-horizon") lines = sunOverlay(rise);
    if (lines) document.body.appendChild(lines);
  }).finished.catch(() => {}).finally(() => {
    html.classList.remove(effect);
    delete html.dataset.sun;
    lines?.remove();
    window.setTimeout(() => html.classList.remove("glass-frost"), 1400);
  });
}

/** Teinte du mode Verre gardée dans ce navigateur. */
export function currentTint(): GlassTint {
  try { return cleanTint(JSON.parse(localStorage.getItem(TINT_KEY) ?? "null")); } catch { return cleanTint(null); }
}

/**
 * Choisit la couleur de fond du mode Verre. La palette est posée sur <html> (le script du layout la repose
 * avant l'affichage aux visites suivantes) ; si une autre apparence est active, on passe en mode Verre.
 */
export function setTint(tint: GlassTint, from?: HTMLElement | null) {
  const t = cleanTint(tint), p = glassPalette(t), html = document.documentElement;
  for (const [k, v] of Object.entries(p)) html.style.setProperty(k, v);
  try { localStorage.setItem(TINT_KEY, JSON.stringify({ ...t, p })); } catch { /* navigation privée */ }
  window.dispatchEvent(new CustomEvent<GlassTint>(TINT_EVENT, { detail: t }));
  if (currentAppearance() !== "glass") setAppearance("glass", from);
}
export const TINT_EVENT = "tp-tint";

/** Apparence active, suivie en direct (null avant le premier rendu côté navigateur). */
export function useAppearance(): Appearance | null {
  const [a, setA] = useState<Appearance | null>(null);
  useEffect(() => {
    setA(currentAppearance());
    const on = (e: Event) => setA((e as CustomEvent<Appearance>).detail);
    window.addEventListener(APPEARANCE_EVENT, on);
    return () => window.removeEventListener(APPEARANCE_EVENT, on);
  }, []);
  return a;
}

// ---------- Mode automatique ----------
/**
 * Jour le jour, Nuit (ou Verre, ou Frontale) après le coucher du soleil. Avec une position enregistrée sur cet
 * appareil (arrondie à environ 10 km, jamais envoyée au serveur), on suit le vrai soleil ; sans elle, le réglage
 * clair ou sombre du téléphone. Le script du layout applique le bon choix avant l'affichage ; AutoAppearance
 * bascule en direct quand le soleil se couche ou se lève, l'appli ouverte.
 */
export type DayAp = "light" | "topo";
export type NightAp = "dark" | "glass" | "frontale";
export interface AutoPref { day: DayAp; night: NightAp; lat?: number; lon?: number }
export const AUTO_KEY = "trail-pilot-auto";
export const AUTO_EVENT = "tp-auto";
const DAY_APS: DayAp[] = ["light", "topo"], NIGHT_APS: NightAp[] = ["dark", "glass", "frontale"];

export function getAuto(): AutoPref | null {
  try {
    const p = JSON.parse(localStorage.getItem(AUTO_KEY) ?? "null") as AutoPref | null;
    if (!p || !DAY_APS.includes(p.day) || !NIGHT_APS.includes(p.night)) return null;
    const geo = typeof p.lat === "number" && typeof p.lon === "number" && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
    return { day: p.day, night: p.night, ...(geo ? { lat: p.lat, lon: p.lon } : {}) };
  } catch { return null; }
}
function stopAuto() {
  try { if (localStorage.getItem(AUTO_KEY) == null) return; localStorage.removeItem(AUTO_KEY); } catch { return; }
  window.dispatchEvent(new CustomEvent<AutoPref | null>(AUTO_EVENT, { detail: null }));
}
/** Apparence voulue maintenant par le mode automatique. */
export function autoTarget(p: AutoPref, t = Date.now()): Appearance {
  const day = p.lat != null && p.lon != null ? sunUp(t, p.lat, p.lon) : !window.matchMedia("(prefers-color-scheme: dark)").matches;
  return day ? p.day : p.night;
}
/** Prochain lever ou coucher (seulement avec une position). */
export const autoNext = (p: AutoPref) => (p.lat != null && p.lon != null ? nextSunChange(Date.now(), p.lat, p.lon) : null);

/** Active (ou règle) le mode automatique, et applique tout de suite l'apparence du moment ; null le coupe. */
export function setAuto(p: AutoPref | null) {
  if (!p) { stopAuto(); return; }
  try { localStorage.setItem(AUTO_KEY, JSON.stringify(p)); } catch { /* navigation privée */ }
  window.dispatchEvent(new CustomEvent<AutoPref | null>(AUTO_EVENT, { detail: p }));
  setAppearance(autoTarget(p), null, { auto: true });
}
/** Réglage du mode automatique, suivi en direct. */
export function useAuto(): AutoPref | null | undefined {
  const [p, setP] = useState<AutoPref | null | undefined>(undefined);
  useEffect(() => {
    setP(getAuto());
    const on = (e: Event) => setP((e as CustomEvent<AutoPref | null>).detail);
    window.addEventListener(AUTO_EVENT, on);
    return () => window.removeEventListener(AUTO_EVENT, on);
  }, []);
  return p;
}
