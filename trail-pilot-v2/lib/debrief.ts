import "server-only";
import { all, one, run } from "@/db/client";
import { addDays, diffDays } from "./engine/dates";
import { debrief, project, TAGS, type PlannedRace } from "./engine/debrief";
import { raceDemands } from "./engine/planner";
import { buildStrategy, type RaceRoute } from "./engine/strategy";
import { parseAnalysis } from "./engine/streams";
import { estimateVo2 } from "./engine/vo2";
import { loadGoal, loadState, readPlanMeta, toVo2Run, type ActivityRow } from "./service";
import { reanalyze } from "./strava";

/**
 * Débriefs des courses des 90 derniers jours (course principale et courses de préparation).
 * Le « prévu » est figé à la première ouverture : estimation d’avant course (celle du plan pour la course
 * principale ; recalculée avec la forme de la veille pour une course de préparation) et, si le tracé avait été
 * importé, le temps prévu de chaque section.
 */
interface Row { planned: string | null; rpe: number | null; tags: string | null; note: string | null; tried: number }
const WINDOW = 90;

async function plannedFor(userId: number, key: string, race: { name: string; date: string; distanceKm: number | null; gainM: number | null }, main: { estimate: { low: number; high: number } | null; route: RaceRoute | null } | null): Promise<PlannedRace> {
  const row = await one<{ planned: string | null }>("SELECT planned FROM race_debriefs WHERE user_id = ? AND race_key = ?", [userId, key]);
  if (row?.planned) { try { return JSON.parse(row.planned) as PlannedRace; } catch { /* instantané illisible : recalculé */ } }
  let estimate = main?.estimate ?? null;
  if (!estimate && race.distanceKm) {
    // Forme de la veille de la course : la course elle-même n’entre pas dans son propre « prévu ».
    const eve = addDays(race.date, -1);
    const { profile, acts, tl } = await loadState(userId, eve);
    const vdot = estimateVo2(acts.filter((a) => a.date <= eve).map(toVo2Run), eve, { hrMax: profile.hr_max, hrRest: profile.hr_rest, watch: profile.vo2_watch }).paceVdot;
    const e = raceDemands({ name: race.name, date: race.date, distanceKm: race.distanceKm, gainM: race.gainM }, profile.level, tl.ctl, vdot).estimate;
    estimate = { low: Math.round(e.low), high: Math.round(e.high) };
  }
  const planned: PlannedRace = { ...race, estimate };
  if (main?.route && estimate) {
    try { planned.sections = buildStrategy(main.route, estimate).sections.map((s) => ({ label: s.label, from: s.from, to: s.to, gain: s.gain, loss: s.loss, low: s.minutes.low, high: s.minutes.high })); } catch { /* tracé inexploitable */ }
  }
  await run("INSERT INTO race_debriefs(user_id, race_key, planned, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, race_key) DO UPDATE SET planned = excluded.planned", [userId, key, JSON.stringify(planned), Date.now()]);
  return planned;
}

