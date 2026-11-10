import { cleanAnalysis } from "@/lib/engine/streams";
import { body, isoDate, json, withUser } from "@/lib/api";
import { parseActivity } from "@/lib/activity-input";
import { all, run } from "@/db/client";
import { addDays } from "@/lib/engine/dates";
import { listShoes } from "@/lib/shoes";
import { loadActivities, loadProfile, reconcile, resolveToday, withLoad } from "@/lib/service";

export const GET = withUser(async (user, req) => {
  const url = new URL(req.url);
  const today = resolveToday(url.searchParams.get("today"));
  const since = url.searchParams.get("since") ?? addDays(today, -90);
  const shoes = await listShoes(user.id);
  const [acts, p, tracks] = await Promise.all([
    loadActivities(user.id, isoDate(since)), loadProfile(user.id),
    all<{ id: number; track: string | null; shoe_id: number | null }>("SELECT id, track, shoe_id FROM activities WHERE user_id = ? AND date >= ?", [user.id, isoDate(since)]),
  ]);
  const byId = new Map(tracks.map((t) => [t.id, t]));
  return json({
    activities: acts.map((a) => ({ ...withLoad(a, { hrMax: p.hr_max, hrRest: p.hr_rest }), track: byId.get(a.id)?.track ?? null, shoe_id: byId.get(a.id)?.shoe_id ?? null })),
    shoes: shoes.map(({ id, name, retired, wear, km, limitKm }) => ({ id, name, retired, wear, km, limitKm })),
  });
});

export const POST = withUser(async (user, req) => {
  const b = await body(req);
  const today = resolveToday(typeof b.today === "string" ? b.today : null);
  const a = parseActivity(b, today);
  const source = b.source === "gpx" ? "gpx" : b.source === "fichier" ? "fichier" : "manual";
  const now = Date.now();
  // Fichier de montre : le navigateur a analysé les données seconde par seconde et n’envoie que le résumé.
  const analysis = source !== "manual" ? cleanAnalysis(b.analysis) : null;
  const { id } = await run(
    "INSERT INTO activities(user_id, date, sport, name, duration_min, distance_km, gain_m, loss_m, avg_hr, max_hr, rpe, source, track, analysis, stream_state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [user.id, a.date, a.sport, a.name, a.duration, a.distance, a.gain, a.loss ?? analysis?.loss ?? null, a.avgHr, a.maxHr, a.rpe, source, a.track, analysis ? JSON.stringify(analysis) : null, analysis ? 1 : null, now, now],
  );
  await reconcile(user.id, today);
  return json({ id }, 201);
});
