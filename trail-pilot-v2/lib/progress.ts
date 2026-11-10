import "server-only";
import { all, one } from "@/db/client";
import { addDays } from "./engine/dates";
import { decodePolyline } from "./polyline";
import { dist } from "./terrain/graph";
import { parseAnalysis } from "./engine/streams";

/** Progression : volume mois par mois, records personnels et chronos sur les boucles courues plusieurs fois. */
export interface Progress {
  months: { month: string; minutes: number; km: number; gain: number; count: number }[];
  records: { label: string; value: string; date: string; name: string | null }[];
  loops: { name: string; km: number; gain: number | null; runs: number; best: { minutes: number; date: string }; last: { minutes: number; date: string }; first: { minutes: number; date: string } }[];
  races: { name: string; date: string; km: number | null; gain: number | null; minutes: number | null }[];
}

const fmtH = (m: number) => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")}`;
const fr = (n: number, d = 0) => n.toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d });

export async function progress(userId: number, today: string): Promise<Progress> {
  const since = addDays(today, -366).slice(0, 7) + "-01";
  const [rows, all12, sides, goal] = await Promise.all([
    all<{ id: number; date: string; name: string | null; sport: string; duration_min: number; distance_km: number | null; gain_m: number | null; track: string | null; analysis: string | null }>(
      "SELECT id, date, name, sport, duration_min, distance_km, gain_m, track, analysis FROM activities WHERE user_id = ? ORDER BY date", [userId]),
    all<{ month: string; minutes: number; km: number; gain: number; count: number }>(
      "SELECT substr(date, 1, 7) AS month, ROUND(SUM(duration_min)) AS minutes, ROUND(SUM(COALESCE(distance_km, 0)), 1) AS km, ROUND(SUM(COALESCE(gain_m, 0))) AS gain, COUNT(*) AS count FROM activities WHERE user_id = ? AND date >= ? GROUP BY month ORDER BY month",
      [userId, since]),
    all<{ name: string; date: string; distance_km: number | null; gain_m: number | null }>("SELECT name, date, distance_km, gain_m FROM side_races WHERE user_id = ? AND date <= ? ORDER BY date DESC", [userId, today]),
    one<{ name: string; date: string; distance_km: number | null; gain_m: number | null }>("SELECT name, date, distance_km, gain_m FROM goals WHERE user_id = ? AND date <= ?", [userId, today]),
  ]);
  // Mois sans activité inclus, pour une courbe continue.
  const months: Progress["months"] = [];
  for (let d = new Date(`${since}T12:00:00Z`); d.toISOString().slice(0, 7) <= today.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) {
    const k = d.toISOString().slice(0, 7);
    months.push(all12.find((m) => m.month === k) ?? { month: k, minutes: 0, km: 0, gain: 0, count: 0 });
  }

  const runs = rows.filter((r) => r.sport === "course" || r.sport === "trail");
  const records: Progress["records"] = [];
  const top = <T,>(list: T[], f: (x: T) => number) => list.reduce<T | null>((b, x) => (b == null || f(x) > f(b) ? x : b), null);
  const longest = top(runs.filter((r) => r.distance_km), (r) => r.distance_km!);
  if (longest) records.push({ label: "Plus longue sortie", value: `${fr(longest.distance_km!, 1)} km`, date: longest.date, name: longest.name });
  const longTime = top(rows, (r) => r.duration_min);
  if (longTime) records.push({ label: "Plus long effort", value: fmtH(longTime.duration_min), date: longTime.date, name: longTime.name });
  const climb = top(rows.filter((r) => r.gain_m), (r) => r.gain_m!);
  if (climb) records.push({ label: "Plus gros D+", value: `${fr(climb.gain_m!)} m`, date: climb.date, name: climb.name });
  const fast10 = top(runs.filter((r) => r.distance_km && r.distance_km >= 9.8 && (r.gain_m ?? 0) / (r.distance_km * 1000) < 0.02), (r) => (r.distance_km! / r.duration_min));
  if (fast10) { const p = fast10.duration_min / fast10.distance_km!; records.push({ label: "Allure la plus rapide (≥ 10 km, plat)", value: `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, "0")} /km`, date: fast10.date, name: fast10.name }); }
  // Meilleurs efforts tirés de l’analyse seconde par seconde (le meilleur 1 km peut se trouver au milieu d’une sortie longue).
  const mmss = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
  const bests: Record<"k1" | "k5" | "k10" | "vam", { v: number; date: string; name: string | null } | null> = { k1: null, k5: null, k10: null, vam: null };
  for (const r of runs) {
    const b = parseAnalysis(r.analysis)?.best; if (!b) continue;
    for (const k of ["k1", "k5", "k10"] as const) { const v = b[k]; if (v != null && (!bests[k] || v < bests[k]!.v)) bests[k] = { v, date: r.date, name: r.name }; }
    if (b.vam != null && (!bests.vam || b.vam > bests.vam.v)) bests.vam = { v: b.vam, date: r.date, name: r.name };
  }
  for (const [k, label] of [["k1", "Meilleur 1 km"], ["k5", "Meilleur 5 km"], ["k10", "Meilleur 10 km"]] as const) { const b = bests[k]; if (b) records.push({ label, value: mmss(b.v), date: b.date, name: b.name }); }
  if (bests.vam) records.push({ label: "Meilleure montée (10 min)", value: `${fr(bests.vam.v)} m/h`, date: bests.vam.date, name: bests.vam.name });
  const bestMonth = top(all12, (m) => m.km);
  if (bestMonth && bestMonth.km > 0) records.push({ label: "Plus gros mois", value: `${fr(bestMonth.km, 0)} km · ${fr(bestMonth.gain)} m D+`, date: `${bestMonth.month}-01`, name: null });

  // Boucles courues plusieurs fois : départ et arrivée proches, distance et D+ semblables.
  type G = { name: string | null; s: [number, number]; km: number; gain: number | null; list: { minutes: number; date: string }[] };
  const groups: G[] = [];
  for (const r of runs) {
    if (!r.track || !r.distance_km || r.distance_km < 3) continue;
    let pts: [number, number][];
    try { pts = decodePolyline(r.track); } catch { continue; }
    if (pts.length < 10) continue;
    const s = pts[0], e = pts[pts.length - 1];
    if (dist(s[0], s[1], e[0], e[1]) > 400) continue;
    const g = groups.find((o) => dist(o.s[0], o.s[1], s[0], s[1]) < 350 && Math.abs(o.km - r.distance_km!) / r.distance_km! < 0.06 && Math.abs((o.gain ?? 0) - (r.gain_m ?? 0)) <= Math.max(40, (r.gain_m ?? 0) * 0.12));
    if (g) { g.list.push({ minutes: r.duration_min, date: r.date }); if (!g.name && r.name) g.name = r.name; }
    else groups.push({ name: r.name, s, km: r.distance_km, gain: r.gain_m, list: [{ minutes: r.duration_min, date: r.date }] });
  }
  const loops = groups.filter((g) => g.list.length >= 2).sort((a, b) => b.list.length - a.list.length).slice(0, 8).map((g) => {
    const byTime = [...g.list].sort((a, b) => a.minutes - b.minutes);
    return { name: g.name ?? `Boucle de ${fr(g.km, 1)} km`, km: Math.round(g.km * 10) / 10, gain: g.gain, runs: g.list.length, best: byTime[0], last: g.list[g.list.length - 1], first: g.list[0] };
  });

  // Courses passées : chrono pris sur la sortie enregistrée le même jour.
  const races = [...(goal ? [goal] : []), ...sides].map((c) => {
    const act = rows.filter((r) => r.date === c.date).sort((a, b) => b.duration_min - a.duration_min)[0];
    return { name: c.name, date: c.date, km: act?.distance_km ?? c.distance_km, gain: act?.gain_m ?? c.gain_m, minutes: act ? Math.round(act.duration_min) : null };
  }).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  return { months, records, loops, races };
}