export async function loadDebriefs(userId: number, today: string) {
  const since = addDays(today, -WINDOW);
  const [goal, sides, prof] = await Promise.all([
    loadGoal(userId),
    all<{ id: number; name: string; date: string; distanceKm: number | null; gainM: number | null; priority: string }>(
      "SELECT id, name, date, distance_km AS distanceKm, gain_m AS gainM, priority FROM side_races WHERE user_id = ? AND date <= ? AND date >= ? ORDER BY date DESC", [userId, today, since]),
    one<{ hr_max: number | null; hr_rest: number | null }>("SELECT hr_max, hr_rest FROM profiles WHERE user_id = ?", [userId]),
  ]);
  const physio = { hrMax: prof?.hr_max ?? null, hrRest: prof?.hr_rest ?? null };
  const races: { key: string; main: boolean; name: string; date: string; distanceKm: number | null; gainM: number | null }[] = [];
  if (goal && goal.date <= today && goal.date >= since) races.push({ key: `main:${goal.date}`, main: true, name: goal.name, date: goal.date, distanceKm: goal.distance_km, gainM: goal.gain_m });
  for (const s of sides) races.push({ key: `side:${s.id}`, main: false, name: s.name, date: s.date, distanceKm: s.distanceKm, gainM: s.gainM });
  races.sort((a, b) => b.date.localeCompare(a.date));

  const out = [];
  for (const r of races.slice(0, 6)) {
    let act = await one<ActivityRow & { strava_id: string | null; analysis: string | null }>(
      "SELECT * FROM activities WHERE user_id = ? AND date = ? AND sport IN ('trail', 'course', 'rando') ORDER BY duration_min DESC LIMIT 1", [userId, r.date]);
    const base = { key: r.key, main: r.main, name: r.name, date: r.date, distanceKm: r.distanceKm, gainM: r.gainM };
    if (!act) { out.push({ ...base, status: "attente" as const }); continue; }
    const meta = r.main ? readPlanMeta(goal) : null;
    let route: RaceRoute | null = null;
    if (r.main) { try { route = goal?.route ? JSON.parse(goal.route) : null; } catch { route = null; } }
    const planned = await plannedFor(userId, r.key, { name: r.name, date: r.date, distanceKm: r.distanceKm, gainM: r.gainM }, r.main ? { estimate: meta?.estimate ? { low: Math.round(meta.estimate.low), high: Math.round(meta.estimate.high) } : null, route } : null);
    const row = await one<Row>("SELECT planned, rpe, tags, note, tried FROM race_debriefs WHERE user_id = ? AND race_key = ?", [userId, r.key]);
    // Temps de passage manquants sur une sortie Strava importée avant cette version : une relecture, une seule fois.
    if (planned.sections?.length && !parseAnalysis(act.analysis)?.km && act.strava_id && !row?.tried) {
      await run("UPDATE race_debriefs SET tried = 1 WHERE user_id = ? AND race_key = ?", [userId, r.key]);
      if (await reanalyze(userId, act.strava_id)) act = (await one<ActivityRow & { strava_id: string | null; analysis: string | null }>("SELECT * FROM activities WHERE id = ?", [act.id])) ?? act;
    }
    const tags = (() => { try { return (JSON.parse(row?.tags ?? "[]") as string[]).filter((t) => t in TAGS); } catch { return []; } })();
    const analysis = parseAnalysis(act.analysis);
    const d = debrief(planned, { durationMin: act.duration_min, distanceKm: act.distance_km, gainM: act.gain_m, avgHr: act.avg_hr }, analysis, physio, tags);
    // Ce que cette course de préparation laisse attendre sur la course principale à venir.
    let projection: { name: string; low: number; high: number; current: { low: number; high: number } | null } | null = null;
    if (!r.main && goal && goal.date > today && goal.distance_km && act.distance_km && d.route.match) {
      const p = project(act.duration_min, { distanceKm: act.distance_km, gainM: act.gain_m ?? r.gainM ?? 0 }, { distanceKm: goal.distance_km, gainM: goal.gain_m ?? 0 });
      const cur = readPlanMeta(goal)?.estimate ?? null;
      if (p) projection = { name: goal.name, ...p, current: cur ? { low: Math.round(cur.low), high: Math.round(cur.high) } : null };
    }
    out.push({
      ...base, status: "pret" as const, daysAgo: diffDays(r.date, today),
      activity: { id: act.id, name: act.name, durationMin: act.duration_min, distanceKm: act.distance_km, gainM: act.gain_m, avgHr: act.avg_hr, source: act.source },
      planned: { estimate: planned.estimate, hasSections: !!planned.sections?.length },
      splits: !!analysis?.km?.length,
      ...d, projection,
      feedback: { rpe: row?.rpe ?? null, tags, note: row?.note ?? null, done: row?.rpe != null || tags.length > 0 || !!row?.note },
    });
  }
  return out;
}

export async function saveFeedback(userId: number, key: string, f: { rpe: number | null; tags: string[]; note: string | null }) {
  const tags = [...new Set(f.tags.filter((t) => t in TAGS))].slice(0, 10);
  await run("INSERT INTO race_debriefs(user_id, race_key, rpe, tags, note, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, race_key) DO UPDATE SET rpe = excluded.rpe, tags = excluded.tags, note = excluded.note, updated_at = excluded.updated_at",
    [userId, key, f.rpe, JSON.stringify(tags), f.note, Date.now()]);
}
