"use client";

import { api, dayLabel, type PlanSession } from "./client";
import { buzz } from "./motion";
import type { ToastOpts } from "./AppShell";

/** Une séance qu'on peut encore faire, sauter ou déplacer. */
export const movable = (s: PlanSession, today: string) => s.template !== "race" && s.date >= today && (s.status === "planned" || s.status === "adapted");

/**
 * Actions sur les séances du planning, partagées par la liste, le calendrier, la séance du jour et leurs fiches :
 * faite / sautée / rétablie, déplacée (avec échange), séance prévue rétablie. Chacune annonce le résultat dans
 * l'île dynamique, avec « Annuler » quand c'est possible. `after` recharge ce qui doit l'être (planning, accueil) ;
 * `morph` : la liste peut se réorganiser en transition de vue.
 */
export function planActions({ toast, after, fly }: {
  toast: (m: string, o?: ToastOpts) => void;
  after: (morph?: boolean) => Promise<unknown>;
  /** Petite coche qui s'envole vers la séance (liste du planning). */
  fly?: (id: number) => Promise<void> | null;
}) {
  const err = (e: unknown) => toast(e instanceof Error ? e.message : "Erreur");
  async function setStatus(s: PlanSession, status: string, undo = true) {
    const prev = s.status;
    try {
      const flight = status === "done" ? fly?.(s.id) ?? null : null;
      if (status === "done") buzz([14, 70, 24]);
      await api(`/api/plan/${s.id}`, { method: "PATCH", body: { status } });
      await flight;
      await after(true);
      window.dispatchEvent(new CustomEvent("tp-plan-changed"));
      // Faite ou sautée par erreur : « Annuler » remet la séance comme elle était.
      if (undo && (status === "done" || status === "skipped") && (prev === "planned" || prev === "adapted")) {
        toast(`${s.title} : ${status === "done" ? "faite" : "sautée"}.`, { action: { label: "Annuler", run: () => { setStatus({ ...s, status }, prev, false).then(() => toast("C’est annulé.")); } } });
      } else if (!undo) { /* annulation : le message vient de l'appelant */ }
      else toast(status === "planned" ? `${s.title} : rétablie.` : `${s.title} : ${status === "done" ? "faite" : "sautée"}.`);
    } catch (e) { err(e); }
  }
  // Déplacement annulable : les séances reprennent leurs jours d'avant.
  const undoMove = (moved: { id: number; date: string }[]) => ({
    label: "Annuler",
    run: async () => {
      try {
        for (const m of moved) await api(`/api/plan/${m.id}`, { method: "PATCH", body: { date: m.date } });
        await after(true);
        window.dispatchEvent(new CustomEvent("tp-plan-changed"));
        toast("Déplacement annulé.");
      } catch (e) { err(e); }
    },
  });
  /** La séance va au jour choisi ; si une séance déplaçable s'y trouve, elles échangent leurs jours. */
  async function moveTo(a: PlanSession, date: string, swap: PlanSession | null) {
    try {
      await api(`/api/plan/${a.id}`, { method: "PATCH", body: { date } });
      if (swap) await api(`/api/plan/${swap.id}`, { method: "PATCH", body: { date: a.date } });
      buzz([10, 40, 10]);
      await after(true);
      window.dispatchEvent(new CustomEvent("tp-plan-changed"));
      toast(`${a.title} déplacée au ${dayLabel(date, { weekday: "long", day: "numeric", month: "long" })}${swap ? ` (échange avec ${swap.title})` : ""}.`, { action: undoMove([{ id: a.id, date: a.date }, ...(swap ? [{ id: swap.id, date: swap.date }] : [])]) });
    } catch (e) { err(e); }
  }
  async function restore(s: PlanSession) {
    try { await api(`/api/plan/${s.id}`, { method: "PATCH", body: { restore: true } }); await after(true); window.dispatchEvent(new CustomEvent("tp-plan-changed")); toast("Séance prévue rétablie."); }
    catch (e) { err(e); }
  }
  return { setStatus, moveTo, restore };
}
