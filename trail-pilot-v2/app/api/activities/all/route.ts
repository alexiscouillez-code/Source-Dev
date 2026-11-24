import { all, one } from "@/db/client";
import { json, withUser } from "@/lib/api";
import { historyDone } from "@/lib/strava";

/**
 * Toutes les sorties du compte, en version légère (pour chercher vite dans le comparateur) :
 * date, nom, sport, distance, dénivelé, durée, FC moyenne, origine. Plus récentes d'abord.
 */
export const GET = withUser(async (user) => {
  const [rows, link] = await Promise.all([
    all<{ id: number; date: string; name: string | null; sport: string; distance_km: number | null; gain_m: number | null; duration_min: number; avg_hr: number | null; source: string; strava: number }>(
      `SELECT id, date, name, sport, distance_km, gain_m, duration_min, avg_hr, source, CASE WHEN strava_id IS NULL THEN 0 ELSE 1 END AS strava
         FROM activities WHERE user_id = ? AND COALESCE(check_state, 0) <> 1 ORDER BY date DESC, id DESC`, [user.id]),
    one<{ user_id: number }>("SELECT user_id FROM strava_links WHERE user_id = ?", [user.id]),
  ]);
  const oldest = rows.filter((r) => r.strava).at(-1)?.date ?? null;
  return json({
    activities: rows.map(({ strava, ...r }) => ({ ...r, strava: !!strava })),
    strava: link ? { connected: true, historyDone: await historyDone(user.id), oldest } : { connected: false, historyDone: true, oldest: null },
  });
});
