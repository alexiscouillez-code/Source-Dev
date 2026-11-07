import { json, withUser } from "@/lib/api";
import { estimateVo2 } from "@/lib/engine/vo2";
import { loadActivities, loadProfile, resolveToday } from "@/lib/service";

/** VO2max estimée à partir de tout l’historique des sorties avec fréquence cardiaque. */
export const GET = withUser(async (user, req) => {
  const today = resolveToday(new URL(req.url).searchParams.get("today"));
  const [rows, profile] = await Promise.all([loadActivities(user.id, "0000-01-01"), loadProfile(user.id)]);
  const runs = rows.map((r) => ({ date: r.date, sport: r.sport, durationMin: r.duration_min, distanceKm: r.distance_km, gainM: r.gain_m, avgHr: r.avg_hr, maxHr: r.max_hr, name: r.name }));
  return json(estimateVo2(runs, today, { hrMax: profile.hr_max, hrRest: profile.hr_rest }));
});
