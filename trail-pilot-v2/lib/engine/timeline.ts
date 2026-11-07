import { addDays, diffDays, mondayOf, range } from "./dates";
import { isFoot, sessionLoad, type ActivityLike, type Physio } from "./load";

/**
 * Fatigue (ATL, 7 j) et forme de fond (CTL, 42 j) en moyennes exponentielles.
 * Fraîcheur = CTL − ATL de la veille ; ratio = ATL / CTL.
 */
const ATL_K = 1 - Math.exp(-1 / 7);
const CTL_K = 1 - Math.exp(-1 / 42);

export interface DayPoint { date: string; load: number; atl: number; ctl: number; form: number }

export function timeline(activities: ActivityLike[], physio: Physio, today: string, days = 120) {
  const byDay = new Map<string, number>();
  for (const a of activities) byDay.set(a.date, (byDay.get(a.date) ?? 0) + sessionLoad(a, physio).total);
  const first = activities.reduce<string | null>((m, a) => (!m || a.date < m ? a.date : m), null);
  // On démarre le calcul au plus tôt 180 jours avant pour stabiliser la CTL.
  const start = first && diffDays(first, today) < 180 ? first : addDays(today, -179);
  // Démarrage à chaud : on part de la charge moyenne des 4 premières semaines plutôt que de zéro.
  const warm = range(start, 28).reduce((sum, d) => sum + (byDay.get(d) ?? 0), 0) / 28;
  let atl = warm, ctl = warm;
  const points: DayPoint[] = [];
  for (const d of range(start, diffDays(start, today) + 1)) {
    const form = ctl - atl;
    const load = byDay.get(d) ?? 0;
    atl += (load - atl) * ATL_K;
    ctl += (load - ctl) * CTL_K;
    points.push({ date: d, load, atl, ctl, form });
  }
  const last = points[points.length - 1];
  const last7 = points.slice(-7).map((p) => p.load);
  const mean7 = last7.reduce((s, v) => s + v, 0) / 7;
  const sd7 = Math.sqrt(last7.reduce((s, v) => s + (v - mean7) ** 2, 0) / 7);
  const historyDays = first ? diffDays(first, today) + 1 : 0;
  return {
    points: points.slice(-days),
    atl: Math.round(last?.atl ?? 0),
    ctl: Math.round(last?.ctl ?? 0),
    form: Math.round(last?.form ?? 0),
    ratio: last && last.ctl >= 5 ? last.atl / last.ctl : null,
    monotony: sd7 > 0 ? mean7 / sd7 : null,
    load7: Math.round(last7.reduce((s, v) => s + v, 0)),
    historyDays,
    calibrated: historyDays >= 28,
  };
}

export function weeklySummary(activities: ActivityLike[], physio: Physio, today: string, weeks = 12) {
  const start = addDays(mondayOf(today), -7 * (weeks - 1));
  const rows = Array.from({ length: weeks }, (_, i) => ({ week: addDays(start, i * 7), minutes: 0, km: 0, gain: 0, load: 0, sessions: 0 }));
  for (const a of activities) {
    const i = Math.floor(diffDays(start, a.date) / 7);
    if (i < 0 || i >= weeks) continue;
    const r = rows[i];
    r.minutes += a.durationMin; r.sessions += 1; r.load += sessionLoad(a, physio).total;
    if (isFoot(a.sport)) { r.km += a.distanceKm ?? 0; r.gain += a.gainM ?? 0; }
  }
  return rows.map((r) => ({ ...r, minutes: Math.round(r.minutes), km: Math.round(r.km * 10) / 10, gain: Math.round(r.gain), load: Math.round(r.load) }));
}
