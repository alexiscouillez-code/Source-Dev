import { body, HttpError, isoDate, json, num, withUser } from "@/lib/api";
import { one, run } from "@/db/client";

const STATUSES = ["planned", "done", "skipped"];

export const PATCH = withUser(async (user, req, ctx) => {
  const id = Number((await ctx.params).id);
  const s = await one<{ id: number }>("SELECT id FROM plan_sessions WHERE id = ? AND user_id = ?", [id, user.id]);
  if (!s) throw new HttpError(404, "Séance introuvable.");
  const b = await body(req);
  // « Rétablir la séance prévue » : annule une adaptation (check-in ou commentaire) et verrouille la séance,
  // pour qu’elle ne soit pas réadaptée dans la journée.
  if (b.restore === true) {
    const p = await one<{ original: string | null }>("SELECT original FROM plan_sessions WHERE id = ?", [id]);
    if (!p?.original) throw new HttpError(400, "Cette séance n’a pas été adaptée.");
    const o = JSON.parse(p.original) as { title: string; sport: string; template: string; durationMin: number; rpeTarget: number; gainM: number | null; description: string };
    await run("UPDATE plan_sessions SET title = ?, sport = ?, template = ?, duration_min = ?, rpe_target = ?, gain_m = ?, description = ?, status = 'planned', original = NULL, locked = 1, updated_at = ? WHERE id = ?",
      [o.title, o.sport, o.template, o.durationMin, o.rpeTarget, o.gainM, o.description, Date.now(), id]);
    return json({ ok: true });
  }
  const sets: string[] = [], args: (string | number | null)[] = [];
  if (b.status !== undefined) { if (!STATUSES.includes(String(b.status))) throw new HttpError(400, "Statut inconnu."); sets.push("status = ?"); args.push(String(b.status)); }
  if (b.date !== undefined) { sets.push("date = ?", "locked = 1"); args.push(isoDate(b.date)); }
  if (b.durationMin !== undefined) { sets.push("duration_min = ?", "locked = 1"); args.push(num(b.durationMin, 10, 600, "Durée")!); }
  if (b.locked !== undefined) { sets.push("locked = ?"); args.push(b.locked ? 1 : 0); }
  if (!sets.length) throw new HttpError(400, "Rien à modifier.");
  await run(`UPDATE plan_sessions SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, [...args, Date.now(), id]);
  return json({ ok: true });
});

export const DELETE = withUser(async (user, _req, ctx) => {
  await run("DELETE FROM plan_sessions WHERE id = ? AND user_id = ?", [Number((await ctx.params).id), user.id]);
  return json({ ok: true });
});
