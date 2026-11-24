"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { motionOk } from "./motion";
import { getPick, PANEL_EVENT, PICK_EVENT, setPick, type Panel, type PanelDetail, type PickState } from "./panel";
import type { Ctx, Tab } from "./AppShell";
import RunFiche from "./RunFiche";
import RaceFiche from "./RaceFiche";
import Compare from "./Compare";
import Recap from "./Recap";

type VTDoc = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void>; ready?: Promise<void>; updateCallbackDone?: Promise<void> } };

/** Ce que reçoit chaque fiche : fermer, passer à une autre fiche (depuis un élément), le contexte de l'appli. */
export interface PanelProps extends Pick<Ctx, "toast" | "refresh" | "me"> {
  close: () => void;
  swap: (p: Panel, from?: HTMLElement | null) => void;
  go: (t: Tab) => void;
}

const visible = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight; };

/**
 * Hôte des fiches plein écran. L'élément touché s'agrandit jusqu'à la fiche (le même nom de transition
 * passe de l'un à l'autre le temps de l'animation), et la fiche se replie sur lui à la fermeture ; sans
 * élément d'origine, elle monte du bas de l'écran. Le bouton retour du téléphone, Échap, un toucher à côté
 * ou un glissé vers le bas de la poignée la ferment. Affiche aussi la barre du mode « comparer ».
 */
export default function Panels({ ctx }: { ctx: Pick<Ctx, "toast" | "refresh" | "me" | "go"> }) {
  const [panel, setPanel] = useState<{ p: Panel; k: number; vt: boolean } | null>(null);
  const origin = useRef<{ el: HTMLElement; name: string } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  openRef.current = !!panel;

  /** Donne le nom de transition partagé à un élément, en gardant le sien pour le lui rendre ensuite. */
  const name = (el: HTMLElement | null | undefined, on: boolean, keep?: string) => { if (el) el.style.viewTransitionName = on ? "tp-panel" : keep ?? ""; };

  const show = useCallback((p: Panel | null, from?: HTMLElement | null) => {
    const d = document as VTDoc, html = document.documentElement;
    const opening = !!p && !openRef.current, closing = !p && openRef.current;
    const k = Date.now();
    if (!d.startViewTransition || !motionOk()) {
      if (opening && from) origin.current = { el: from, name: from.style.viewTransitionName };
      setPanel(p ? { p, k, vt: false } : null);
      if (closing) { origin.current = null; window.dispatchEvent(new CustomEvent("tp-panel-closed")); }
      return;
    }
    html.dataset.vt = opening ? "panel-open" : closing ? "panel-close" : "panel-swap";
    let o = origin.current;
    if (opening) { o = from ? { el: from, name: from.style.viewTransitionName } : null; origin.current = o; name(o?.el, true); }
    else name(card.current, true);
    const t = d.startViewTransition(() => {
      if (opening) name(o?.el, false, o?.name);
      flushSync(() => setPanel(p ? { p, k, vt: true } : null));
      if (p) name(card.current, true);
      else if (o?.el.isConnected && visible(o.el)) name(o.el, true);
    });
    t.ready?.catch(() => {});
    t.updateCallbackDone?.catch(() => {});
    t.finished.catch(() => {}).finally(() => {
      name(card.current, false);
      if (closing && o) { name(o.el, false, o.name); origin.current = null; }
      if (closing) window.dispatchEvent(new CustomEvent("tp-panel-closed"));
      if (html.dataset.vt?.startsWith("panel")) delete html.dataset.vt;
    });
  }, []);

  // Ouverture, remplacement et fermeture ; le retour du téléphone ferme la fiche.
  useEffect(() => {
    const on = (e: Event) => {
      const { panel: p, from } = (e as CustomEvent<PanelDetail>).detail;
      if (!p) { if (window.history.state?.tpPanel) window.history.back(); else show(null); return; }
      if (!openRef.current) window.history.pushState({ ...(window.history.state ?? {}), tpPanel: true }, "");
      show(p, from);
    };
    const pop = () => { if (openRef.current) show(null); };
    window.addEventListener(PANEL_EVENT, on);
    window.addEventListener("popstate", pop);
    return () => { window.removeEventListener(PANEL_EVENT, on); window.removeEventListener("popstate", pop); };
  }, [show]);

  const close = useCallback(() => { if (window.history.state?.tpPanel) window.history.back(); else show(null); }, [show]);
  const swap = useCallback((p: Panel, from?: HTMLElement | null) => show(p, from), [show]);

  useEffect(() => {
    if (!panel) return;
    document.documentElement.classList.add("has-panel");
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) close(); };
    window.addEventListener("keydown", esc);
    // Le focus entre dans la fiche ; il revient sur l'élément d'origine à la fermeture.
    const back = document.activeElement as HTMLElement | null;
    window.setTimeout(() => card.current?.querySelector<HTMLElement>(".panel-x")?.focus({ preventScroll: true }), 60);
    // Points et chiffres de la fiche : ils s'animent dès qu'ils apparaissent (et le restent quand React réécrit leur classe).
    const mark = () => card.current?.querySelectorAll(".dotprofile:not(.is-in), .reveal:not(.is-in)").forEach((el) => el.classList.add("is-in"));
    const t = window.setTimeout(mark, 120);
    const mo = new MutationObserver(mark);
    if (card.current) mo.observe(card.current, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => { document.documentElement.classList.remove("has-panel"); window.removeEventListener("keydown", esc); window.clearTimeout(t); mo.disconnect(); back?.focus?.({ preventScroll: true }); };
  }, [panel, close]);

  // ---------- Mode « comparer » : barre au-dessus de la barre du bas ----------
  const [pick, setPickState] = useState<PickState>(getPick());
  useEffect(() => { const on = (e: Event) => setPickState((e as CustomEvent<PickState>).detail); window.addEventListener(PICK_EVENT, on); return () => window.removeEventListener(PICK_EVENT, on); }, []);
  useEffect(() => { document.documentElement.classList.toggle("is-picking", pick.on); }, [pick.on]);

  const props: PanelProps = { ...ctx, close, swap };
  const p = panel?.p;
  return (
    <>
      {pick.on && (
        <div className="pick-bar" role="status">
          <span className="pick-dots" aria-hidden="true">{[0, 1].map((i) => <i key={i} className={pick.ids.length > i ? "on" : ""} />)}</span>
          <span className="pick-txt">{pick.ids.length === 0 ? "Choisis 2 sorties à comparer" : pick.ids.length === 1 ? "Choisis-en une deuxième" : "Comparaison…"}</span>
          <button type="button" className="link small" onClick={() => setPick({ on: false, ids: [] })}>Annuler</button>
        </div>
      )}
      {p && (
        <div className="panel-back" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div ref={card} key={panel.k} className={`panel card panel-${p.kind}${panel.vt ? " no-in" : ""}`} role="dialog" aria-modal="true" aria-labelledby="panel-title">
            <div className="sheet-grab" aria-hidden="true" />
            {p.kind === "run" && <RunFiche {...props} id={p.id} initial={p.initial} />}
            {p.kind === "race" && <RaceFiche {...props} raceKey={p.key} date={p.date} />}
            {p.kind === "compare" && <Compare {...props} a={p.a} b={p.b} />}
            {p.kind === "recap" && <Recap {...props} month={p.month} />}
          </div>
        </div>
      )}
    </>
  );
}
