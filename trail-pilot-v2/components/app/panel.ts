"use client";

import type { Activity } from "./client";

/**
 * Fiches plein écran (sortie, course, comparaison, bilan du mois), ouvertes depuis n'importe quel écran.
 * L'élément touché « devient » la fiche : il s'agrandit jusqu'à elle (transition d'élément partagé), et la fiche
 * se replie sur lui à la fermeture. Le bouton retour du téléphone ferme la fiche.
 */
export type Panel =
  | { kind: "run"; id: number; initial?: Partial<Activity> }
  | { kind: "race"; key?: string; date?: string }
  | { kind: "compare"; a: number; b: number }
  | { kind: "recap"; month?: string };

export const PANEL_EVENT = "tp-panel";
export interface PanelDetail { panel: Panel | null; from?: HTMLElement | null }

export function openPanel(panel: Panel, from?: HTMLElement | null) {
  window.dispatchEvent(new CustomEvent<PanelDetail>(PANEL_EVENT, { detail: { panel, from } }));
}
export function closePanel() {
  window.dispatchEvent(new CustomEvent<PanelDetail>(PANEL_EVENT, { detail: { panel: null } }));
}

// ---------- Sélection pour comparer ----------
/** Mode « comparer » : on choisit deux sorties (dans Séances ou Mes courses), puis la comparaison s'ouvre. */
export const PICK_EVENT = "tp-pick";
export interface PickState { ids: number[]; on: boolean }
let pick: PickState = { ids: [], on: false };
export const getPick = () => pick;
export function setPick(next: PickState) {
  pick = next;
  window.dispatchEvent(new CustomEvent<PickState>(PICK_EVENT, { detail: pick }));
}
/** Ajoute ou retire une sortie de la sélection ; à la deuxième, la comparaison s'ouvre. */
export function togglePick(id: number, from?: HTMLElement | null) {
  const ids = pick.ids.includes(id) ? pick.ids.filter((x) => x !== id) : [...pick.ids, id].slice(-2);
  setPick({ on: true, ids });
  if (ids.length === 2) {
    window.setTimeout(() => { openPanel({ kind: "compare", a: ids[0], b: ids[1] }, from); setPick({ on: false, ids: [] }); }, 220);
  }
}
