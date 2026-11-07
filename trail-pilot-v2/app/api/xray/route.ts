import { json, withUser } from "@/lib/api";
import { addDays } from "@/lib/engine/dates";
import { legsReading, raceGap } from "@/lib/engine/legs";
import { loadActivities, loadGoal, painZonesOf, resolveToday, toActivityLike } from "@/lib/service";
import { all } from "@/db/client";

/** X-Ray : sollicitation des jambes zone par zone, relative à la moyenne du coureur. */
export const GET = withUser(async (user, req) => {
  const url = new URL(req.url);
  const today = resolveToday(url.searchParams.get("today"));
  const period = url.searchParams.get("period") === "28" ? 28 : 7;
  const [rows, goal, checks] = await Promise.all([
    loadActivities(user.id, addDays(today, -90)), loadGoal(user.id),
    all<{ date: string; pain: number; pain_zones: string | null }>("SELECT date, pain, pain_zones FROM checkins WHERE user_id = ? AND date >= ? AND pain > 0 AND pain_zones IS NOT NULL ORDER BY date DESC", [user.id, addDays(today, -14)]),
  ]);
  // Douleurs signalées au check-in ces 14 derniers jours (avec accord santé), la plus récente par zone.
  const pains: Record<string, { date: string; level: number; count: number }> = {};
  for (const c of checks) for (const z of painZonesOf(c)) {
    if (pains[z]) pains[z].count++; else pains[z] = { date: c.date, level: c.pain, count: 1 };
  }
  const acts = rows.map((r) => ({ ...toActivityLike(r), name: r.name }));
  const upcoming = goal && goal.date > today ? goal : null;
  return json({
    today,
    reading: legsReading(acts, today, period),
    pains,
    race: upcoming ? { name: upcoming.name, date: upcoming.date, gap: raceGap(acts, today, { distanceKm: upcoming.distance_km, gainM: upcoming.gain_m }) } : null,
  });
});
