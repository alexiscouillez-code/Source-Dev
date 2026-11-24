"use client";

import { useEffect, useMemo, useState } from "react";
import { getPick, PANEL_EVENT, PICK_EVENT, setPick, type Panel, type PanelDetail, type PickState } from "./panel";
import type { Ctx, Tab } from "./AppShell";
import { Fiche, useFiche } from "./Fiche";
import RunFiche from "./RunFiche";
import RaceFiche from "./RaceFiche";
import Compare from "./Compare";
import Recap from "./Recap";
import ComparePicker from "./ComparePicker";

/** Ce que reçoit chaque fiche : fermer, passer à une autre fiche (depuis un élément), le contexte de l'appli. */
export interface PanelProps extends Pick<Ctx, "toast" | "refresh" | "me"> {
  close: () => void;
  swap: (p: Panel, from?: HTMLElement | null) => void;
  go: (t: Tab) => void;
}

/**
 * Fiches ouvertes par événement (openPanel) depuis n'importe quel écran : sortie, course, comparaison, choix
 * des sorties à comparer, bilan du mois. Voir Fiche.tsx pour l'animation et le retour du téléphone.
 * Affiche aussi la barre du mode « comparer » (choix de deux courses dans Mes courses).
 */
export default function Panels({ ctx }: { ctx: Pick<Ctx, "toast" | "refresh" | "me" | "go"> }) {
  const f = useFiche<Panel>();
  const { open, close } = f;
  useEffect(() => {
    const on = (e: Event) => { const { panel: p, from } = (e as CustomEvent<PanelDetail>).detail; if (p) open(p, from); else close(); };
    window.addEventListener(PANEL_EVENT, on);
    return () => window.removeEventListener(PANEL_EVENT, on);
  }, [open, close]);

  const [pick, setPickState] = useState<PickState>(getPick());
  useEffect(() => { const on = (e: Event) => setPickState((e as CustomEvent<PickState>).detail); window.addEventListener(PICK_EVENT, on); return () => window.removeEventListener(PICK_EVENT, on); }, []);
  useEffect(() => { document.documentElement.classList.toggle("is-picking", pick.on); }, [pick.on]);

  const props: PanelProps = useMemo(() => ({ ...ctx, close, swap: open }), [ctx, close, open]);
  const p = f.value;
  return (
    <>
      {pick.on && (
        <div className="pick-bar" role="status">
          <span className="pick-dots" aria-hidden="true">{[0, 1].map((i) => <i key={i} className={pick.ids.length > i ? "on" : ""} />)}</span>
          <span className="pick-txt">{pick.ids.length === 0 ? "Choisis 2 courses à comparer" : pick.ids.length === 1 ? "Choisis-en une deuxième" : "Comparaison…"}</span>
          <button type="button" className="link small" onClick={() => setPick({ on: false, ids: [] })}>Annuler</button>
        </div>
      )}
      <Fiche ctl={f} kind={p?.kind ?? "run"}>
        {p?.kind === "run" && <RunFiche {...props} id={p.id} initial={p.initial} />}
        {p?.kind === "race" && <RaceFiche {...props} raceKey={p.key} date={p.date} />}
        {p?.kind === "compare" && <Compare {...props} a={p.a} b={p.b} />}
        {p?.kind === "pick" && <ComparePicker {...props} first={p.first} keep={p.keep} />}
        {p?.kind === "recap" && <Recap {...props} month={p.month} />}
      </Fiche>
    </>
  );
}
