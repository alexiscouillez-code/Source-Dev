import "server-only";
import { all, one } from "@/db/client";
import { addDays, mondayOf } from "./engine/dates";
import { parseAnalysis } from "./engine/streams";
import { decodePolyline } from "./polyline";
import type { TodayRun } from "./engine/today-run";

const FOOT = new Set(["course", "trail", "rando"]);

/** Distance en km entre deux points (formule de haversine) et cap en degrés (0 = nord). */
function geo(a: [number, number], b: [number, number]) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  const km = 2 * R * Math.asin(Math.sqrt(h));
  const y = Math.sin(dLon) * Math.cos(b[0] * rad), x = Math.cos(a[0] * rad) * Math.sin(b[0] * rad) - Math.sin(a[0] * rad) * Math.cos(b[0] * rad) * Math.cos(dLon);
  return { km, bearing: ((Math.atan2(y, x) / rad) + 360) % 360 };
}

/**
 * Données du bloc « Ma sortie du jour ». Chaque partie vaut null quand la donnée réelle manque :
 * l'écran affiche alors des données d'exemple, signalées comme telles.
 */
export async function todayRun(userId: number, today: string): Promise<TodayRun> {
  const monday = mondayOf(today);
  const [acts, plan, terrains] = await Promise.all([
    all<{ id: number; date: string; sport: string; name: string | null; duration_min: number; distance_km: number | null; gain_m: number | null; analysis: string | null; track: string | null }>(
      "SELECT id, date, sport, name, duration_min, distance_km, gain_m, analysis, track FROM activities WHERE user_id = ? AND COALESCE(check_state, 0) <> 1 AND date >= ? AND date <= ? ORDER BY date DESC, id DESC",
      [userId, addDays(monday, -7), today]),
    all<{ duration_min: number }>("SELECT duration_min FROM plan_sessions WHERE user_id = ? AND date >= ? AND date <= ? AND template <> 'race' AND sport <> 'renfo' AND status <> 'skipped'", [userId, monday, addDays(monday, 6)]),
    all<{ name: string; lat: number; lon: number }>("SELECT name, lat, lon FROM terrains WHERE user_id = ?", [userId]),
  ]);

  // Sortie : celle du jour, sinon la plus récente des 7 derniers jours (à pied, au moins 1 km).
  const foot = acts.filter((a) => FOOT.has(a.sport) && (a.distance_km ?? 0) >= 1);
  const r = foot.find((a) => a.date > addDays(today, -7)) ?? null;
  let run: TodayRun["run"] = null;
  if (r) {
    const an = parseAnalysis(r.analysis);
    const seconds = an?.moving && an.moving > 60 ? an.moving : r.duration_min * 60;
    run = {
      id: r.id, date: r.date, isToday: r.date === today, sport: r.sport,
      name: r.name ?? (r.sport === "trail" ? "Sortie trail" : r.sport === "rando" ? "Randonnée" : "Course à pied"),
      distanceKm: r.distance_km!, gainM: r.gain_m != null ? Math.round(r.gain_m) : null,
      paceSec: Math.round(seconds / r.distance_km!),
      profile: an?.alt ?? null,
    };
  }

  // D+ : moyenne des sorties à pied de la semaine dernière (lundi à dimanche).
  const last = foot.filter((a) => a.date >= addDays(monday, -7) && a.date < monday && a.gain_m != null);
  const gainRef = last.length ? { avg: Math.round(last.reduce((t, a) => t + a.gain_m!, 0) / last.length), count: last.length } : null;

  // Charge : temps réalisé depuis lundi sur le temps prévu par le plan pour toute la semaine.
  const planned = plan.reduce((t, p) => t + p.duration_min, 0);
  const done = acts.filter((a) => a.date >= monday).reduce((t, a) => t + a.duration_min, 0);
  const week = planned >= 30 ? { doneMin: Math.round(done), plannedMin: Math.round(planned), pct: Math.round((done / planned) * 100) } : null;

  // Prochain départ de sentier : le terrain enregistré le plus proche du départ de la dernière sortie avec une trace,
  // en écartant celui d'où tu es parti (moins de 300 m).
  let trailhead: TodayRun["trailhead"] = null;
  const withTrack = acts.find((a) => a.track);
  const start = withTrack ? decodePolyline(withTrack.track!)[0] : null;
  if (start && terrains.length) {
    const near = terrains.map((t) => ({ name: t.name, ...geo(start, [t.lat, t.lon]) })).filter((t) => t.km >= 0.3).sort((a, b) => a.km - b.km)[0];
    if (near) trailhead = { name: near.name, km: Math.round(near.km * 10) / 10, bearing: Math.round(near.bearing), from: withTrack!.name ?? "ta dernière sortie" };
  }
  const known = await one<{ n: number }>("SELECT COUNT(*) AS n FROM terrains WHERE user_id = ?", [userId]);
  return { run, gainRef, week, trailhead, hasTerrains: (known?.n ?? 0) > 0 };
}
