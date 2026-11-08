import { body, HttpError, json, text, withUser } from "@/lib/api";
import { one, run } from "@/db/client";
import { cleanTerrain, ownLoops, savedTerrains } from "@/lib/terrain/mine";

/** Terrains enregistrés et boucles reconnues dans tes sorties. */
export const GET = withUser(async (user) => {
  const [saved, mine] = await Promise.all([savedTerrains(user.id), ownLoops(user.id)]);
  return json({ saved, mine });
});

/** Enregistre un terrain trouvé (ou une de tes boucles). */
export const POST = withUser(async (user, req) => {
  const t = cleanTerrain(await body(req));
  const n = await one<{ n: number }>("SELECT COUNT(*) AS n FROM terrains WHERE user_id = ?", [user.id]);
  if ((n?.n ?? 0) >= 100) throw new HttpError(400, "100 terrains enregistrés au plus : supprimes-en quelques-uns.");
  const dup = await one<{ id: number }>("SELECT id FROM terrains WHERE user_id = ? AND kind = ? AND abs(lat - ?) < 0.0003 AND abs(lon - ?) < 0.0003 AND name = ?", [user.id, t.kind, t.lat, t.lon, t.name]);
  if (dup) return json({ ok: true, id: dup.id });
  const { id } = await run("INSERT INTO terrains(user_id, kind, name, note, lat, lon, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [user.id, t.kind, t.name, null, t.lat, t.lon, JSON.stringify(t), Date.now()]);
  return json({ ok: true, id }, 201);
});

/** Renomme un terrain ou modifie sa note. */
export const PUT = withUser(async (user, req) => {
  const b = await body(req);
  const id = Number(b.id), name = text(b.name, 100), note = text(b.note, 300);
  if (!Number.isInteger(id)) throw new HttpError(400, "Terrain inconnu.");
  if (!name) throw new HttpError(400, "Donne un nom à ce terrain.");
  const { changes } = await run("UPDATE terrains SET name = ?, note = ? WHERE id = ? AND user_id = ?", [name, note, id, user.id]);
  if (!changes) throw new HttpError(404, "Terrain inconnu.");
  return json({ ok: true });
});

export const DELETE = withUser(async (user, req) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) throw new HttpError(400, "Terrain inconnu.");
  const { changes } = await run("DELETE FROM terrains WHERE id = ? AND user_id = ?", [id, user.id]);
  if (!changes) throw new HttpError(404, "Terrain inconnu.");
  return json({ ok: true });
});
