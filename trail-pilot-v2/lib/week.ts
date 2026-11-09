import "server-only";
import { all } from "@/db/client";
import { addDays, mondayOf, range, weekday } from "./engine/dates";
import { dashboard } from "./service";

/** Bilan d’une semaine (lundi → dimanche) : volume réalisé, séances du plan, forme et semaine suivante. */
export interface WeekSummary {
  monday: string; sunday: string; isCurrent: boolean;
  totals: { minutes: number; km: number; gain: number; count: number };
  previous: { minutes: number; km: number; gain: number };
  days: { date: string; minutes: number; gain: number }[];
  plan: { planned: number; done: number; skipped: number };
  best: { name: string | null; date: string; minutes: number; km: number | null; gain: number | null } | null;
  form: number; ctl: number;
  next: { sessions: number; minutes: number; gain: number; key: { title: string; date: string; minutes: number } | null };
  goal: { name: string; daysToGoal: number | null } | null;
}

/** Le bilan s’affiche du dimanche au mardi : la semaine en cours le dimanche, la précédente ensuite. */
export const summaryMonday = (today: string) => (weekday(today) === 6 ? mondayOf(today) : mondayOf(addDays(today, -7)));

async function volume(userId: number, from: string, to: string) {
  return all<{ date: string; name: string | null; duration_min: number; distance_km: number | null; gain_m: number | null }>(
    "SELECT date, name, duration_min, distance_km, gain_m FROM activities WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date", [userId, from, to]);
}
const sum = (rows: { duration_min: number; distance_km: number | null; gain_m: number | null }[]) => ({
  minutes: Math.round(rows.reduce((t, r) => t + r.duration_min, 0)),
  km: Math.round(rows.reduce((t, r) => t + (r.distance_km ?? 0), 0) * 10) / 10,
  gain: Math.round(rows.reduce((t, r) => t + (r.gain_m ?? 0), 0)),
});

export async function weekSummary(userId: number, today: string, monday = summaryMonday(today)): Promise<WeekSummary> {
  const sunday = addDays(monday, 6), nextMon = addDays(monday, 7);
  const [acts, prev, plan, next, d] = await Promise.all([
    volume(userId, monday, sunday),
    volume(userId, addDays(monday, -7), addDays(monday, -1)),
    all<{ status: string; template: string }>("SELECT status, template FROM plan_sessions WHERE user_id = ? AND date >= ? AND date <= ?", [userId, monday, sunday]),
    all<{ title: string; date: string; duration_min: number; gain_m: number | null; template: string }>(
      "SELECT title, date, duration_min, gain_m, template FROM plan_sessions WHERE user_id = ? AND date >= ? AND date <= ? AND status IN ('planned', 'adapted') ORDER BY date", [userId, nextMon, addDays(nextMon, 6)]),
    dashboard(userId, today),
  ]);
  const counted = plan.filter((p) => p.template !== "race");
  const best = [...acts].sort((a, b) => b.duration_min - a.duration_min)[0] ?? null;
  const key = [...next].filter((s) => s.template !== "strength").sort((a, b) => b.duration_min - a.duration_min)[0] ?? null;
  return {
    monday, sunday, isCurrent: today <= sunday,
    totals: { ...sum(acts), count: acts.length },
    previous: sum(prev),
    days: range(monday, 7).map((date) => { const r = acts.filter((a) => a.date === date); return { date, minutes: Math.round(r.reduce((t, a) => t + a.duration_min, 0)), gain: Math.round(r.reduce((t, a) => t + (a.gain_m ?? 0), 0)) }; }),
    plan: { planned: counted.filter((p) => p.status !== "skipped").length, done: counted.filter((p) => p.status === "done").length, skipped: counted.filter((p) => p.status === "skipped").length },
    best: best ? { name: best.name, date: best.date, minutes: Math.round(best.duration_min), km: best.distance_km, gain: best.gain_m } : null,
    form: d.load.form, ctl: d.load.ctl,
    next: { sessions: next.length, minutes: Math.round(next.reduce((t, s) => t + s.duration_min, 0)), gain: Math.round(next.reduce((t, s) => t + (s.gain_m ?? 0), 0)), key: key ? { title: key.title, date: key.date, minutes: key.duration_min } : null },
    goal: d.goal ? { name: d.goal.name, daysToGoal: d.goal.daysToGoal } : null,
  };
}
