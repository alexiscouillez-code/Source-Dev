import { body, HttpError, json, num, text, withUser } from "@/lib/api";
import { loadDebriefs, saveFeedback } from "@/lib/debrief";
import { TAGS } from "@/lib/engine/debrief";
import { resolveToday } from "@/lib/service";

/** Débriefs des courses récentes : prévu contre réalisé, sections, enseignements. */
export const GET = withUser(async (user, req) => json({ debriefs: await loadDebriefs(user.id, resolveToday(new URL(req.url).searchParams.get("today"))), tags: TAGS }));

/** Ressenti du coureur sur une course : effort, ce qui a marché ou coincé, commentaire. */
export const PUT = withUser(async (user, req) => {
  const b = await body(req);
  const key = typeof b.key === "string" && /^(main:\d{4}-\d{2}-\d{2}|side:\d+)$/.test(b.key) ? b.key : null;
  if (!key) throw new HttpError(400, "Course inconnue.");
  const today = resolveToday(typeof b.today === "string" ? b.today : null);
  // La course doit faire partie des débriefs de ce compte.
  if (!(await loadDebriefs(user.id, today)).some((d) => d.key === key)) throw new HttpError(404, "Course inconnue.");
  await saveFeedback(user.id, key, { rpe: b.rpe == null || b.rpe === "" ? null : Math.round(num(b.rpe, 1, 10, "Effort ressenti")!), tags: Array.isArray(b.tags) ? b.tags.map(String) : [], note: text(b.note, 500) || null });
  return json({ debriefs: await loadDebriefs(user.id, today) });
});
