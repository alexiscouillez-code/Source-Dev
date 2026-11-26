import { body, HttpError, isoDate, json, withUser } from "@/lib/api";
import { one } from "@/db/client";
import { resolveToday, saveFuelFeel } from "@/lib/service";
import { takenPerHour } from "@/lib/fuel";

/** Ressenti de l’alimentation testée sur une sortie longue faite : il règle la quantité de la sortie longue suivante. */
export const POST = withUser(async (user, req) => {
  const b = await body(req);
  const today = resolveToday(typeof b.today === "string" ? b.today : null);
  const date = isoDate(b.date);
  if (date > today) throw new HttpError(400, "Cette sortie n’est pas encore passée.");
  const feel = b.feel === "ok" || b.feel === "limite" || b.feel === "ko" ? b.feel : null;
  if (!feel) throw new HttpError(400, "Réponse inconnue.");
  const s = await one<{ description: string }>("SELECT description FROM plan_sessions WHERE user_id = ? AND date = ? AND template IN ('long', 'b2b') ORDER BY id LIMIT 1", [user.id, date]);
  if (!s) throw new HttpError(404, "Pas de sortie longue ce jour-là.");
  const m = /(\d+) g de glucides par heure/.exec(s.description);
  // Si les prises ont été notées, le ressenti porte sur ce qui a vraiment été pris, pas sur la cible.
  const taken = await takenPerHour(user.id, date);
  await saveFuelFeel(user.id, date, feel, taken ?? (m ? Number(m[1]) : null), today);
  return json({ ok: true });
});
