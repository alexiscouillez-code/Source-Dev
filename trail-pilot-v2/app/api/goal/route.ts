import { body, HttpError, isoDate, json, num, text, withUser } from "@/lib/api";
import { run } from "@/db/client";
import { regeneratePlan, resolveToday } from "@/lib/service";
import { diffDays } from "@/lib/engine/dates";
import { MAX_PLAN_DAYS } from "@/lib/engine/planner";

export const PUT = withUser(async (user, req) => {
  const b = await body(req);
  const name = text(b.name, 100);
  if (!name) throw new HttpError(400, "Donne un nom à ta course.");
  const date = isoDate(b.date, "Date de course");
  const today = resolveToday(typeof b.today === "string" ? b.today : null);
  if (date <= today) throw new HttpError(400, "La course doit être dans le futur.");
  if (diffDays(today, date) > MAX_PLAN_DAYS) throw new HttpError(400, "Choisis une course dans les 13 prochains mois.");
  await run(
    `INSERT INTO goals(user_id, name, date, distance_km, gain_m, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET plan_meta = NULL, route = CASE WHEN goals.name = excluded.name AND goals.date = excluded.date THEN goals.route ELSE NULL END, place = CASE WHEN goals.name = excluded.name THEN goals.place ELSE NULL END, name = excluded.name, date = excluded.date, distance_km = excluded.distance_km, gain_m = excluded.gain_m, updated_at = excluded.updated_at`,
    [user.id, name, date, num(b.distanceKm, 1, 400, "Distance", true), num(b.gainM, 0, 15000, "D+", true), Date.now()],
  );
  await regeneratePlan(user.id, today);
  return json({ ok: true });
});

export const DELETE = withUser(async (user, req) => {
  await run("DELETE FROM goals WHERE user_id = ?", [user.id]);
  await regeneratePlan(user.id, resolveToday(new URL(req.url).searchParams.get("today")));
  return json({ ok: true });
});
