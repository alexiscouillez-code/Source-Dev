import { body, HttpError, isoDate, json, text, withUser } from "@/lib/api";
import { diffDays } from "@/lib/engine/dates";
import { resolveToday, saveDayNote } from "@/lib/service";

/**
 * Commentaire libre d’un jour (depuis le calendrier). Il est lu par l’IA, qui en tire quelques signaux
 * (fatigue, douleur, maladie, temps disponible) ; la séance concernée est allégée si besoin.
 * Réponse : ce qui a été compris et ce qui a changé dans le planning.
 */
export const PUT = withUser(async (user, req) => {
  const b = await body(req);
  const today = resolveToday(typeof b.today === "string" ? b.today : null);
  const date = isoDate(b.date);
  if (Math.abs(diffDays(today, date)) > 400) throw new HttpError(400, "Date hors limites.");
  return json(await saveDayNote(user.id, today, date, text(b.note, 500) ?? ""));
});
