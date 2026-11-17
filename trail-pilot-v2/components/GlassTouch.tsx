"use client";

import { useEffect } from "react";

/** Surfaces en verre qui captent la lumière (voir glass-theme.css, « Interaction »). */
const SURF = ".card, .kpi, .glass, .vo2-races > div, .session, .race-time, .auth-card, .free-card";
/** Éléments qui réagissent au toucher par un éclat de points. */
const TAP = "button, a[href], [role=button], [role=slider], label, summary, .gc-plot, svg.chart, .tint-sw";

/**
 * Interaction du mode Verre, sur tout le site :
 *  - la carte sous le doigt ou la souris capte la lumière (reflet qui suit le pointeur) ;
 *  - un toucher sur un élément actif fait éclater un petit anneau de points (le motif du mode Verre).
 * Ne fait rien dans les autres apparences ; sans animation si l'appareil demande moins de mouvement (reflet seul).
 */
export default function GlassTouch() {
  useEffect(() => {
    const html = document.documentElement;
    const glass = () => html.dataset.theme === "glass";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lit: HTMLElement | null = null, last: PointerEvent | null = null, raf = 0, off = 0;

    const clear = () => { lit?.classList.remove("is-lit"); lit = null; };
    const paint = () => {
      raf = 0;
      if (!last) return;
      const t = (last.target instanceof Element ? last.target.closest<HTMLElement>(SURF) : null);
      if (lit && lit !== t) lit.classList.remove("is-lit");
      lit = t;
      if (!t) return;
      const r = t.getBoundingClientRect();
      t.style.setProperty("--mx", `${(last.clientX - r.left).toFixed(0)}px`);
      t.style.setProperty("--my", `${(last.clientY - r.top).toFixed(0)}px`);
      t.classList.add("is-lit");
    };
    const move = (e: PointerEvent) => {
      if (!glass()) { if (lit) clear(); return; }
      last = e;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const burst = (x: number, y: number) => {
      const b = document.createElement("span");
      b.className = "tap-dots"; b.setAttribute("aria-hidden", "true");
      b.style.left = `${x}px`; b.style.top = `${y}px`;
      for (let i = 0; i < 10; i++) { const d = document.createElement("i"); d.style.setProperty("--a", `${i * 36}deg`); b.appendChild(d); }
      document.body.appendChild(b);
      window.setTimeout(() => b.remove(), 700);
    };
    const down = (e: PointerEvent) => {
      if (!glass()) return;
      move(e);
      window.clearTimeout(off);
      if (reduce.matches || e.button > 0) return;
      if (e.target instanceof Element && e.target.closest(TAP)) burst(e.clientX, e.clientY);
    };
    // Au doigt, la lumière s'éteint peu après qu'on a levé le doigt.
    const up = (e: PointerEvent) => { if (e.pointerType !== "mouse") off = window.setTimeout(clear, 450); };

    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerdown", down, { passive: true });
    document.addEventListener("pointerup", up, { passive: true });
    document.addEventListener("pointerleave", clear);
    window.addEventListener("blur", clear);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointerleave", clear);
      window.removeEventListener("blur", clear);
      cancelAnimationFrame(raf); window.clearTimeout(off);
    };
  }, []);
  return null;
}
