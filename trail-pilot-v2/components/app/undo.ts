"use client";

import { useSyncExternalStore } from "react";
import { api, localToday } from "./client";

/**
 * Suppressions annulables : l'élément disparaît tout de suite de l'écran, mais la requête ne part qu'après le délai
 * d'annulation (le bouton « Annuler » de l'île dynamique). Si la page se ferme avant, la requête part quand même
 * (fetch keepalive), pour que ce qui a été supprimé à l'écran le soit vraiment.
 */
export const UNDO_MS = 5000;

interface Job { timer: number; url: string; method: string; then?: () => unknown }
const jobs = new Map<string, Job>();
const subs = new Set<() => void>();
let version = 0;
const bump = () => { version++; subs.forEach((f) => f()); };

let hooked = false;
function hookPageHide() {
  if (hooked || typeof window === "undefined") return;
  hooked = true;
  window.addEventListener("pagehide", () => {
    for (const [key, j] of jobs) {
      window.clearTimeout(j.timer);
      try { fetch(j.url, { method: j.method, keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ today: localToday() }) }); } catch { /* hors ligne */ }
      jobs.delete(key);
    }
  });
}

/** Programme une requête après le délai d'annulation. `then` : rechargement une fois la requête faite. */
export function later(key: string, req: { url: string; method?: string }, then?: () => unknown, ms = UNDO_MS) {
  hookPageHide();
  cancelLater(key);
  const method = req.method ?? "DELETE";
  const timer = window.setTimeout(async () => {
    jobs.delete(key);
    try { await api(req.url, { method }); }
    catch (e) { window.dispatchEvent(new CustomEvent("tp-toast", { detail: e instanceof Error ? e.message : "La suppression a échoué." })); }
    finally { bump(); await then?.(); }
  }, ms);
  jobs.set(key, { timer, url: req.url, method, then });
  bump();
}

/** Annule une requête programmée. Renvoie false si elle était déjà partie. */
export function cancelLater(key: string) {
  const j = jobs.get(key);
  if (!j) return false;
  window.clearTimeout(j.timer);
  jobs.delete(key);
  bump();
  return true;
}

export const isPending = (key: string) => jobs.has(key);

/** Rafraîchit le composant quand une suppression est programmée, annulée ou faite. */
export function usePending() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => version, () => 0);
}
