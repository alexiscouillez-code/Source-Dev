import { json, withUser } from "@/lib/api";
import { estimateVo2 } from "@/lib/engine/vo2";
import { fmtPace, trainingTargets } from "@/lib/engine/paces";
import { trailProfile } from "@/lib/engine/trail-profile";
import { loadActivities, loadGoal, loadProfile, readPlanMeta, resolveToday, toActivityLike } from "@/lib/service";

/** Profil trail : points forts, points faibles et quoi travailler (comparé à la course choisie). */
export const GET = withUser(async (user, req) => {
  const today = resolveToday(new URL(req.url).searchParams.get("today"));
  const [rows, profile, goal] = await Promise.all([loadActivities(user.id, "0000-01-01"), loadProfile(user.id), loadGoal(user.id)]);
  const vo2 = estimateVo2(
    rows.map((r) => ({ date: r.date, sport: r.sport, durationMin: r.duration_min, distanceKm: r.distance_km, gainM: r.gain_m, avgHr: r.avg_hr, maxHr: r.max_hr, name: r.name })),
    today, { hrMax: profile.hr_max, hrRest: profile.hr_rest },
  );
  const vdot = vo2.method === "seances" ? vo2.value : null;
  const i = trainingTargets(vdot, vo2.hrMax, profile.hr_rest).paces.find((p) => p.key === "I");
  const meta = goal && goal.date > today ? readPlanMeta(goal) : null;
  let lossPerGain = 1;
  try { const r = goal?.route ? JSON.parse(goal.route) : null; if (r?.gainM) lossPerGain = r.lossM / r.gainM; } catch { /* tracé illisible */ }
  const tp = trailProfile(rows.map(toActivityLike), today, vdot,
    meta ? { longMin: meta.demands.longMin, weeklyMin: meta.demands.weeklyMin, weeklyGain: meta.demands.weeklyGain, lossPerGain } : null,
    i ? `${fmtPace(i.fast)}–${fmtPace(i.slow)}` : null);
  return json({ ...tp, race: meta ? { name: meta.race.name } : null });
});
