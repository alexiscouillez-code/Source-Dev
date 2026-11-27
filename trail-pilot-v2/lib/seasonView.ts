import "server-only";
import { all, one, run } from "@/db/client";
import { HttpError } from "./api";
import { loadCalibration } from "./calibration";
import { addDays, diffDays } from "./engine/dates";
import { MAX_PLAN_DAYS, raceDemands } from "./engine/planner";
import { cleanAnchor } from "./engine/race-anchor";
import { effortOf, recoveryDays, seasonWarnings, type MainRace } from "./engine/season";
import { estimateVo2 } from "./engine/vo2";
import { loadNextGoals, rollSeason } from "./season";
import { loadGoal, loadState, readAnchor, readPlanMeta, regeneratePlan, toVo2Run } from "./service";

/**
 * Vue de la saison : courses principales à venir (l'active, que le plan vise, puis les suivantes), temps estimé de chacune
 * avec la forme du moment, écarts trop courts, et périodes d'affûtage et de récupération pour la frise.
 */
export async function seasonView(userId: number, today: string) {
  if (await rollSeason(userId, today)) await regeneratePlan(userId, today);
  const [goal, next, last, sides, { profile, acts, tl }, calib] = await Promise.all([
    loadGoal(userId), loadNextGoals(userId),
    one<{ name: string; date: string; distance_km: number | null; gain_m: number | null }>("SELECT name, date, distance_km, gain_m FROM race_archive WHERE user_id = ? AND date < ? AND date >= ? ORDER BY date DESC LIMIT 1", [userId, today, addDays(today, -80)]),
    all<{ id: number; name: string; date: string; priority: string }>("SELECT id, name, date, priority FROM side_races WHERE user_id = ? AND date > ? ORDER BY date", [userId, today]),
    loadState(userId, today), loadCalibration(userId, today),
  ]);
  const chainedActive = goal ? (await one<{ chained: number | null }>("SELECT chained FROM goals WHERE user_id = ?", [userId]))?.chained === 1 : false;
  const vdot = estimateVo2(acts.map(toVo2Run), today, { hrMax: profile.hr_max, hrRest: profile.hr_rest, watch: profile.vo2_watch }).paceVdot;
  const est = (r: { name: string; date: string; distance_km: number | null; gain_m: number | null; anchor?: string | null }) => {
    const anchor = (() => { try { return r.anchor ? cleanAnchor(JSON.parse(r.anchor)) : null; } catch { return null; } })();
    const e = raceDemands({ name: r.name, date: r.date, distanceKm: r.distance_km, gainM: r.gain_m, anchor }, profile.level, tl.ctl, vdot, calib.factor).estimate;
    return { low: Math.round(e.low / 5) * 5, high: Math.round(e.high / 5) * 5 };
  };
  const races = [
    ...(goal && goal.date >= today ? [{
      key: "main", id: null as number | null, active: true, name: goal.name, date: goal.date, distanceKm: goal.distance_km, gainM: goal.gain_m, chained: chainedActive,
      hasRoute: !!goal.route, daysTo: diffDays(today, goal.date),
      estimate: (() => { const m = readPlanMeta(goal)?.estimate; return m ? { low: Math.round(m.low / 5) * 5, high: Math.round(m.high / 5) * 5 } : est({ ...goal, anchor: goal.anchor ?? null }); })(),
    }] : []),
    ...next.filter((n) => n.date >= today).map((n) => ({
      key: `next:${n.id}`, id: n.id, active: false, name: n.name, date: n.date, distanceKm: n.distance_km, gainM: n.gain_m, chained: n.chained === 1,
      hasRoute: !!n.route, daysTo: diffDays(today, n.date), estimate: est(n),
    })),
  ];
  const list: MainRace[] = [
    ...(last ? [{ key: "last", name: last.name, date: last.date, distanceKm: last.distance_km, gainM: last.gain_m }] : []),
    ...races.map((r) => ({ key: r.key, name: r.name, date: r.date, distanceKm: r.distanceKm, gainM: r.gainM, chained: r.chained })),
  ];
  // Frise : affûtage avant chaque course principale, récupération après (et après la dernière courue).
  const bands = [
    ...(last ? [{ kind: "recup" as const, from: addDays(last.date, 1), to: addDays(last.date, recoveryDays(effortOf(last.distance_km, last.gain_m))), label: `Récupération après ${last.name}` }] : []),
    ...races.flatMap((r) => {
      const e = effortOf(r.distanceKm, r.gainM);
      const taper = e >= 130 ? 21 : e >= 80 ? 14 : 7;
      return [
        { kind: "affutage" as const, from: addDays(r.date, -taper), to: addDays(r.date, -1), label: `Affûtage avant ${r.name}` },
        { kind: "recup" as const, from: addDays(r.date, 1), to: addDays(r.date, recoveryDays(e)), label: `Récupération après ${r.name}` },
      ];
    }),
  ].filter((b) => b.to >= today);
  return {
    today, races, warnings: seasonWarnings(list),
    last: last ? { name: last.name, date: last.date } : null,
    sides: sides.map((s) => ({ id: s.id, name: s.name, date: s.date, priority: s.priority === "C" ? "C" : "B" })),
    bands,
  };
}

