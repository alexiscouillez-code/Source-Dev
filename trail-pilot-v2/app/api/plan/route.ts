import { body, json, withUser } from "@/lib/api";
import { planView, regeneratePlan, resolveToday, setLearningOff } from "@/lib/service";

export const GET = withUser(async (user, req) => {
  const today = resolveToday(new URL(req.url).searchParams.get("today"));
  return json(await planView(user.id, today));
});

/** Recalcule le plan à partir de la charge actuelle. */
export const POST = withUser(async (user, req) => {
  const b = await body(req).catch(() => ({} as Record<string, unknown>));
  const count = await regeneratePlan(user.id, resolveToday(typeof b.today === "string" ? b.today : null));
  return json({ count });
});

/** Ajustements automatiques issus du prévu / réalisé : les garder (par défaut) ou revenir au plan d’origine. */
export const PATCH = withUser(async (user, req) => {
  const b = await body(req);
  await setLearningOff(user.id, resolveToday(typeof b.today === "string" ? b.today : null), b.learningOff === true);
  return json({ ok: true });
});
