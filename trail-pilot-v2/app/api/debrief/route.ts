import { body, HttpError, isoDate, json, num, text, withUser } from "@/lib/api";
import { loadDebrief, loadDebriefs, saveFeedback } from "@/lib/debrief";
import { ownsRace, raceOn } from "@/lib/races";
import { TAGS } from "@/lib/engine/debrief";
import { resolveToday } from "@/lib/service";

/** Débriefs des courses récentes : prévu contre réalisé, sections, enseignements. */
export const GET = withUser(async (user, req) => {
  const q = new URL(req.url).searchParams, today = resolveToday(q.get("today"));
  // ?key=main:<date> ou side:<id> : une course passée, quelle que soit sa date ; ?date=<jour> : la course de ce jour-là.
  const key = q.get("key"), date = q.get("date");
  if (key || date) {
    const k = key && KEY.test(key) ? key : date ? (await raceOn(user.id, today, isoDate(date)))?.key ?? null : null;
    if (!k) throw new HttpError(404, "Pas de course ce jour-là.");
    const d = await loadDebrief(user.id, today, k);
    if (!d) throw new HttpError(404, "Course inconnue.");
    return json({ debrief: d, tags: TAGS });
  }
  return json({ debriefs: await loadDebriefs(user.id, today), tags: TAGS });
});
const KEY = /^(main:\d{4}-\d{2}-\d{2}|side:\d+)$/;

/** Ressenti du coureur sur une course : effort, ce qui a marché ou coincé, commentaire. */
export const PUT = withUser(async (user, req) => {
  const b = await body(req);
  const key = typeof b.key === "string" && KEY.test(b.key) ? b.key : null;
  if (!key) throw new HttpError(400, "Course inconnue.");
  const today = resolveToday(typeof b.today === "string" ? b.today : null);
  // La course doit appartenir à ce compte et être passée.
  if (!(await ownsRace(user.id, key)) || !(await loadDebrief(user.id, today, key))) throw new HttpError(404, "Course inconnue.");
  await saveFeedback(user.id, key, { rpe: b.rpe == null || b.rpe === "" ? null : Math.round(num(b.rpe, 1, 10, "Effort ressenti")!), tags: Array.isArray(b.tags) ? b.tags.map(String) : [], note: text(b.note, 500) || null });
  // ?one=1 : renvoie seulement ce débrief (fiche course) ; sinon la liste du Planning.
  if (b.one === true) return json({ debrief: await loadDebrief(user.id, today, key) });
  return json({ debriefs: await loadDebriefs(user.id, today) });
});
