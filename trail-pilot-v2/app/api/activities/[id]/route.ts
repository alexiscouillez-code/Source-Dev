import { body, json, num, withUser } from "@/lib/api";
import { run } from "@/db/client";
import { ownActivity, resolveToday } from "@/lib/service";
import { parseActivity } from "@/lib/activity-input";

export const PATCH = withUser(async (user, req, ctx) => {
  const id = Number((await ctx.params).id);
  const current = await ownActivity(user.id, id);
  const b = await body(req);
  if (current.source === "strava") {
    // Les données Strava font foi : seul le ressenti est modifiable.
    await run("UPDATE activities SET rpe = ?, updated_at = ? WHERE id = ?", [num(b.rpe, 1, 10, "Ressenti", true), Date.now(), id]);
  } else {
    const a = parseActivity({ ...current, durationMin: current.duration_min, distanceKm: current.distance_km, gainM: current.gain_m, lossM: current.loss_m, avgHr: current.avg_hr, ...b }, resolveToday(null));
    await run("UPDATE activities SET date = ?, sport = ?, name = ?, duration_min = ?, distance_km = ?, gain_m = ?, loss_m = ?, avg_hr = ?, rpe = ?, updated_at = ? WHERE id = ?",
      [a.date, a.sport, a.name, a.duration, a.distance, a.gain, a.loss, a.avgHr, a.rpe, Date.now(), id]);
  }
  return json({ ok: true });
});

export const DELETE = withUser(async (user, _req, ctx) => {
  const id = Number((await ctx.params).id);
  await ownActivity(user.id, id);
  await run("UPDATE plan_sessions SET status = 'planned', activity_id = NULL WHERE activity_id = ? AND user_id = ?", [id, user.id]);
  await run("DELETE FROM activities WHERE id = ? AND user_id = ?", [id, user.id]);
  return json({ ok: true });
});
