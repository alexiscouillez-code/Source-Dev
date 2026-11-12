import { json, withUser } from "@/lib/api";
import { estimateVo2 } from "@/lib/engine/vo2";
import { trailTime } from "@/lib/engine/planner";
import { loadCalibration } from "@/lib/calibration";
import { loadActivities, loadGoal, loadProfile, readPlanMeta, resolveToday, toVo2Run } from "@/lib/service";

/**
 * « Si la course était aujourd’hui » : temps estimé sur ta course, semaine après semaine, à partir de
 * l’évolution de ta VO2max. C’est ta capacité du jour, pas ce que tu feras après la préparation.
 */
export const GET = withUser(async (user, req) => {
  const today = resolveToday(new URL(req.url).searchParams.get("today"));
  const [rows, profile, goal] = await Promise.all([loadActivities(user.id, "0000-01-01"), loadProfile(user.id), loadGoal(user.id)]);
  if (!goal) return json({ goal: null, points: [] });
  const km = goal.distance_km ?? 25, gain = goal.gain_m ?? Math.round(km * 35);
  const vo2 = estimateVo2(rows.map(toVo2Run), today, { hrMax: profile.hr_max, hrRest: profile.hr_rest, watch: profile.vo2_watch });
  // Même calibrage personnel que l’estimation du plan (tes vraies courses).
  const c = (await loadCalibration(user.id, today)).factor;
  const points = vo2.weekly.map((w) => ({ date: w.date, vo2: w.value, minutes: Math.round(trailTime(w.value, km, gain) * c) }));
  const plan = readPlanMeta(goal);
  return json({
    goal: { name: goal.name, date: goal.date, km, gain, assumed: !goal.distance_km },
    points, current: vo2.paceVdot != null ? Math.round(trailTime(vo2.paceVdot, km, gain) * c) : null, calib: c,
    target: plan?.estimate ?? null, watch: vo2.watch != null,
  });
});
