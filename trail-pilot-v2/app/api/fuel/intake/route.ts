import { body, HttpError, isoDate, json, withUser } from "@/lib/api";
import { intakeFor, saveIntake } from "@/lib/fuel";
import { regeneratePlan, resolveToday } from "@/lib/service";

/** Ce qui a été pris pendant la sortie d'un jour : produits, glucides par heure, comparaison à la cible. */
export const GET = withUser(async (user, req) => json(await intakeFor(user.id, isoDate(new URL(req.url).searchParams.get("date")))));

export const PUT = withUser(async (user, req) => {
  const b = await body(req);
  const today = resolveToday(typeof b.today === "string" ? b.today : null);
  const date = isoDate(b.date);
  if (date > today) throw new HttpError(400, "Cette sortie n’est pas encore passée.");
  const r = await saveIntake(user.id, date, b.items);
  // Le ressenti de ce jour porte maintenant sur la quantité réellement prise : la sortie longue suivante s'ajuste.
  if (r.feelUpdated) await regeneratePlan(user.id, today);
  return json(r);
});
