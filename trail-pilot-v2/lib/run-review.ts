import "server-only";
import { one, run } from "@/db/client";
import { HttpError } from "./api";
import { aiConfigured, aiText } from "./ai";
import { parseAnalysis } from "./engine/streams";
import { parseReview, readReview, reviewable, reviewPayload, REVIEW_SYSTEM, type AiReview } from "./engine/ai-review";

/** Bilans demandés par jour et par coureur, au plus (le bilan automatique après import compte aussi). */
export const REVIEW_DAILY_LIMIT = 15;

interface Row { id: number; user_id: number; date: string; sport: string; name: string | null; source: string; strava_id: string | null; duration_min: number; distance_km: number | null; gain_m: number | null; loss_m: number | null; avg_hr: number | null; max_hr: number | null; rpe: number | null; analysis: string | null; ai_review: string | null }

/**
 * Rédige (ou réécrit) le bilan IA d’une sortie et l’enregistre. Refuse toute sortie venue de Strava.
 * `quiet` : appel automatique après un import, qui ne doit jamais lever d’erreur.
 */
export async function reviewActivity(userId: number, id: number, o: { quiet?: boolean } = {}): Promise<AiReview | null> {
  const fail = (status: number, msg: string) => { if (o.quiet) return null; throw new HttpError(status, msg); };
  if (!aiConfigured()) return fail(503, "L’analyse par l’IA n’est pas activée sur le site.");
  const a = await one<Row>("SELECT id, user_id, date, sport, name, source, strava_id, duration_min, distance_km, gain_m, loss_m, avg_hr, max_hr, rpe, analysis, ai_review FROM activities WHERE id = ? AND user_id = ?", [id, userId]);
  if (!a) return fail(404, "Séance introuvable.");
  if (!reviewable({ source: a.source, stravaId: a.strava_id })) return fail(400, "Les sorties venues de Strava ne peuvent pas être analysées par une IA (règle de Strava). Importe le fichier de ta montre pour avoir un bilan.");
  if (a.duration_min < 10) return fail(400, "Sortie trop courte pour un bilan.");

  const since = Date.now() - 86400000;
  const used = await one<{ n: number }>("SELECT COUNT(*) AS n FROM app_kv WHERE key LIKE ? AND updated_at > ?", [`review:${userId}:%`, since]);
  if ((used?.n ?? 0) >= REVIEW_DAILY_LIMIT) return fail(429, `Tu as demandé ${REVIEW_DAILY_LIMIT} bilans en 24 h : reviens un peu plus tard.`);

  const [planned, checkin, prof] = await Promise.all([
    one<{ title: string; template: string; duration_min: number; rpe_target: number; description: string }>(
      "SELECT title, template, duration_min, rpe_target, description FROM plan_sessions WHERE user_id = ? AND date = ? AND template <> 'race' AND sport <> 'renfo' ORDER BY (activity_id = ?) DESC, id LIMIT 1", [userId, a.date, a.id]),
    one<{ sleep: number; legs: number; motivation: number; pain: number; note: string | null }>("SELECT sleep, legs, motivation, pain, note FROM checkins WHERE user_id = ? AND date = ?", [userId, a.date]),
    one<{ hr_max: number | null; hr_rest: number | null }>("SELECT hr_max, hr_rest FROM profiles WHERE user_id = ?", [userId]),
  ]);
  const payload = reviewPayload(
    { date: a.date, sport: a.sport, name: a.name, source: a.source, stravaId: a.strava_id, durationMin: a.duration_min, distanceKm: a.distance_km, gainM: a.gain_m, lossM: a.loss_m, avgHr: a.avg_hr, maxHr: a.max_hr, rpe: a.rpe, analysis: parseAnalysis(a.analysis) },
    planned ? { title: planned.title, template: planned.template, durationMin: planned.duration_min, rpeTarget: planned.rpe_target, description: planned.description } : null,
    checkin, { hrMax: prof?.hr_max ?? null, hrRest: prof?.hr_rest ?? null },
  );
  await run("DELETE FROM app_kv WHERE key LIKE ? AND updated_at < ?", [`review:${userId}:%`, Date.now() - 3 * 86400000]);
  // Compté avant l'appel : une série d'échecs ne permet pas de contourner la limite.
  await run("INSERT OR REPLACE INTO app_kv(key, value, updated_at) VALUES (?, '1', ?)", [`review:${userId}:${a.id}:${Date.now()}`, Date.now()]);
  const reply = await aiText(REVIEW_SYSTEM, `<donnees>\n${JSON.stringify(payload)}\n</donnees>`, { maxTokens: 900, timeoutMs: 25000 });
  const review = reply ? parseReview(reply) : null;
  if (!review) return fail(502, "L’IA n’a pas pu faire le bilan pour le moment. Réessaie dans un instant.");
  await run("UPDATE activities SET ai_review = ?, updated_at = ? WHERE id = ?", [JSON.stringify(review), Date.now(), a.id]);
  return review;
}

export { readReview };
