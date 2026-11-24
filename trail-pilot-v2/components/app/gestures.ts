"use client";

import { useEffect, type RefObject } from "react";
import { SWIPE_EVENT } from "./BottomNav";
import { haptic } from "@/components/haptics";

const motionOk = () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const phone = () => window.matchMedia("(max-width: 900px)").matches;

/** Zones où un geste horizontal ou vertical appartient déjà à l'élément (cartes, graphiques, curseurs, fenêtres…). */
const OWN_GESTURE = "input, textarea, select, [contenteditable], .maplibregl-map, .leaflet-container, .tmap, .gc-plot, svg.chart, .dotprofile, .dotgrid, .radar-card, .sheet-back, .panel-back, .pal-back, .bnav, .pick-bar, [data-noswipe]";
function ownsGesture(t: EventTarget | null, axis: "x" | "y") {
  if (!(t instanceof Element)) return true;
  if (t.closest(OWN_GESTURE)) return true;
  // Un bloc qui défile lui-même dans ce sens (liste horizontale, tableau large, fenêtre défilante).
  for (let el: Element | null = t; el && el !== document.body; el = el.parentElement) {
    const st = getComputedStyle(el);
    if (axis === "x" && /(auto|scroll)/.test(st.overflowX) && el.scrollWidth > el.clientWidth + 2) return true;
    if (axis === "y" && el !== document.documentElement && /(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 2 && el.scrollTop > 0) return true;
  }
  return false;
}
const swipe = (p: number | null) => window.dispatchEvent(new CustomEvent(SWIPE_EVENT, { detail: { p } }));

/**
 * Balayer la page vers la gauche ou la droite (au doigt) passe à la section voisine de la barre du bas.
 * La page suit un peu le doigt et le fond actif de la barre glisse vers la section visée ; au relâché, on change
 * d'onglet si le geste est assez long ou assez vif, sinon tout revient en place.
 */
export function useSwipeTabs(main: RefObject<HTMLElement | null>, order: string[], current: () => string, go: (id: string) => void) {
  useEffect(() => {
    const el = main.current;
    if (!el) return;
    let g: { id: number; x: number; y: number; t: number; axis: "x" | "y" | null; dx: number; view: HTMLElement | null } | null = null;
    const reset = (animate: boolean) => {
      const v = g?.view;
      if (v) {
        if (animate && motionOk()) {
          v.style.transition = "transform .32s cubic-bezier(.3, 1.3, .5, 1), opacity .25s ease";
          window.setTimeout(() => { v.style.transition = ""; }, 340);
        }
        v.style.transform = ""; v.style.opacity = "";
      }
      swipe(null);
      g = null;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !e.isPrimary || !phone() || ownsGesture(e.target, "x")) return;
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), axis: null, dx: 0, view: el.querySelector<HTMLElement>(".view") };
    };
    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.axis) {
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) g.axis = "x";
        else if (Math.abs(dy) > 10) { g = null; return; }
        else return;
      }
      const at = order.indexOf(current()), next = at + (dx < 0 ? 1 : -1);
      const edge = next < 0 || next >= order.length;
      // Au bout de la barre : la page résiste.
      g.dx = edge ? dx * 0.18 : dx;
      const w = el.clientWidth || window.innerWidth;
      if (g.view && motionOk()) { g.view.style.transform = `translateX(${(g.dx * 0.32).toFixed(1)}px)`; g.view.style.opacity = String(1 - Math.min(0.35, Math.abs(g.dx) / w * 0.6)); }
      swipe(edge ? null : Math.max(-1, Math.min(1, -dx / (w * 0.55))));
    };
    const up = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      if (g.axis !== "x") { g = null; return; }
      const dt = Math.max(1, performance.now() - g.t), v = Math.abs(g.dx) / dt;
      const at = order.indexOf(current()), next = at + (g.dx < 0 ? 1 : -1);
      if (next >= 0 && next < order.length && (Math.abs(g.dx) > 70 || (v > 0.45 && Math.abs(g.dx) > 30))) {
        swipe(null); g = null;
        go(order[next]);
        haptic("tap");
      } else reset(true);
    };
    const cancel = (e: PointerEvent) => { if (g && e.pointerId === g.id) reset(true); };
    el.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    window.addEventListener("pointercancel", cancel, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [main, order, current, go]);
}

