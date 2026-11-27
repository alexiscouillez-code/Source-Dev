import { HttpError, json, withUser } from "@/lib/api";
import { one } from "@/db/client";

/** Tracé et matériel d'une course principale suivante (pour la préparer avant que le plan ne la vise). */
export const GET = withUser(async (user, req) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Course inconnue.");
  const r = await one<{ route: string | null; gear: string | null }>("SELECT route, gear FROM next_goals WHERE id = ? AND user_id = ?", [id, user.id]);
  if (!r) throw new HttpError(404, "Course inconnue.");
  const read = <T,>(v: string | null, d: T): T => { try { return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
  return json({ route: read(r.route, null), gear: read(r.gear, []) });
});
