"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { motionOk, REVEAL } from "./motion";

/**
 * Fiches plein écran, ouvrables depuis n'importe quel écran (séance, check-in, coach, sortie, course…).
 *
 * - L'élément touché « devient » la fiche : le même nom de transition passe de l'un à l'autre le temps de
 *   l'animation (transition d'élément partagé), et la fiche se replie sur lui à la fermeture. Sans élément
 *   d'origine, elle monte du bas de l'écran.
 * - Chaque fiche ouverte ajoute une entrée d'historique (profondeur dans `history.state.tpPanel`) : le bouton
 *   retour du téléphone ferme la fiche du dessus, et seulement elle. Les fiches peuvent s'empiler (une sortie
 *   ouverte depuis une séance) ; la plus récente est au-dessus.
 * - Échap, un toucher à côté ou un glissé vers le bas de la poignée la ferment aussi.
 * Le contenu reste rendu par l'écran qui l'ouvre (il garde son état et ses actions à jour).
 */
type VTDoc = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void>; ready?: Promise<void>; updateCallbackDone?: Promise<void> } };

const visible = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight; };
/** Profondeur de fiches dans l'entrée d'historique courante (0 : aucune). */
export const ficheDepth = () => (typeof window !== "undefined" && typeof window.history.state?.tpPanel === "number" ? (window.history.state.tpPanel as number) : 0);
/** Fiches ouvertes, de la plus ancienne à la plus récente (pour Échap et le défilement de la page). */
const stack: number[] = [];

export interface FicheCtl<T> {
  value: T | null; k: number; vt: boolean; depth: number;
  /** Ouvre la fiche depuis `from` (ou remplace son contenu si elle est déjà ouverte). */
  open: (v: T, from?: HTMLElement | null) => void;
  close: () => void;
  card: React.RefObject<HTMLDivElement | null>;
}

