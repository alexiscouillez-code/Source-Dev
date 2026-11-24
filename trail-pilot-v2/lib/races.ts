import "server-only";
import { all, one, run } from "@/db/client";
import { diffDays } from "./engine/dates";
import { debrief, type PlannedRace } from "./engine/debrief";
import { parseAnalysis } from "./engine/streams";
import { pastRaces, raceActivity } from "./debrief";
import { loadGoal, readPlanMeta } from "./service";

/** Garde la course principale passée avant qu'elle soit remplacée ou retirée (Mes courses, débrief). */
export async function archiveGoal(userId: number, today: string) {
  const g = await loadGoal(userId);
  if (!g || g.date > today) return;
  await run(
    `INSERT INTO race_archive(user_id, date, name, distance_km, gain_m, plan_meta, route, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET name = excluded.name, distance_km = excluded.distance_km, gain_m = excluded.gain_m, plan_meta = COALESCE(excluded.plan_meta, race_archive.plan_meta), route = COALESCE(excluded.route, race_archive.route), archived_at = excluded.archived_at`,
    [userId, g.date, g.name, g.distance_km, g.gain_m, g.plan_meta ?? null, g.route ?? null, Date.now()]);
}

/** Une course de « Mes courses ». */
export interface RaceEntry {
  key: string; main: boolean; name: string; date: string; distanceKm: number | null; gainM: number | null;
  priority: "A" | "B" | "C"; past: boolean; daysTo: number;
  /** Course passée : la sortie du jour (la plus longue à pied). */
  activity: { id: number; durationMin: number; distanceKm: number | null; gainM: number | null } | null;
  /** Estimation : celle du plan pour la course principale à venir, celle d'avant course (figée au débrief) pour une course passée. */
  estimate: { low: number; high: number } | null;
  result: { tone: "mieux" | "prevu" | "moins" | "inconnu"; label: string } | null;
  debriefDone: boolean;
  /** Même course courue une autre année (nom proche) : de quoi comparer les éditions. */
  edition: { key: string; date: string; activityId: number | null; durationMin: number | null } | null;
}

/** Nom ramené à l'essentiel pour reconnaître la même course d'une année sur l'autre. */
export const raceSlug = (name: string) => name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\b(19|20)\d{2}\b/g, " ").replace(/\b\d+(e|eme|ème|th|st|nd|rd)?\s*(edition|édition)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ").trim();

/** Toutes les courses : à venir (principale et préparation) et passées, avec résultat et débrief. */
export async function listRaces(userId: number, today: string): Promise<RaceEntry[]> {
  const [goal, upcomingSides, past, debriefs] = await Promise.all([
    loadGoal(userId),
    all<{ id: number; name: string; date: string; distance_km: number | null; gain_m: number | null; priority: string }>(
      "SELECT id, name, date, distance_km, gain_m, priority FROM side_races WHERE user_id = ? AND date > ? ORDER BY date", [userId, today]),
    pastRaces(userId, today),
    all<{ race_key: string; planned: string | null; rpe: number | null; tags: string | null; note: string | null }>("SELECT race_key, planned, rpe, tags, note FROM race_debriefs WHERE user_id = ?", [userId]),
  ]);
  const byKey = new Map(debriefs.map((d) => [d.race_key, d]));
  const out: RaceEntry[] = [];
  if (goal && goal.date > today) {
    const est = readPlanMeta(goal)?.estimate ?? null;
    out.push({ key: `main:${goal.date}`, main: true, name: goal.name, date: goal.date, distanceKm: goal.distance_km, gainM: goal.gain_m, priority: "A", past: false, daysTo: diffDays(today, goal.date),
      activity: null, estimate: est ? { low: Math.round(est.low), high: Math.round(est.high) } : null, result: null, debriefDone: false, edition: null });
  }
  for (const s of upcomingSides) {
    out.push({ key: `side:${s.id}`, main: false, name: s.name, date: s.date, distanceKm: s.distance_km, gainM: s.gain_m, priority: s.priority === "C" ? "C" : "B", past: false, daysTo: diffDays(today, s.date),
      activity: null, estimate: null, result: null, debriefDone: false, edition: null });
  }
  for (const r of past) {
    const act = await raceActivity(userId, r.date);
    const row = byKey.get(r.key);
    let planned: PlannedRace | null = null;
    try { planned = row?.planned ? (JSON.parse(row.planned) as PlannedRace) : null; } catch { planned = null; }
    // Résultat sans recalcul : seulement si le « prévu » a déjà été figé (débrief ouvert une fois).
    const res = act && planned ? debrief(planned, { durationMin: act.duration_min, distanceKm: act.distance_km, gainM: act.gain_m, avgHr: act.avg_hr }, parseAnalysis(act.analysis), { hrMax: null, hrRest: null }, []).result : null;
    const tags = (() => { try { return JSON.parse(row?.tags ?? "[]") as string[]; } catch { return []; } })();
    out.push({
      key: r.key, main: r.main, name: r.name, date: r.date, distanceKm: r.distanceKm, gainM: r.gainM, priority: r.main ? "A" : "B", past: true, daysTo: -diffDays(r.date, today),
      activity: act ? { id: act.id, durationMin: act.duration_min, distanceKm: act.distance_km, gainM: act.gain_m } : null,
      estimate: planned?.estimate ?? null,
      result: res ? { tone: res.tone, label: res.label } : null,
      debriefDone: row?.rpe != null || tags.length > 0 || !!row?.note,
      edition: null,
    });
  }
  // Éditions : la même course courue une autre fois (la plus récente des précédentes).
  const done = out.filter((r) => r.past);
  for (const r of out) {
    const slug = raceSlug(r.name);
    if (!slug) continue;
    const prev = done.find((x) => x.key !== r.key && x.date < r.date && raceSlug(x.name) === slug);
    if (prev) r.edition = { key: prev.key, date: prev.date, activityId: prev.activity?.id ?? null, durationMin: prev.activity?.durationMin ?? null };
  }
  return out;
}

/** La course d'un jour donné (pour le jour de course touché dans le Planning). */
export async function raceOn(userId: number, today: string, date: string) {
  const races = await listRaces(userId, today);
  return races.find((r) => r.date === date) ?? null;
}

/** Vérifie qu'une clé de course appartient au compte. */
export async function ownsRace(userId: number, key: string) {
  if (key.startsWith("side:")) return !!(await one("SELECT 1 FROM side_races WHERE id = ? AND user_id = ?", [Number(key.slice(5)), userId]));
  const date = key.slice(5);
  return !!(await one("SELECT 1 FROM goals WHERE user_id = ? AND date = ?", [userId, date])) || !!(await one("SELECT 1 FROM race_archive WHERE user_id = ? AND date = ?", [userId, date]));
}
