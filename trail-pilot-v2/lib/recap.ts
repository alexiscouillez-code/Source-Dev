import "server-only";
import { all } from "@/db/client";
import { addDays, diffDays, range } from "./engine/dates";
import { loadState } from "./service";
import { pastRaces, raceActivity } from "./debrief";

/** Bilan d'un mois : volume, jours actifs, série, plus belles sorties, forme et courses. */
export interface MonthRecap {
  month: string; label: string; partial: boolean;
  days: { date: string; minutes: number; km: number; gain: number }[];
  totals: { minutes: number; km: number; gain: number; count: number; activeDays: number };
  previous: { minutes: number; km: number; gain: number; count: number };
  sports: { sport: string; minutes: number; count: number }[];
  longest: { id: number; name: string | null; date: string; km: number | null; gain: number | null; minutes: number; sport: string } | null;
  climb: { id: number; name: string | null; date: string; gain: number } | null;
  streak: number;
  form: { start: number; end: number } | null;
  races: { name: string; date: string; durationMin: number | null }[];
}

const FOOT = new Set(["trail", "course", "rando"]);
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const lastDay = (month: string) => { const d = new Date(`${month}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
export const prevMonth = (month: string) => { const d = new Date(`${month}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };
/** Mois à montrer par défaut : le précédent pendant les 5 premiers jours d'un mois, sinon le mois en cours. */
export const defaultMonth = (today: string) => (Number(today.slice(8, 10)) <= 5 ? prevMonth(today.slice(0, 7)) : today.slice(0, 7));

export async function monthRecap(userId: number, today: string, month: string): Promise<MonthRecap> {
  const first = `${month}-01`, last = lastDay(month), end = last < today ? last : today;
  const pFirst = `${prevMonth(month)}-01`, pLast = addDays(first, -1);
  const [acts, prev, state, races] = await Promise.all([
    all<{ id: number; date: string; name: string | null; sport: string; duration_min: number; distance_km: number | null; gain_m: number | null }>(
      "SELECT id, date, name, sport, duration_min, distance_km, gain_m FROM activities WHERE user_id = ? AND COALESCE(check_state, 0) <> 1 AND date >= ? AND date <= ? ORDER BY date", [userId, first, end]),
    all<{ duration_min: number; distance_km: number | null; gain_m: number | null }>(
      "SELECT duration_min, distance_km, gain_m FROM activities WHERE user_id = ? AND COALESCE(check_state, 0) <> 1 AND date >= ? AND date <= ?", [userId, pFirst, pLast]),
    diffDays(end, today) <= 110 ? loadState(userId, today) : null,
    pastRaces(userId, today, first),
  ]);
  const sum = (rows: { duration_min: number; distance_km: number | null; gain_m: number | null }[]) => ({
    minutes: Math.round(rows.reduce((t, r) => t + r.duration_min, 0)),
    km: Math.round(rows.reduce((t, r) => t + (r.distance_km ?? 0), 0) * 10) / 10,
    gain: Math.round(rows.reduce((t, r) => t + (r.gain_m ?? 0), 0)),
    count: rows.length,
  });
  const days = range(first, diffDays(first, last) + 1).map((date) => {
    const r = acts.filter((a) => a.date === date);
    return { date, minutes: Math.round(r.reduce((t, a) => t + a.duration_min, 0)), km: Math.round(r.reduce((t, a) => t + (a.distance_km ?? 0), 0) * 10) / 10, gain: Math.round(r.reduce((t, a) => t + (a.gain_m ?? 0), 0)) };
  });
  let streak = 0, run = 0;
  for (const d of days) { if (d.date > end) break; run = d.minutes > 0 ? run + 1 : 0; streak = Math.max(streak, run); }
  const bySport = new Map<string, { minutes: number; count: number }>();
  for (const a of acts) { const x = bySport.get(a.sport) ?? { minutes: 0, count: 0 }; x.minutes += a.duration_min; x.count++; bySport.set(a.sport, x); }
  const foot = acts.filter((a) => FOOT.has(a.sport) && a.distance_km);
  const longest = (foot.length ? [...foot].sort((a, b) => (b.distance_km ?? 0) - (a.distance_km ?? 0)) : [...acts].sort((a, b) => b.duration_min - a.duration_min))[0] ?? null;
  const climb = [...acts].filter((a) => (a.gain_m ?? 0) > 0).sort((a, b) => (b.gain_m ?? 0) - (a.gain_m ?? 0))[0] ?? null;
  let form: MonthRecap["form"] = null;
  if (state) {
    const pts = state.tl.points;
    const at = (d: string) => pts.find((p) => p.date === d) ?? null;
    const s0 = at(addDays(first, -1)) ?? at(first), s1 = at(end);
    if (s0 && s1) form = { start: Math.round(s0.ctl), end: Math.round(s1.ctl) };
  }
  const inMonth = races.filter((r) => r.date >= first && r.date <= end);
  const raceRows = [];
  for (const r of inMonth) raceRows.push({ name: r.name, date: r.date, durationMin: (await raceActivity(userId, r.date))?.duration_min ?? null });
  return {
    month, label: `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`, partial: end < last,
    days, totals: { ...sum(acts), activeDays: days.filter((d) => d.minutes > 0).length }, previous: sum(prev),
    sports: [...bySport.entries()].map(([sport, v]) => ({ sport, minutes: Math.round(v.minutes), count: v.count })).sort((a, b) => b.minutes - a.minutes),
    longest: longest ? { id: longest.id, name: longest.name, date: longest.date, km: longest.distance_km, gain: longest.gain_m, minutes: Math.round(longest.duration_min), sport: longest.sport } : null,
    climb: climb ? { id: climb.id, name: climb.name, date: climb.date, gain: Math.round(climb.gain_m!) } : null,
    streak, form, races: raceRows,
  };
}
