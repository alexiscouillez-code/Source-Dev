import "server-only";
import { all, run } from "@/db/client";

/**
 * Journal de santé des services extérieurs : pour chaque service, date de la dernière réussite et de la dernière panne.
 * Sert à la carte « État des connexions » du compte : le coureur voit tout de suite ce qui ne marche pas.
 * Certains services sont propres à un coureur (Strava, notifications), d’autres communs à tous (météo, e-mail) :
 * ceux-là sont enregistrés avec l’utilisateur 0.
 * Enregistrer ne doit jamais faire échouer l’action principale : toutes les erreurs sont avalées.
 */
export type Service = "strava" | "push" | "ia" | "meteo" | "mail";

/** Message court et sans donnée sensible : jamais de jeton, de clé ni d’adresse. */
function clean(err: unknown) {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "Erreur inconnue";
  const status = raw.match(/\b([45]\d\d)\b/)?.[1];
  if (status) return `Réponse ${status} du service`;
  if (/timeout|aborted|TimeoutError/i.test(raw)) return "Le service n’a pas répondu à temps";
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|network/i.test(raw)) return "Service injoignable";
  return "Erreur pendant l’appel";
}

export async function recordOk(service: Service, userId = 0) {
  try {
    await run("INSERT INTO service_status(service, user_id, last_ok_at) VALUES (?, ?, ?) ON CONFLICT(service, user_id) DO UPDATE SET last_ok_at = excluded.last_ok_at", [service, userId, Date.now()]);
  } catch { /* journal facultatif */ }
}

export async function recordFail(service: Service, err: unknown, userId = 0) {
  try {
    await run("INSERT INTO service_status(service, user_id, last_fail_at, last_error) VALUES (?, ?, ?, ?) ON CONFLICT(service, user_id) DO UPDATE SET last_fail_at = excluded.last_fail_at, last_error = excluded.last_error", [service, userId, Date.now(), clean(err)]);
  } catch { /* journal facultatif */ }
}

export interface ServiceState { service: Service; lastOk: number | null; lastFail: number | null; error: string | null }

/** États connus pour ce coureur : ses services à lui, plus les services communs. */
export async function statesFor(userId: number): Promise<ServiceState[]> {
  const rows = await all<{ service: Service; user_id: number; last_ok_at: number | null; last_fail_at: number | null; last_error: string | null }>(
    "SELECT service, user_id, last_ok_at, last_fail_at, last_error FROM service_status WHERE user_id IN (?, 0)", [userId]);
  const out = new Map<Service, ServiceState>();
  // L’état propre au coureur passe avant l’état commun.
  for (const r of rows.sort((a, b) => a.user_id - b.user_id)) out.set(r.service, { service: r.service, lastOk: r.last_ok_at, lastFail: r.last_fail_at, error: r.last_error });
  return [...out.values()];
}
