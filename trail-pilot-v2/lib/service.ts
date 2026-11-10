import "server-only";
import { all, libsql, one, run } from "@/db/client";
import { addDays, diffDays, mondayOf, range, todayIn } from "./engine/dates";
import { adapt, decide, watchBaseline, type CheckIn, type PlannedLike, type Verdict, type Watch } from "./engine/decision";
import { isFoot, sessionLoad, type ActivityLike, type Sport } from "./engine/load";
import { parseAnalysis, windowsVo2, zoneBounds, zoneMinutes } from "./engine/streams";
import { reviewSession } from "./engine/review";
import { applyLearning, learn, type Learning, type Past } from "./engine/learn";
import { assignShoes } from "./shoes";
import { trainingTargets } from "./engine/paces";
import { estimateVo2, type Vo2Run } from "./engine/vo2";
import { buildRacePlan, maintenancePlan, phaseFor, type Level, type RacePlan } from "./engine/planner";
import { withSideRaces, withStrength, type SideRace } from "./engine/extras";
import { timeline, weeklySummary } from "./engine/timeline";
import { HttpError } from "./api";

export interface ProfileRow { hr_max: number | null; hr_rest: number | null; vo2_watch: number | null; days_per_week: number; long_day: number; max_weekly_minutes: number | null; level: Level }
export interface GoalRow { name: string; date: string; distance_km: number | null; gain_m: number | null; plan_meta?: string | null; route?: string | null }
export interface ActivityRow { id: number; date: string; sport: Sport; name: string | null; duration_min: number; distance_km: number | null; gain_m: number | null; loss_m: number | null; avg_hr: number | null; max_hr: number | null; rpe: number | null; source: string; strava_id: string | null; analysis?: string | null }
export interface PlanRow { id: number; date: string; template: string; title: string; sport: string; duration_min: number; gain_m: number | null; rpe_target: number; description: string; phase: string; status: string; activity_id: number | null; locked: number; original: string | null }
export interface CheckinRow { date: string; sleep: number; legs: number; motivation: number; pain: 0 | 1 | 2; note: string | null; pain_zones?: string | null; sleep_h?: number | null; rhr?: number | null; hrv?: number | null }

/** Mesures de la montre du jour et référence des 14 jours précédents. */
export async function watchOf(userId: number, today: string, c: { sleep_h?: number | null; rhr?: number | null; hrv?: number | null } | null): Promise<Watch | undefined> {
  if (!c || (c.sleep_h == null && c.rhr == null && c.hrv == null)) return undefined;
  const rows = await all<{ rhr: number | null; hrv: number | null }>("SELECT rhr, hrv FROM checkins WHERE user_id = ? AND date < ? AND date >= ?", [userId, today, addDays(today, -14)]);
  return { sleepH: c.sleep_h ?? null, rhr: c.rhr ?? null, hrv: c.hrv ?? null, base: watchBaseline(rows) };
}
export const painZonesOf = (c: { pain_zones?: string | null } | null | undefined): string[] => { try { return c?.pain_zones ? JSON.parse(c.pain_zones) : []; } catch { return []; } };

/** Date du jour côté client (fuseau de l’utilisateur), bornée à ±1 jour de Paris pour éviter les abus. */
export function resolveToday(param: string | null) {
  const paris = todayIn("Europe/Paris");
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param) && Math.abs(diffDays(paris, param)) <= 1) return param;
  return paris;
}

export const toActivityLike = (a: ActivityRow): ActivityLike => ({ date: a.date, sport: a.sport, durationMin: a.duration_min, distanceKm: a.distance_km, gainM: a.gain_m, lossM: a.loss_m, avgHr: a.avg_hr, maxHr: a.max_hr, rpe: a.rpe, hrHist: parseAnalysis(a.analysis)?.hist ?? null });
export const toVo2Run = (r: ActivityRow): Vo2Run => ({ date: r.date, sport: r.sport, durationMin: r.duration_min, distanceKm: r.distance_km, gainM: r.gain_m, lossM: r.loss_m, avgHr: r.avg_hr, maxHr: r.max_hr, name: r.name, win: parseAnalysis(r.analysis)?.win ?? null });
const toPlanned = (p: PlanRow): PlannedLike => ({ title: p.title, durationMin: p.duration_min, rpeTarget: p.rpe_target, template: p.template, sport: p.sport, description: p.description, gainM: p.gain_m });

