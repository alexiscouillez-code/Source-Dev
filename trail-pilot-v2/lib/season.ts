import "server-only";
import { all, one, run } from "@/db/client";

/**
 * Saison : la prochaine course principale est dans goals (tout le plan la vise), les suivantes dans next_goals.
 * Quand la course active est passée, elle rejoint les courses courues (race_archive, débrief) et la suivante prend sa place,
 * avec son tracé, son lieu, son matériel et ses repères.
 */
export interface NextGoalRow { id: number; name: string; date: string; distance_km: number | null; gain_m: number | null; route: string | null; place: string | null; gear: string | null; anchor: string | null; chained: number }
interface ActiveRow { name: string; date: string; distance_km: number | null; gain_m: number | null; route: string | null; place: string | null; gear: string | null; anchor: string | null; plan_meta: string | null; chained: number | null }

export const loadNextGoals = (userId: number) =>
  all<NextGoalRow>("SELECT id, name, date, distance_km, gain_m, route, place, gear, anchor, chained FROM next_goals WHERE user_id = ? ORDER BY date", [userId]);
const loadActive = (userId: number) =>
  one<ActiveRow>("SELECT name, date, distance_km, gain_m, route, place, gear, anchor, plan_meta, chained FROM goals WHERE user_id = ?", [userId]);

async function archive(userId: number, r: { name: string; date: string; distance_km: number | null; gain_m: number | null; plan_meta?: string | null; route: string | null }) {
  await run(
    `INSERT INTO race_archive(user_id, date, name, distance_km, gain_m, plan_meta, route, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET name = excluded.name, distance_km = excluded.distance_km, gain_m = excluded.gain_m, plan_meta = COALESCE(excluded.plan_meta, race_archive.plan_meta), route = COALESCE(excluded.route, race_archive.route), archived_at = excluded.archived_at`,
    [userId, r.date, r.name, r.distance_km, r.gain_m, r.plan_meta ?? null, r.route, Date.now()]);
}

/** La course suivante devient la course active (le plan la visera au prochain calcul). */
async function activate(userId: number, n: NextGoalRow) {
  await run(
    `INSERT INTO goals(user_id, name, date, distance_km, gain_m, route, place, gear, anchor, chained, plan_meta, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, date = excluded.date, distance_km = excluded.distance_km, gain_m = excluded.gain_m, route = excluded.route,
       place = excluded.place, gear = excluded.gear, anchor = excluded.anchor, chained = excluded.chained, plan_meta = NULL, updated_at = excluded.updated_at`,
    [userId, n.name, n.date, n.distance_km, n.gain_m, n.route, n.place, n.gear, n.anchor, n.chained, Date.now()]);
  await run("DELETE FROM next_goals WHERE id = ? AND user_id = ?", [n.id, userId]);
}

/** Remet la course active parmi les suivantes (une course plus proche vient d'être ajoutée ou avancée). */
async function deactivate(userId: number, g: ActiveRow) {
  await run("INSERT OR REPLACE INTO next_goals(user_id, name, date, distance_km, gain_m, route, place, gear, anchor, chained, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [userId, g.name, g.date, g.distance_km, g.gain_m, g.route, g.place, g.gear, g.anchor, g.chained ?? 0, Date.now()]);
}

/**
 * Remet la saison d'aplomb (base de données seulement) : la course active est toujours la prochaine course principale.
 *  - course active passée (le lendemain) et une suivante prévue : la passée rejoint les courses courues, la suivante devient active ;
 *  - aucune course active mais une suivante : elle devient active ;
 *  - une suivante plus proche que l'active : échange.
 * Les courses suivantes passées sans avoir été actives rejoignent aussi les courses courues.
 * Renvoie true si la course active a changé (le plan est alors à recalculer).
 */
export async function rollSeason(userId: number, today: string): Promise<boolean> {
  const next = await loadNextGoals(userId);
  if (!next.length) return false;
  for (const n of next.filter((x) => x.date < today)) { await archive(userId, n); await run("DELETE FROM next_goals WHERE id = ?", [n.id]); }
  const first = next.find((x) => x.date >= today);
  if (!first) return false;
  const g = await loadActive(userId);
  if (!g) { await activate(userId, first); return true; }
  if (g.date < today) { await archive(userId, g); await activate(userId, first); return true; }
  if (first.date < g.date) { await deactivate(userId, g); await activate(userId, first); return true; }
  return false;
}