export function useFiche<T>(): FicheCtl<T> {
  const [st, setSt] = useState<{ v: T; k: number; vt: boolean; depth: number } | null>(null);
  const origin = useRef<{ el: HTMLElement; name: string } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const cur = useRef(st);
  cur.current = st;
  const name = (el: HTMLElement | null | undefined, on: boolean, keep?: string) => { if (el) el.style.viewTransitionName = on ? "tp-panel" : keep ?? ""; };

  const show = useCallback((v: T | null, from?: HTMLElement | null, depth = 0) => {
    const d = document as VTDoc, html = document.documentElement;
    const was = cur.current;
    const opening = v != null && !was, closing = v == null && !!was;
    if (v == null && !was) return;
    const next = v == null ? null : { v, k: Date.now() + Math.random(), vt: false, depth: was?.depth ?? depth };
    const done = () => { if (closing) window.dispatchEvent(new CustomEvent("tp-panel-closed")); };
    if (!d.startViewTransition || !motionOk()) {
      if (opening && from) origin.current = { el: from, name: from.style.viewTransitionName };
      setSt(next);
      if (closing) origin.current = null;
      done();
      return;
    }
    html.dataset.vt = opening ? "panel-open" : closing ? "panel-close" : "panel-swap";
    let o = origin.current;
    if (opening) { o = from ? { el: from, name: from.style.viewTransitionName } : null; origin.current = o; name(o?.el, true); }
    else name(card.current, true);
    const t = d.startViewTransition(() => {
      if (opening) name(o?.el, false, o?.name);
      flushSync(() => setSt(next ? { ...next, vt: true } : null));
      if (next) name(card.current, true);
      else if (o?.el.isConnected && visible(o.el)) name(o.el, true);
    });
    t.ready?.catch(() => {});
    t.updateCallbackDone?.catch(() => {});
    t.finished.catch(() => {}).finally(() => {
      name(card.current, false);
      if (closing && o) { name(o.el, false, o.name); origin.current = null; }
      if (html.dataset.vt?.startsWith("panel")) delete html.dataset.vt;
      done();
    });
  }, []);

  const open = useCallback((v: T, from?: HTMLElement | null) => {
    if (cur.current) { show(v, from); return; }
    const depth = ficheDepth() + 1;
    window.history.pushState({ ...(window.history.state ?? {}), tpPanel: depth }, "");
    show(v, from, depth);
  }, [show]);
  const close = useCallback(() => {
    const s = cur.current;
    if (!s) return;
    if (ficheDepth() === s.depth) window.history.back(); else show(null);
  }, [show]);

  // Retour du téléphone : ferme la fiche si son entrée d'historique a été quittée.
  const depth = st?.depth ?? 0;
  useEffect(() => {
    if (!depth) return;
    const pop = () => { if (ficheDepth() < depth) show(null); };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [depth, show]);
  // Écran quitté avec la fiche ouverte (changement d'onglet) : on la referme sans animation.
  // Fiche démontée alors qu'elle est ouverte : on retire aussi son entrée d'historique (le retour ne doit pas « tomber dans le vide »).
  useEffect(() => () => { const s = cur.current; if (s) { origin.current = null; if (s.depth && ficheDepth() === s.depth) window.history.back(); } }, []);

  return { value: st?.v ?? null, k: st?.k ?? 0, vt: st?.vt ?? false, depth, open, close, card };
}

/** Rendu d'une fiche ouverte par `useFiche` (dans <body>, au-dessus de tout le reste). */
export function Fiche<T>({ ctl, kind, children }: { ctl: FicheCtl<T>; kind: string; children: React.ReactNode }) {
  const on = ctl.value != null, depth = ctl.depth, close = ctl.close;
  useEffect(() => {
    if (!on) return;
    stack.push(depth);
    document.documentElement.classList.add("has-panel");
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented && stack[stack.length - 1] === depth) { e.preventDefault(); close(); } };
    window.addEventListener("keydown", esc);
    const back = document.activeElement as HTMLElement | null;
    const card = ctl.card.current;
    // Titre de la fiche (identifiant unique, même avec des fiches empilées) et focus sur le bouton de fermeture.
    const title = () => { const h = card?.querySelector<HTMLElement>(".panel-title"); if (h && card) { h.id = `fiche-t-${depth}`; card.setAttribute("aria-labelledby", h.id); } };
    const t0 = window.setTimeout(() => { title(); card?.querySelector<HTMLElement>(".panel-x")?.focus({ preventScroll: true }); }, 60);
    // Points et chiffres : ils s'animent dès qu'ils apparaissent (et le restent quand React réécrit leur classe).
    // Graphiques, jauges, barres : dans une fiche ils sont à l'écran dès l'ouverture, ils se dessinent tout de suite.
    const mark = () => { title(); card?.querySelectorAll(`${REVEAL}, .reveal`).forEach((el) => { if (!el.classList.contains("is-in")) el.classList.add("is-in"); }); };
    const t1 = window.setTimeout(mark, 120);
    const mo = new MutationObserver(mark);
    if (card) mo.observe(card, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => {
      const i = stack.lastIndexOf(depth); if (i >= 0) stack.splice(i, 1);
      if (!stack.length) document.documentElement.classList.remove("has-panel");
      window.removeEventListener("keydown", esc); window.clearTimeout(t0); window.clearTimeout(t1); mo.disconnect();
      if (back?.isConnected) back.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, depth, ctl.k]);
  if (!on || typeof document === "undefined") return null;
  return createPortal(
    <div className="panel-back" style={{ zIndex: 90 + depth }} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={ctl.card} key={ctl.k} className={`panel card panel-${kind}${ctl.vt ? " no-in" : ""}`} role="dialog" aria-modal="true">
        <div className="sheet-grab" aria-hidden="true" />
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** En-tête standard d'une fiche : surtitre, bouton de fermeture, titre et pastilles. */
export function FicheHead({ eyebrow, title, chips, onClose, closeLabel = "Fermer la fiche" }: { eyebrow?: React.ReactNode; title: React.ReactNode; chips?: React.ReactNode; onClose: () => void; closeLabel?: string }) {
  return (
    <header className="panel-head">
      <div className="panel-bar">
        <span className="eyebrow">{eyebrow}</span>
        <button type="button" className="iconbtn panel-x" aria-label={closeLabel} onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <h2 className="panel-title">{title}</h2>
      {chips && <div className="row panel-chips">{chips}</div>}
    </header>
  );
}
