import { body, HttpError, json, withUser } from "@/lib/api";
import { addMainRace, demoteToB, removeMainRace, seasonView, updateMainRace } from "@/lib/seasonView";
import { regeneratePlan, resolveToday } from "@/lib/service";

/** Saison : courses principales à venir (la prochaine, que le plan vise, puis les suivantes), écarts, frise. */
export const GET = withUser(async (user, req) => json(await seasonView(user.id, resolveToday(new URL(req.url).searchParams.get("today")))));

/** Ajoute une course principale, ou { action: "toB", key } : la passe en objectif secondaire. */
export const POST = withUser(async (user, req) => {
  const b = await body(req);
  const today = resolveToday(typeof b.today === "string" ? b.today : null);
  if (b.action === "toB") return json(await demoteToB(user.id, today, String(b.key ?? "")));
  return json(await addMainRace(user.id, today, b), 201);
});

/** Modifie une course principale suivante (nom, date, distance, D+), ou accepte un enchaînement ({ chained }). */
export const PATCH = withUser(async (user, req) => {
  const b = await body(req);
  return json(await updateMainRace(user.id, resolveToday(typeof b.today === "string" ? b.today : null), b));
});

export const DELETE = withUser(async (user, req) => {
  const q = new URL(req.url).searchParams;
  const id = Number(q.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Course inconnue.");
  const today = resolveToday(q.get("today"));
  const r = await removeMainRace(user.id, today, id);
  await regeneratePlan(user.id, today);
  return json(r);
});
