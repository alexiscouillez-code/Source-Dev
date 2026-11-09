import { body, HttpError, json, num, text, withUser } from "@/lib/api";
import { run } from "@/db/client";
import { regeneratePlan, resolveToday } from "@/lib/service";

const LEVELS = ["debutant", "regulier", "confirme"];

export const PUT = withUser(async (user, req) => {
  const b = await body(req);
  const level = String(b.level ?? "regulier");
  if (!LEVELS.includes(level)) throw new HttpError(400, "Niveau inconnu.");
  const hrMax = num(b.hrMax, 120, 230, "FC max", true), hrRest = num(b.hrRest, 30, 100, "FC repos", true);
  if (hrMax && hrRest && hrRest >= hrMax) throw new HttpError(400, "La FC de repos doit être inférieure à la FC max.");
  await run(
    `INSERT INTO profiles(user_id, hr_max, hr_rest, days_per_week, long_day, max_weekly_minutes, level, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET hr_max = excluded.hr_max, hr_rest = excluded.hr_rest, days_per_week = excluded.days_per_week,
       long_day = excluded.long_day, max_weekly_minutes = excluded.max_weekly_minutes, level = excluded.level, updated_at = excluded.updated_at`,
    [user.id, hrMax, hrRest, num(b.daysPerWeek, 2, 7, "Jours par semaine"), num(b.longDay, 0, 6, "Jour de sortie longue"), num(b.maxWeeklyMinutes, 60, 1800, "Temps max par semaine", true), level, Date.now()],
  );
  if (b.vo2Watch !== undefined) await run("UPDATE profiles SET vo2_watch = ? WHERE user_id = ?", [num(b.vo2Watch, 20, 95, "VO2max de la montre", true), user.id]);
  const name = text(b.name, 80);
  if (typeof b.name === "string") await run("UPDATE app_users SET name = ? WHERE id = ?", [name, user.id]);
  if (b.regenerate !== false) await regeneratePlan(user.id, resolveToday(typeof b.today === "string" ? b.today : null));
  return json({ ok: true });
});