export async function loadProfile(userId: number) {
  const p = await one<ProfileRow>("SELECT hr_max, hr_rest, vo2_watch, days_per_week, long_day, max_weekly_minutes, level FROM profiles WHERE user_id = ?", [userId]);
  return p ?? { hr_max: null, hr_rest: null, vo2_watch: null, days_per_week: 4, long_day: 6, max_weekly_minutes: null, level: "regulier" as Level };
}
export const loadSideRaces = (userId: number) =>
  all<SideRace & { id: number }>("SELECT id, name, date, distance_km AS distanceKm, gain_m AS gainM, priority FROM side_races WHERE user_id = ? ORDER BY date", [userId]);
export const loadGoal = (userId: number) => one<GoalRow>("SELECT name, date, distance_km, gain_m, plan_meta, route FROM goals WHERE user_id = ?", [userId]);
export const readPlanMeta = (g: GoalRow | null | undefined): RacePlan | null => { try { return g?.plan_meta ? JSON.parse(g.plan_meta) : null; } catch { return null; } };
export const loadActivities = (userId: number, since: string) =>
  all<ActivityRow>("SELECT id, date, sport, name, duration_min, distance_km, gain_m, loss_m, avg_hr, max_hr, rpe, source, strava_id, analysis FROM activities WHERE user_id = ? AND date >= ? ORDER BY date DESC, id DESC", [userId, since]);

export function withLoad(a: ActivityRow, physio: { hrMax: number | null; hrRest: number | null }) {
  const l = sessionLoad(toActivityLike(a), physio);
  // Le résumé brut ne part pas vers le navigateur : on n’envoie que ce qui s’affiche (zones, allure ajustée, découplage, VO2max de la sortie).
  const { analysis: raw, ...row } = a;
  const an = parseAnalysis(raw);
  const vo2 = an ? windowsVo2(an.win, physio) : null;
  const insight = an ? { zones: zoneMinutes(an.hist, physio)?.map((m) => Math.round(m)) ?? null, gap: an.gap, dec: an.dec, vo2: vo2 != null ? Math.round(vo2 * 10) / 10 : null } : null;
  return { ...row, load: l.total, effort: l.rpe, effortSource: l.source, insight };
}

/** Lie les séances réalisées au planning et marque les séances manquées. */
export async function reconcile(userId: number, today: string) {
  await assignShoes(userId);
  const plans = await all<PlanRow>("SELECT * FROM plan_sessions WHERE user_id = ? AND date <= ? AND status IN ('planned', 'adapted')", [userId, today]);
  if (!plans.length) return;
  const acts = await all<ActivityRow>("SELECT id, date, sport FROM activities WHERE user_id = ? AND date >= ?", [userId, plans.reduce((m, p) => (p.date < m ? p.date : m), today)]);
  for (const p of plans) {
    const done = acts.find((a) => a.date === p.date && (isFoot(a.sport) || a.sport === p.sport));
    if (done) await run("UPDATE plan_sessions SET status = 'done', activity_id = ?, updated_at = ? WHERE id = ?", [done.id, Date.now(), p.id]);
    else if (p.date < today) await run("UPDATE plan_sessions SET status = 'missed', updated_at = ? WHERE id = ?", [Date.now(), p.id]);
  }
}

/**
 * Recalcule le plan jusqu’à la course (ou 3 semaines d’entretien sans course) à partir de la charge réelle,
 * sans toucher aux séances verrouillées, réalisées ou passées.
 */