const cleanRace = (b: Record<string, unknown>, today: string) => {
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 100) : "";
  if (!name) throw new HttpError(400, "Donne un nom à ta course.");
  const date = typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : "";
  if (!date) throw new HttpError(400, "Date de course invalide.");
  if (date <= today) throw new HttpError(400, "La course doit être dans le futur.");
  if (diffDays(today, date) > MAX_PLAN_DAYS) throw new HttpError(400, "Choisis une course dans les 13 prochains mois.");
  const nb = (v: unknown, min: number, max: number, label: string) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${label} : valeur attendue entre ${min} et ${max}.`);
    return n;
  };
  return { name, date, distanceKm: nb(b.distanceKm, 1, 400, "Distance"), gainM: nb(b.gainM, 0, 15000, "D+") };
};

/** Dates déjà prises : une course principale ou de préparation le même jour, ou à moins de 3 jours. */
async function checkFree(userId: number, date: string, exceptNext?: number) {
  const [goal, next, sides] = await Promise.all([
    one<{ date: string }>("SELECT date FROM goals WHERE user_id = ?", [userId]),
    all<{ id: number; date: string }>("SELECT id, date FROM next_goals WHERE user_id = ?", [userId]),
    all<{ date: string }>("SELECT date FROM side_races WHERE user_id = ?", [userId]),
  ]);
  const mains = [...(goal ? [goal.date] : []), ...next.filter((n) => n.id !== exceptNext).map((n) => n.date)];
  if (mains.includes(date)) throw new HttpError(400, "Une autre course principale est déjà prévue ce jour-là.");
  if (mains.some((d) => Math.abs(diffDays(d, date)) < 7)) throw new HttpError(400, "Une autre course principale est prévue la même semaine.");
  if (sides.some((s) => Math.abs(diffDays(s.date, date)) < 3)) throw new HttpError(400, "Une course de préparation est prévue à moins de 3 jours.");
  if (next.length >= 6) throw new HttpError(400, "6 courses principales à venir au plus : passe-en certaines en objectif secondaire.");
}

/** Ajoute une course principale ; si c'est la plus proche, elle devient la course active et le plan la vise. */
export async function addMainRace(userId: number, today: string, b: Record<string, unknown>) {
  const r = cleanRace(b, today);
  await checkFree(userId, r.date);
  const anchor = cleanAnchor(b.anchor);
  await run("INSERT INTO next_goals(user_id, name, date, distance_km, gain_m, anchor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [userId, r.name, r.date, r.distanceKm, r.gainM, anchor ? JSON.stringify(anchor) : null, Date.now()]);
  const changed = await rollSeason(userId, today);
  await regeneratePlan(userId, today);
  return { active: changed };
}

export async function updateMainRace(userId: number, today: string, b: Record<string, unknown>) {
  // Enchaînement accepté (écart court) : sur la course active ou une suivante.
  if (typeof b.chained === "boolean" && (b.key === "main" || b.id == null)) {
    await run("UPDATE goals SET chained = ? WHERE user_id = ?", [b.chained ? 1 : 0, userId]);
    return { ok: true };
  }
  const id = Number(b.id);
  const row = await one<{ id: number; name: string; date: string; distance_km: number | null; gain_m: number | null }>("SELECT id, name, date, distance_km, gain_m FROM next_goals WHERE id = ? AND user_id = ?", [id, userId]);
  if (!row) throw new HttpError(404, "Course inconnue.");
  if (typeof b.chained === "boolean" && b.name === undefined) {
    await run("UPDATE next_goals SET chained = ? WHERE id = ?", [b.chained ? 1 : 0, id]);
    return { ok: true };
  }
  const r = cleanRace({ name: b.name ?? row.name, date: b.date ?? row.date, distanceKm: b.distanceKm !== undefined ? b.distanceKm : row.distance_km, gainM: b.gainM !== undefined ? b.gainM : row.gain_m }, today);
  if (r.date !== row.date) await checkFree(userId, r.date, id);
  await run("UPDATE next_goals SET name = ?, date = ?, distance_km = ?, gain_m = ? WHERE id = ?", [r.name, r.date, r.distanceKm, r.gainM, id]);
  if (await rollSeason(userId, today)) await regeneratePlan(userId, today);
  return { ok: true };
}

export async function removeMainRace(userId: number, today: string, id: number) {
  const { changes } = await run("DELETE FROM next_goals WHERE id = ? AND user_id = ?", [id, userId]);
  if (!changes) throw new HttpError(404, "Course inconnue.");
  return { ok: true, today };
}

/** Une course principale devient objectif secondaire (B) : intégrée au plan de la course principale qui la suit. */
export async function demoteToB(userId: number, today: string, key: string) {
  let r: { name: string; date: string; distance_km: number | null; gain_m: number | null; place: string | null } | undefined | null;
  if (key === "main") {
    r = await one("SELECT name, date, distance_km, gain_m, place FROM goals WHERE user_id = ?", [userId]);
    if (!r) throw new HttpError(404, "Course inconnue.");
    const next = await loadNextGoals(userId);
    if (!next.some((n) => n.date > r!.date)) throw new HttpError(400, "C’est ta seule course principale : garde-la, ou choisis-en une autre avant.");
    await run("DELETE FROM goals WHERE user_id = ?", [userId]);
  } else {
    const id = Number(key.replace("next:", ""));
    r = await one("SELECT name, date, distance_km, gain_m, place FROM next_goals WHERE id = ? AND user_id = ?", [id, userId]);
    if (!r) throw new HttpError(404, "Course inconnue.");
    await run("DELETE FROM next_goals WHERE id = ?", [id]);
  }
  await run("INSERT INTO side_races(user_id, name, date, distance_km, gain_m, priority, place, created_at) VALUES (?, ?, ?, ?, ?, 'B', ?, ?)",
    [userId, r.name, r.date, r.distance_km, r.gain_m, r.place, Date.now()]);
  await rollSeason(userId, today);
  await regeneratePlan(userId, today);
  return { ok: true };
}

export { readAnchor };