/**
 * Fenêtres du bas (.sheet) : on les ferme en les faisant glisser vers le bas par leur poignée (.sheet-grab).
 * Au-delà de 110 px (ou d'un geste vif), la fenêtre part vers le bas et se ferme comme un toucher à côté ;
 * sinon elle revient en place.
 */
export function useSheetDrag() {
  useEffect(() => {
    let g: { id: number; y: number; t: number; dy: number; sheet: HTMLElement; back: HTMLElement; grab: HTMLElement } | null = null;
    const down = (e: PointerEvent) => {
      const grab = e.target instanceof Element ? e.target.closest<HTMLElement>(".sheet-grab") : null;
      // Fenêtres du bas (.sheet) et fiches plein écran (.panel) : même geste.
      const sheet = grab?.closest<HTMLElement>(".sheet, .panel"), back = sheet?.closest<HTMLElement>(".sheet-back, .panel-back");
      if (!grab || !sheet || !back) return;
      grab.setPointerCapture?.(e.pointerId);
      sheet.style.transition = "none";
      g = { id: e.pointerId, y: e.clientY, t: performance.now(), dy: 0, sheet, back, grab };
    };
    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const dy = e.clientY - g.y;
      g.dy = dy > 0 ? dy : dy * 0.15;
      g.sheet.style.transform = `translateY(${g.dy.toFixed(1)}px)`;
      g.back.style.setProperty("--sheet-drag", String(Math.max(0, Math.min(1, g.dy / 300))));
    };
    const up = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const { sheet, back, dy, t } = g;
      g = null;
      const v = dy / Math.max(1, performance.now() - t);
      if (dy > 110 || (v > 0.6 && dy > 30)) {
        sheet.style.transition = motionOk() ? "transform .24s cubic-bezier(.4, 0, 1, 1)" : "none";
        sheet.style.transform = "translateY(105%)";
        haptic("tap");
        window.setTimeout(() => back.dispatchEvent(new MouseEvent("click", { bubbles: true })), motionOk() ? 200 : 0);
      } else {
        sheet.style.transition = motionOk() ? "transform .35s cubic-bezier(.3, 1.4, .5, 1)" : "none";
        sheet.style.transform = "";
        back.style.removeProperty("--sheet-drag");
      }
    };
    document.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);
}

/** Geste « tirer pour actualiser » (en haut de page, au doigt) : distance tirée et relâché. */
export function usePull(onChange: (px: number) => void, onRelease: (px: number) => void) {
  useEffect(() => {
    let g: { y: number; x: number; px: number; on: boolean } | null = null;
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1 || window.scrollY > 0 || !phone() || ownsGesture(e.target, "y") || document.querySelector(".sheet-back, .panel-back, .pal-back")) return;
      g = { y: e.touches[0].clientY, x: e.touches[0].clientX, px: 0, on: false };
    };
    const move = (e: TouchEvent) => {
      if (!g) return;
      const dy = e.touches[0].clientY - g.y, dx = e.touches[0].clientX - g.x;
      if (!g.on) {
        if (dy > 8 && dy > Math.abs(dx) * 1.2 && window.scrollY <= 0) g.on = true;
        else if (Math.abs(dx) > 10 || dy < -6) { g = null; return; }
        else return;
      }
      // Résistance croissante : on tire de moins en moins vite.
      g.px = Math.max(0, Math.min(130, dy * 0.5));
      onChange(g.px);
    };
    const end = () => { if (g?.on) onRelease(g.px); g = null; };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end, { passive: true });
    window.addEventListener("touchcancel", end, { passive: true });
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, [onChange, onRelease]);
}