export async function regeneratePlan(userId: number, today: string) {
  const [{ profile, acts, tl }, goal, sides] = await Promise.all([loadState(userId, today), loadGoal(userId), loadSideRaces(userId)]);
  const pp = { daysPerWeek: profile.days_per_week, longDay: profile.long_day, maxWeeklyMinutes: profile.max_weekly_minutes, level: profile.level };
  const likes = acts.map(toActivityLike);
  let items;
  if (goal && goal.date > today) {
    const r = buildRacePlan({ today, profile: pp, goal: { name: goal.name, date: goal.date, distanceKm: goal.distance_km, gainM: goal.gain_m }, activities: likes,
      load: { ctl: tl.ctl, atl: tl.atl, ratio: tl.ratio, calibrated: tl.calibrated },
      // Temps de course estimé depuis la VO2max (montre, sinon sorties) plutôt que depuis le niveau déclaré.
      vdot: estimateVo2(acts.map(toVo2Run), today, { hrMax: profile.hr_max, hrRest: profile.hr_rest, watch: profile.vo2_watch }).paceVdot });
    items = r.items;
    const upcoming = sides.filter((s) => s.date > today && s.date < goal.date);
    if (upcoming.length) r.plan.notes.push(`Course${upcoming.length > 1 ? "s" : ""} de préparation intégrée${upcoming.length > 1 ? "s" : ""} au plan : ${upcoming.map((s) => `${s.name} (${s.priority === "B" ? "objectif secondaire" : "entraînement"}, le ${new Date(`${s.date}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" })})`).join(", ")}. La sortie longue de ces semaines est remplacée par la course, avec allègement avant et récupération après.`);
    await run("UPDATE goals SET plan_meta = ? WHERE user_id = ?", [JSON.stringify(r.plan), userId]);
  } else {
    items = maintenancePlan({ today, profile: pp, activities: likes });
  }
  items = withSideRaces(withStrength(items), sides, { start: addDays(today, 1), level: profile.level, ctl: tl.ctl, mainDate: goal && goal.date > today ? goal.date : null });
  const absence = await loadAbsence(userId, today);
  if (absence) items = applyAbsence(items, absence);
  const lr = await loadLearning(userId, today);
  if (!lr.off) items = applyLearning(items, lr.learning, today);
  await run("INSERT INTO plan_learning(user_id, sig, off, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET sig = excluded.sig, updated_at = excluded.updated_at",
    [userId, lr.off ? "" : lr.learning.sig, lr.off ? 1 : 0, Date.now()]);
  const keep = await all<{ date: string }>("SELECT date FROM plan_sessions WHERE user_id = ? AND date > ? AND (locked = 1 OR status != 'planned')", [userId, today]);
  const kept = new Set(keep.map((k) => k.date));
  const now = Date.now();
  await libsql().batch([
    { sql: "DELETE FROM plan_sessions WHERE user_id = ? AND date > ? AND locked = 0 AND status = 'planned'", args: [userId, today] },
    ...items.filter((i) => !kept.has(i.date)).map((i) => ({
      sql: "INSERT INTO plan_sessions(user_id, date, template, title, sport, duration_min, gain_m, rpe_target, description, phase, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?)",
      args: [userId, i.date, i.template, i.title, i.sport, i.durationMin, i.gainM, i.rpeTarget, i.description, i.phase, now, now],
    })),
  ], "write");
  return items.length;
}

async function loadState(userId: number, today: string) {
  const [profile, acts] = await Promise.all([loadProfile(userId), loadActivities(userId, addDays(today, -240))]);
  const physio = { hrMax: profile.hr_max, hrRest: profile.hr_rest };
  return { profile, acts, physio, tl: timeline(acts.map(toActivityLike), physio, today) };
}

/** Enregistre le check-in du soir et adapte la prochaine séance prévue. */
export async function saveCheckin(userId: number, today: string, c: CheckIn & { note?: string | null }, health: { zones: string[]; consent: boolean } = { zones: [], consent: false }, watch: { sleepH: number | null; rhr: number | null; hrv: number | null } = { sleepH: null, rhr: null, hrv: null }) {
  // Les zones douloureuses sont des données de santé : enregistrées seulement avec un accord explicite.
  if (health.consent) await run("UPDATE profiles SET health_consent_at = COALESCE(health_consent_at, ?) WHERE user_id = ?", [Date.now(), userId]);
  const consent = await one<{ ok: number }>("SELECT 1 AS ok FROM profiles WHERE user_id = ? AND health_consent_at IS NOT NULL", [userId]);
  const zones = consent && c.pain > 0 && health.zones.length ? JSON.stringify(health.zones) : null;
  // FC au réveil et VFC sont des mesures physiologiques : enregistrées seulement avec le même accord.
  const rhr = consent ? watch.rhr : null, hrv = consent ? watch.hrv : null;
  await run(
    `INSERT INTO checkins(user_id, date, sleep, legs, motivation, pain, note, pain_zones, sleep_h, rhr, hrv, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET sleep = excluded.sleep, legs = excluded.legs, motivation = excluded.motivation, pain = excluded.pain, note = excluded.note, pain_zones = excluded.pain_zones,
       sleep_h = excluded.sleep_h, rhr = excluded.rhr, hrv = excluded.hrv`,
    [userId, today, c.sleep, c.legs, c.motivation, c.pain, c.note ?? null, zones, watch.sleepH, rhr, hrv, Date.now()],
  );
  const [{ tl }, goal] = await Promise.all([loadState(userId, today), loadGoal(userId)]);
  const d = decide({ ...c, zones: zones ? health.zones : [], watch: await watchOf(userId, today, { sleep_h: watch.sleepH, rhr, hrv }) }, tl, today, goal?.date);
  const next = await one<PlanRow>("SELECT * FROM plan_sessions WHERE user_id = ? AND date = ? AND locked = 0 AND status IN ('planned', 'adapted')", [userId, addDays(today, 1)]);
  if (next) await applyVerdict(next, d.verdict);
  return d;
}

async function applyVerdict(p: PlanRow, v: Verdict) {
  const original: PlannedLike = p.original ? JSON.parse(p.original) : toPlanned(p);
  const target = adapt(original, v);
  const status = v === "ok" ? "planned" : "adapted";
  await run(
    "UPDATE plan_sessions SET title = ?, sport = ?, template = ?, duration_min = ?, rpe_target = ?, gain_m = ?, description = ?, status = ?, original = ?, updated_at = ? WHERE id = ?",
    [target.title, target.sport, target.template, target.durationMin, target.rpeTarget, target.gainM, target.description, status, v === "ok" ? null : JSON.stringify(original), Date.now(), p.id],
  );
}

/** Tout ce qu’il faut pour l’écran « Aujourd’hui ». */
export async function dashboard(userId: number, today: string) {
  await reconcile(userId, today);
  const [{ profile, acts, physio, tl }, goal, checkin, upcoming, planCount] = await Promise.all([
    loadState(userId, today),
    loadGoal(userId),
    one<CheckinRow>("SELECT date, sleep, legs, motivation, pain, note, pain_zones, sleep_h, rhr, hrv FROM checkins WHERE user_id = ? AND date = ?", [userId, today]),
    all<PlanRow>("SELECT * FROM plan_sessions WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date", [userId, today, addDays(today, 7)]),
    one<{ n: number }>("SELECT COUNT(*) AS n FROM plan_sessions WHERE user_id = ? AND date > ?", [userId, today]),
  ]);
  const decision = checkin ? decide({ ...checkin, zones: painZonesOf(checkin), watch: await watchOf(userId, today, checkin) }, tl, today, goal?.date) : null;
  const daysToGoal = goal ? diffDays(today, goal.date) : null;
  return {
    today,
    profile,
    goal: goal ? { name: goal.name, date: goal.date, distance_km: goal.distance_km, gain_m: goal.gain_m, daysToGoal, phase: upcoming[0]?.phase ?? phaseFor(daysToGoal), verdict: readPlanMeta(goal)?.verdict ?? null } : null,
    load: { atl: tl.atl, ctl: tl.ctl, form: tl.form, ratio: tl.ratio, monotony: tl.monotony, load7: tl.load7, calibrated: tl.calibrated, historyDays: tl.historyDays },
    checkin, decision,
    todayPlan: upcoming.find((p) => p.date === today) ?? null,
    tomorrowPlan: upcoming.find((p) => p.date === addDays(today, 1)) ?? null,
    upcoming,
    needsPlan: (planCount?.n ?? 0) === 0,
    recent: acts.slice(0, 6).map((a) => withLoad(a, physio)),
  };
}

export async function analysis(userId: number, today: string) {
  const { acts, physio, tl } = await loadState(userId, today);
  const likes = acts.map(toActivityLike);
  const bySport = new Map<string, number>();
  for (const a of acts.filter((x) => diffDays(x.date, today) < 28)) bySport.set(a.sport, (bySport.get(a.sport) ?? 0) + a.duration_min);
  // Cartes graphiques : minutes par niveau d’effort sur 28 jours, et score de récupération des 7 derniers check-ins.
  // Quand la sortie a été analysée seconde par seconde, on compte le temps réel dans chaque zone cardiaque
  // (Z1-Z2 facile, Z3 modéré, Z4-Z5 intense) ; sinon toute la séance va dans la case de son effort global.
  const intensity = { easy: 0, moderate: 0, hard: 0 };
  for (const a of acts.filter((x) => diffDays(x.date, today) < 28)) {
    const w = withLoad(a, physio);
    if (w.insight?.zones) { const z = w.insight.zones; intensity.easy += z[0] + z[1]; intensity.moderate += z[2]; intensity.hard += z[3] + z[4]; }
    else intensity[w.effort <= 4 ? "easy" : w.effort <= 6 ? "moderate" : "hard"] += Math.round(a.duration_min);
  }
  const checks = await all<{ date: string; sleep: number; legs: number; motivation: number; pain: number }>(
    "SELECT date, sleep, legs, motivation, pain FROM checkins WHERE user_id = ? AND date >= ? AND date <= ?", [userId, addDays(today, -6), today]);
  const recovery = range(addDays(today, -6), 7).map((date) => {
    const c = checks.find((x) => x.date === date);
    return { date, score: c ? Math.max(0, Math.min(100, Math.round(((c.sleep + c.legs + c.motivation - 3) / 12) * 100 - c.pain * 12))) : null };
  });
  return {
    intensity, recovery,
    points: tl.points.map((p) => ({ date: p.date, load: Math.round(p.load), atl: Math.round(p.atl), ctl: Math.round(p.ctl), form: Math.round(p.form) })),
    weeks: weeklySummary(likes, physio, today, 12),
    sports: Object.fromEntries(bySport),
    summary: { atl: tl.atl, ctl: tl.ctl, form: tl.form, ratio: tl.ratio, monotony: tl.monotony, calibrated: tl.calibrated, historyDays: tl.historyDays },
  };
}

export async function ownActivity(userId: number, id: number) {
  const a = await one<ActivityRow>("SELECT * FROM activities WHERE id = ? AND user_id = ?", [id, userId]);
  if (!a) throw new HttpError(404, "Séance introuvable.");
  return a;
}

// ---------- Mode imprévu ----------
export type AbsenceKind = "malade" | "blesse" | "deplacement";
export interface Absence { kind: AbsenceKind; start: string; end: string }
/** Période d’imprévu en cours ou à venir (on la garde 14 jours après la fin, le temps de la reprise). */
export async function loadAbsence(userId: number, today: string): Promise<Absence | null> {
  const a = await one<{ kind: AbsenceKind; start_date: string; end_date: string }>("SELECT kind, start_date, end_date FROM absences WHERE user_id = ?", [userId]);
  if (!a || addDays(a.end_date, 14) < today) return null;
  return { kind: a.kind, start: a.start_date, end: a.end_date };
}
/**
 * Réorganise le plan autour d’un imprévu :
 *  - malade ou blessé : aucune séance pendant la période ;
 *  - en déplacement : un footing court, si possible, à la place de chaque séance ;
 *  - reprise : 7 jours après une maladie (volume −30 %, pas d’intensité), 10 jours après une blessure
 *    (endurance seule, moitié du volume, sortie longue plafonnée à 45 min).
 * Le reste du plan se recalcule ensuite sur la charge réelle, qui aura baissé.
 */
export function applyAbsence<T extends { date: string; template: string; title: string; sport: string; durationMin: number; gainM: number | null; rpeTarget: number; description: string; phase: string }>(items: T[], a: Absence): T[] {
  const back = addDays(a.end, a.kind === "blesse" ? 10 : a.kind === "malade" ? 7 : 0);
  const out: T[] = [];
  for (const i of items) {
    if (i.template === "race") { out.push(i); continue; }
    if (i.date >= a.start && i.date <= a.end) {
      if (a.kind === "deplacement" && i.template !== "strength") out.push({ ...i, template: "easy", title: "Footing si possible", sport: "course", durationMin: Math.min(35, i.durationMin), gainM: null, rpeTarget: 3, description: "En déplacement : 25 à 35 min faciles si tu trouves le temps, sinon rien. Ce n’est pas une séance à rattraper." });
      continue;
    }
    if (i.date > a.end && i.date <= back) {
      if (a.kind === "malade") {
        const easy = i.template !== "long" && i.template !== "b2b" && i.template !== "easy";
        out.push({ ...i, template: easy ? "easy" : i.template, title: easy ? "Reprise : endurance" : i.title, durationMin: Math.max(25, Math.round((i.durationMin * 0.7) / 5) * 5), gainM: i.gainM ? Math.round(i.gainM * 0.6) : null, rpeTarget: Math.min(i.rpeTarget, 4),
          description: `Reprise après la maladie : tout en aisance respiratoire, sans intensité. ${easy ? "La séance prévue est remplacée par de l’endurance." : i.description}` });
      } else if (a.kind === "blesse") {
        if (i.template === "strength") { out.push(i); continue; }
        out.push({ ...i, template: "easy", title: "Reprise progressive", sport: i.sport === "velo" ? i.sport : "course", durationMin: Math.max(20, Math.min(45, Math.round((i.durationMin * 0.5) / 5) * 5)), gainM: null, rpeTarget: 3,
          description: "Reprise après blessure : terrain plat et souple, sans douleur. Si la douleur revient pendant ou le lendemain, arrête et refais un point ; si elle persiste, consulte un professionnel de santé." });
      } else out.push(i);
      continue;
    }
    out.push(i);
  }
  return out;
}

/** Les 14 derniers jours du plan, avec le prévu / réalisé de chaque séance faite. */
async function recentPast(userId: number, today: string, physio: { hrMax: number | null; hrRest: number | null }): Promise<Past[]> {
  const targets = trainingTargets(null, physio.hrMax, physio.hrRest);
  const rows = await all<PlanRow & { a_duration: number | null; a_gain: number | null; a_analysis: string | null }>(
    `SELECT p.*, a.duration_min AS a_duration, a.gain_m AS a_gain, a.analysis AS a_analysis FROM plan_sessions p LEFT JOIN activities a ON a.id = p.activity_id
     WHERE p.user_id = ? AND p.date >= ? AND p.date < ?`, [userId, addDays(today, -14), today]);
  return rows.map((p) => ({ date: p.date, template: p.template, status: p.status, duration: p.a_duration,
    review: p.status === "done" && p.a_duration != null ? reviewSession(p, { duration_min: p.a_duration, gain_m: p.a_gain }, parseAnalysis(p.a_analysis), targets, physio) : null }));
}

/** Ce que le plan apprend du prévu / réalisé, et si le coureur a choisi de garder le plan sans ajustement. */
export async function loadLearning(userId: number, today: string): Promise<{ learning: Learning; off: boolean; applied: string | null }> {
  const prof = await loadProfile(userId);
  const physio = { hrMax: prof.hr_max, hrRest: prof.hr_rest };
  const z = zoneBounds(physio);
  const [past, row] = await Promise.all([recentPast(userId, today, physio), one<{ sig: string; off: number }>("SELECT sig, off FROM plan_learning WHERE user_id = ?", [userId])]);
  return { learning: learn(past, today, z ? Math.round(z[1]) : null), off: !!row?.off, applied: row ? row.sig : null };
}

export async function setLearningOff(userId: number, today: string, off: boolean) {
  await run("INSERT INTO plan_learning(user_id, sig, off, updated_at) VALUES (?, '', ?, ?) ON CONFLICT(user_id) DO UPDATE SET off = excluded.off, updated_at = excluded.updated_at", [userId, off ? 1 : 0, Date.now()]);
  await regeneratePlan(userId, today);
}

/** Le plan suit la charge réelle : il se recalcule automatiquement chaque nouvelle semaine. */
export async function planView(userId: number, today: string) {
  await reconcile(userId, today);
  let goal = await loadGoal(userId);
  let meta = readPlanMeta(goal);
  if (goal && goal.date > today && (!meta || mondayOf(meta.generatedOn) < mondayOf(today) || meta.race.date !== goal.date || ((meta.verdict === "risque" || meta.verdict === "ambitieux") && !meta.diagnosis))) {
    await regeneratePlan(userId, today);
    goal = await loadGoal(userId);
    meta = readPlanMeta(goal);
  }
  // Nouveau signal du prévu / réalisé (séances manquées, footings trop rapides…) : le plan est réajusté.
  let lr = await loadLearning(userId, today);
  if (!lr.off && lr.learning.sig !== (lr.applied ?? "")) { await regeneratePlan(userId, today); goal = await loadGoal(userId); meta = readPlanMeta(goal); lr = { ...lr, applied: lr.learning.sig }; }
  const from = addDays(mondayOf(today), -7);
  const to = goal && goal.date > today ? goal.date : addDays(today, 21);
  const prof = await loadProfile(userId);
  const physio = { hrMax: prof.hr_max, hrRest: prof.hr_rest };
  const targets = trainingTargets(null, prof.hr_max, prof.hr_rest);
  const [sessions, done, races] = await Promise.all([
    all<PlanRow & { a_duration: number | null; a_distance: number | null; a_gain: number | null; a_name: string | null; a_analysis: string | null }>(
      `SELECT p.*, a.duration_min AS a_duration, a.distance_km AS a_distance, a.gain_m AS a_gain, a.name AS a_name, a.analysis AS a_analysis
       FROM plan_sessions p LEFT JOIN activities a ON a.id = p.activity_id
       WHERE p.user_id = ? AND p.date BETWEEN ? AND ? ORDER BY p.date`, [userId, from, to]),
    all<{ date: string; duration_min: number; sport: Sport }>("SELECT date, duration_min, sport FROM activities WHERE user_id = ? AND date >= ? AND date <= ?",
      [userId, meta?.weeks[0]?.monday ?? from, today]),
    loadSideRaces(userId),
  ]);
  const doneByWeek: Record<string, number> = {};
  for (const a of done) if (isFoot(a.sport)) { const m = mondayOf(a.date); doneByWeek[m] = Math.round((doneByWeek[m] ?? 0) + a.duration_min); }
  return {
    today,
    goal: goal ? { name: goal.name, date: goal.date, distance_km: goal.distance_km, gain_m: goal.gain_m, route: (() => { try { return goal.route ? JSON.parse(goal.route) : null; } catch { return null; } })() } : null,
    plan: goal && goal.date > today ? meta : null,
    // Prévu / réalisé : chaque séance faite est comparée à ce qui était prévu.
    sessions: sessions.map(({ a_analysis, ...p }) => ({
      ...p,
      review: p.status === "done" && p.a_duration != null ? reviewSession(p, { duration_min: p.a_duration, gain_m: p.a_gain }, parseAnalysis(a_analysis), targets, physio) : null,
    })),
    doneByWeek, races, absence: await loadAbsence(userId, today),
    learning: { items: lr.learning.items, off: lr.off },
  };
}
