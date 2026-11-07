import { body, HttpError, isoDate, json, num, withUser } from "@/lib/api";
import { one, run } from "@/db/client";

const STATUSES = ["planned", "done", "skipped"];

export const PATCH = withUser(async (user, req, ctx) => {
  const id = Number((await ctx.params).id);
  const s = await one<{ id: number }>("SELECT id FROM plan_sessions WHERE id = ? AND user_id = ?", [id, user.id]);
  if (!s) throw new HttpError(404, "Séance introuvable.");
  const b = await body(req);
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
