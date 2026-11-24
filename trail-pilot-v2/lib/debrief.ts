import "server-only";
import { all, one, run } from "@/db/client";
import { addDays, diffDays } from "./engine/dates";
import { debrief, project, TAGS, type PlannedRace } from "./engine/debrief";
import { raceDemands } from "./engine/planner";
import { buildStrategy, type RaceRoute } from "./engine/strategy";
import { parseAnalysis } from "./engine/streams";
import { estimateVo2 } from "./engine/vo2";
import { loadGoal, loadState, readPlanMeta, toVo2Run, type ActivityRow, type GoalRow } from "./service";
import type { RacePlan } from "./engine/planner";
import { reanalyze } from "./strava";
import { loadCalibration } from "./calibration";

/**
 * Débriefs des courses des 90 derniers jours (course principale et courses de préparation).
 * Le « prévu » est figé à la première ouverture : estimation d’avant course (celle du plan pour la course
 * principale ; recalculée avec la forme de la veille pour une course de préparation) et, si le tracé avait été
 * importé, le temps prévu de chaque section.
 */
interface Row { planned: string | null; rpe: number | null; tags: string | null; note: string | null; tried: number }
const WINDOW = 90;

async function plannedFor(userId: number, key: string, race: { name: string; date: string; distanceKm: number | null; gainM: number | null }, main: { estimate: { low: number; high: number } | null; modelMid: number | null; calib: number | null; route: RaceRoute | null } | null): Promise<PlannedRace> {
  const row = await one<{ planned: string | null }>("SELECT planned FROM race_debriefs WHERE user_id = ? AND race_key = ?", [userId, key]);
  if (row?.planned) { try { return JSON.parse(row.planned) as PlannedRace; } catch { /* instantané illisible : recalculé */ } }
  let estimate = main?.estimate ?? null, modelMid = main?.modelMid ?? null, calib = main?.calib ?? null;
  if (!estimate && race.distanceKm) {
    // Forme de la veille de la course : la course elle-même n’entre pas dans son propre « prévu ».
    const eve = addDays(race.date, -1);
    const { profile, acts, tl } = await loadState(userId, eve);
    const vdot = estimateVo2(acts.filter((a) => a.date <= eve).map(toVo2Run), eve, { hrMax: profile.hr_max, hrRest: profile.hr_rest, watch: profile.vo2_watch }).paceVdot;
    // Calibrage connu avant cette course (les autres courses débriefées), comme l’aurait affiché l’appli la veille.
    const c = (await loadCalibration(userId, race.date, key)).factor;
    const d = raceDemands({ name: race.name, date: race.date, distanceKm: race.distanceKm, gainM: race.gainM }, profile.level, tl.ctl, vdot, c);
    estimate = { low: Math.round(d.estimate.low), high: Math.round(d.estimate.high) }; modelMid = d.modelMid; calib = c;
  }
  const planned: PlannedRace = { ...race, estimate, modelMid, calib };
  if (main?.route && estimate) {
    try { planned.sections = buildStrategy(main.route, estimate).sections.map((s) => ({ label: s.label, from: s.from, to: s.to, gain: s.gain, loss: s.loss, low: s.minutes.low, high: s.minutes.high })); } catch { /* tracé inexploitable */ }
  }
  await run("INSERT INTO race_debriefs(user_id, race_key, planned, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, race_key) DO UPDATE SET planned = excluded.planned", [userId, key, JSON.stringify(planned), Date.now()]);
  return planned;
}

/** Course passée (principale actuelle ou archivée, ou de préparation) avec ce qu'il faut pour son débrief. */
export interface RaceRef { key: string; main: boolean; name: string; date: string; distanceKm: number | null; gainM: number | null; meta: RacePlan | null; route: RaceRoute | null }
const parse = <T,>(raw: string | null | undefined): T | null => { try { return raw ? (JSON.parse(raw) as T) : null; } catch { return null; } };

/**
 * Courses passées du compte, de la plus récente à la plus ancienne : la course principale si sa date est passée,
 * les courses principales précédentes (archivées quand on a choisi la suivante) et les courses de préparation.
 */
