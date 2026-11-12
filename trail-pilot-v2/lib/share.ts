import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { all, one, run } from "@/db/client";
import { open, seal } from "./crypto";
import { addDays, diffDays, mondayOf } from "./engine/dates";
import { buildStrategy, clockAt, type RaceRoute } from "./engine/strategy";
import { loadGoal, loadSideRaces, readPlanMeta, reconcile } from "./service";
import { SITE_URL } from "./site";

/**
 * Partage du planning en lecture seule, pour un coach ou un ami : un lien secret, comme celui de l’agenda.
 * Ce qui est montré : la course, le verdict et le temps estimé, les séances prévues (passées et à venir) avec
 * leur statut (faite, manquée…), les courses de préparation et la stratégie de course.
 * Ce qui ne l’est jamais : check-in, commentaires, douleurs et mesures de santé, e-mail, et le détail des sorties
 * (les conditions de Strava interdisent de montrer les données d’un coureur à quelqu’un d’autre).
 */
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const urlOf = (token: string) => `${SITE_URL}/suivi/${token}`;

export async function shareUrl(userId: number) {
  const row = await one<{ value: string }>("SELECT value FROM app_kv WHERE key = ?", [`share:${userId}`]);
  try { return row ? urlOf(open(row.value)) : null; } catch { return null; }
}
export async function rotateShare(userId: number) {
  const token = randomBytes(24).toString("base64url");
  await run("INSERT INTO profiles(user_id, updated_at) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING", [userId, Date.now()]);
  await run("UPDATE profiles SET share_token = ? WHERE user_id = ?", [sha256(token), userId]);
  await run("INSERT OR REPLACE INTO app_kv(key, value, updated_at) VALUES (?, ?, ?)", [`share:${userId}`, seal(token), Date.now()]);
  return urlOf(token);
}
export async function revokeShare(userId: number) {
  await run("UPDATE profiles SET share_token = NULL WHERE user_id = ?", [userId]);
  await run("DELETE FROM app_kv WHERE key = ?", [`share:${userId}`]);
}
export async function userForShare(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const r = await one<{ user_id: number }>("SELECT user_id FROM profiles WHERE share_token = ?", [sha256(token)]);
  return r?.user_id ?? null;
}

export type SharedSession = { date: string; title: string; template: string; duration: number; gain: number | null; rpe: number; status: string; description: string };

export async function sharedView(userId: number, today: string) {
  await reconcile(userId, today);
  const [u, goal, sides] = await Promise.all([
    one<{ name: string | null }>("SELECT name FROM app_users WHERE id = ?", [userId]),
    loadGoal(userId), loadSideRaces(userId),
  ]);
  const from = addDays(mondayOf(today), -7), to = addDays(mondayOf(today), 27);
  const rows = await all<{ date: string; title: string; template: string; duration_min: number; gain_m: number | null; rpe_target: number; status: string; description: string }>(
    "SELECT date, title, template, duration_min, gain_m, rpe_target, status, description FROM plan_sessions WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date, id", [userId, from, to]);
  const sessions: SharedSession[] = rows.map((r) => ({ date: r.date, title: r.title, template: r.template, duration: r.duration_min, gain: r.gain_m, rpe: r.rpe_target, status: r.status, description: r.description }));
  const upcomingGoal = goal && goal.date >= today ? goal : null;
  const meta = upcomingGoal ? readPlanMeta(upcomingGoal) : null;
  let route: RaceRoute | null = null;
  try { route = upcomingGoal?.route ? JSON.parse(upcomingGoal.route) : null; } catch { route = null; }
  const strat = route && meta?.estimate ? (() => { try { return buildStrategy(route!, meta.estimate); } catch { return null; } })() : null;
  // Régularité des 4 dernières semaines : séances faites sur séances prévues (hors course).
  const past = await all<{ status: string; n: number }>(
    "SELECT status, COUNT(*) AS n FROM plan_sessions WHERE user_id = ? AND date >= ? AND date < ? AND template != 'race' GROUP BY status", [userId, addDays(today, -28), today]);
  const count = (s: string) => past.find((p) => p.status === s)?.n ?? 0;
  const planned = count("done") + count("missed") + count("skipped");
  return {
    firstName: (u?.name ?? "").trim().split(/\s+/)[0] || "Ce coureur",
    today, from, to, sessions,
    goal: upcomingGoal ? { name: upcomingGoal.name, date: upcomingGoal.date, distanceKm: upcomingGoal.distance_km, gainM: upcomingGoal.gain_m, daysTo: diffDays(today, upcomingGoal.date) } : null,
    plan: meta ? { verdict: meta.verdict, headline: meta.headline, estimate: meta.estimate, weeks: meta.weeks.map((w) => ({ monday: w.monday, phase: w.phase, minutes: w.minutes, light: w.light })) } : null,
    regularity: planned ? { done: count("done"), planned } : null,
    sides: sides.filter((s) => s.date >= today).map((s) => ({ name: s.name, date: s.date, distanceKm: s.distanceKm, gainM: s.gainM, priority: s.priority })),
    strategy: strat ? { start: route!.startTime ?? null, total: strat.total, sections: strat.sections.map((s) => ({ label: s.label, to: s.to, gain: s.gain, loss: s.loss, low: s.arrival.low, high: s.arrival.high, clock: route!.startTime ? `${clockAt(route!.startTime, s.arrival.low)}–${clockAt(route!.startTime, s.arrival.high)}` : null, cutoff: s.cutoff, margin: s.margin })) } : null,
  };
}
