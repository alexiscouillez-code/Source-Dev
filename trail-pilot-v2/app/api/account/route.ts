import { all, run } from "@/db/client";
import { destroySession } from "@/lib/auth";
import { json, withUser } from "@/lib/api";
import { unlink } from "@/lib/strava";

/** Export RGPD : toutes les données du compte, sans les jetons. */
export const GET = withUser(async (user) => {
  const [profile, goal, activities, checkins, plan, sideRaces, coach, terrains, dayNotes, shoes, absences, raceDebriefs] = await Promise.all([
    all("SELECT user_id, level, days_per_week, long_day, max_weekly_minutes, hr_max, hr_rest, reminder, onboarded_at, health_consent_at, updated_at FROM profiles WHERE user_id = ?", [user.id]),
    all("SELECT * FROM goals WHERE user_id = ?", [user.id]),
    all("SELECT * FROM activities WHERE user_id = ? ORDER BY date", [user.id]),
    all("SELECT * FROM checkins WHERE user_id = ? ORDER BY date", [user.id]),
    all("SELECT * FROM plan_sessions WHERE user_id = ? ORDER BY date", [user.id]),
    all("SELECT * FROM side_races WHERE user_id = ? ORDER BY date", [user.id]),
    all("SELECT role, content, at FROM coach_messages WHERE user_id = ? ORDER BY at", [user.id]),
    all("SELECT id, kind, name, note, lat, lon, data, created_at FROM terrains WHERE user_id = ? ORDER BY created_at", [user.id]),
    all("SELECT date, note, signals, updated_at FROM day_notes WHERE user_id = ? ORDER BY date", [user.id]),
    all("SELECT * FROM shoes WHERE user_id = ? ORDER BY created_at", [user.id]),
    all("SELECT kind, start_date, end_date FROM absences WHERE user_id = ?", [user.id]),
    all("SELECT race_key, planned, rpe, tags, note, updated_at FROM race_debriefs WHERE user_id = ?", [user.id]),
  ]);
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), user, profile: profile[0] ?? null, goal: goal[0] ?? null, activities, checkins, dayNotes, plan, sideRaces, coach, terrains, shoes, absences, raceDebriefs }, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="trail-pilot-export.json"` },
  });
});

export const DELETE = withUser(async (user) => {
  await unlink(user.id);
  await run("UPDATE feedback SET user_id = NULL WHERE user_id = ?", [user.id]);
  for (const t of ["race_debriefs", "day_notes", "shoes", "absences", "plan_learning", "plan_sessions", "checkins", "activities", "goals", "side_races", "coach_messages", "terrains", "push_subs", "app_tokens", "profiles", "app_sessions"]) await run(`DELETE FROM ${t} WHERE user_id = ?`, [user.id]);
  await run("DELETE FROM app_kv WHERE key IN (?, ?)", [`cal:${user.id}`, `tracks:${user.id}`]);
  await run("DELETE FROM app_users WHERE id = ?", [user.id]);
  await destroySession();
  return json({ ok: true });
});