export async function pastRaces(userId: number, today: string, since = "0000-01-01"): Promise<RaceRef[]> {
  const [goal, archived, sides] = await Promise.all([
    loadGoal(userId),
    all<{ date: string; name: string; distance_km: number | null; gain_m: number | null; plan_meta: string | null; route: string | null }>(
      "SELECT date, name, distance_km, gain_m, plan_meta, route FROM race_archive WHERE user_id = ? AND date <= ? AND date >= ? ORDER BY date DESC", [userId, today, since]),
    all<{ id: number; name: string; date: string; distanceKm: number | null; gainM: number | null }>(
      "SELECT id, name, date, distance_km AS distanceKm, gain_m AS gainM FROM side_races WHERE user_id = ? AND date <= ? AND date >= ? ORDER BY date DESC", [userId, today, since]),
  ]);
  const races: RaceRef[] = [];
  if (goal && goal.date <= today && goal.date >= since) races.push({ key: `main:${goal.date}`, main: true, name: goal.name, date: goal.date, distanceKm: goal.distance_km, gainM: goal.gain_m, meta: readPlanMeta(goal), route: parse<RaceRoute>(goal.route) });
  for (const g of archived) if (!races.some((r) => r.key === `main:${g.date}`)) races.push({ key: `main:${g.date}`, main: true, name: g.name, date: g.date, distanceKm: g.distance_km, gainM: g.gain_m, meta: parse<RacePlan>(g.plan_meta), route: parse<RaceRoute>(g.route) });
  for (const x of sides) races.push({ key: `side:${x.id}`, main: false, name: x.name, date: x.date, distanceKm: x.distanceKm, gainM: x.gainM, meta: null, route: null });
  return races.sort((a, b) => b.date.localeCompare(a.date));
}

/** Sortie de la course : la plus longue sortie à pied du jour. */
export const raceActivity = (userId: number, date: string) => one<ActivityRow & { strava_id: string | null; analysis: string | null }>(
  "SELECT * FROM activities WHERE user_id = ? AND date = ? AND sport IN ('trail', 'course', 'rando') AND COALESCE(check_state, 0) <> 1 ORDER BY duration_min DESC LIMIT 1", [userId, date]);

async function buildDebrief(userId: number, today: string, r: RaceRef, goal: GoalRow | null, physio: { hrMax: number | null; hrRest: number | null; vdot: number | null }) {
  let act = await raceActivity(userId, r.date);
  const base = { key: r.key, main: r.main, name: r.name, date: r.date, distanceKm: r.distanceKm, gainM: r.gainM };
  if (!act) return { ...base, status: "attente" as const };
  const meta = r.meta;
  const planned = await plannedFor(userId, r.key, { name: r.name, date: r.date, distanceKm: r.distanceKm, gainM: r.gainM }, r.main ? { estimate: meta?.estimate ? { low: Math.round(meta.estimate.low), high: Math.round(meta.estimate.high) } : null, modelMid: meta?.modelMid ?? null, calib: meta?.calib?.factor ?? 1, route: r.route } : null);
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
  return {
    ...base, status: "pret" as const, daysAgo: diffDays(r.date, today),
    activity: { id: act.id, name: act.name, durationMin: act.duration_min, distanceKm: act.distance_km, gainM: act.gain_m, avgHr: act.avg_hr, source: act.source },
    planned: { estimate: planned.estimate, hasSections: !!planned.sections?.length },
    splits: !!analysis?.km?.length,
    ...d, projection,
    feedback: { rpe: row?.rpe ?? null, tags, note: row?.note ?? null, done: row?.rpe != null || tags.length > 0 || !!row?.note },
  };
}

async function physioFor(userId: number) {
  const prof = await one<{ hr_max: number | null; hr_rest: number | null; vo2_watch: number | null; vdot_ref: number | null }>("SELECT hr_max, hr_rest, vo2_watch, vdot_ref FROM profiles WHERE user_id = ?", [userId]);
  return { hrMax: prof?.hr_max ?? null, hrRest: prof?.hr_rest ?? null, vdot: prof?.vo2_watch ?? prof?.vdot_ref ?? null };
}

/** Débriefs des courses des 90 derniers jours (les 6 plus récentes), affichés en haut du Planning. */
export async function loadDebriefs(userId: number, today: string) {
  const [refs, goal, physio] = await Promise.all([pastRaces(userId, today, addDays(today, -WINDOW)), loadGoal(userId), physioFor(userId)]);
  const out = [];
  for (const r of refs.slice(0, 6)) out.push(await buildDebrief(userId, today, r, goal ?? null, physio));
  return out;
}

/** Débrief d'une course passée, quelle que soit sa date (Mes courses, jour de course touché dans le Planning). */
export async function loadDebrief(userId: number, today: string, key: string) {
  const r = (await pastRaces(userId, today)).find((x) => x.key === key);
  if (!r) return null;
  const [goal, physio] = await Promise.all([loadGoal(userId), physioFor(userId)]);
  return buildDebrief(userId, today, r, goal ?? null, physio);
}

export async function saveFeedback(userId: number, key: string, f: { rpe: number | null; tags: string[]; note: string | null }) {
  const tags = [...new Set(f.tags.filter((t) => t in TAGS))].slice(0, 10);
  await run("INSERT INTO race_debriefs(user_id, race_key, rpe, tags, note, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, race_key) DO UPDATE SET rpe = excluded.rpe, tags = excluded.tags, note = excluded.note, updated_at = excluded.updated_at",
    [userId, key, f.rpe, JSON.stringify(tags), f.note, Date.now()]);
}
