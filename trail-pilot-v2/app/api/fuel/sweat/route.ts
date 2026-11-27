import { body, HttpError, isoDate, json, withUser } from "@/lib/api";
import { run } from "@/db/client";
import { saveSweat, sweatFor } from "@/lib/fuel";
import { resolveToday } from "@/lib/service";

/** Test de sudation d'une sortie : pesées avant et après + boisson → perte par heure (seul le résultat est gardé). */
export const GET = withUser(async (user, req) => json(await sweatFor(user.id, isoDate(new URL(req.url).searchParams.get("date")))));

export const PUT = withUser(async (user, req) => {
  const b = await body(req);
  const date = isoDate(b.date);
  if (date > resolveToday(typeof b.today === "string" ? b.today : null)) throw new HttpError(400, "Cette sortie n’est pas encore passée.");
  return json(await saveSweat(user.id, date, b));
});

export const DELETE = withUser(async (user, req) => {
  await run("DELETE FROM sweat_tests WHERE user_id = ? AND date = ?", [user.id, isoDate(new URL(req.url).searchParams.get("date"))]);
  return json({ ok: true });
});
