import { body, HttpError, json, num, text, withUser } from "@/lib/api";
import { one, run } from "@/db/client";
import { listShoes, type ShoeTerrain } from "@/lib/shoes";

const TERRAINS: ShoeTerrain[] = ["route", "trail", "mixte"];
const terrainOf = (v: unknown): ShoeTerrain => { if (TERRAINS.includes(v as ShoeTerrain)) return v as ShoeTerrain; throw new HttpError(400, "Terrain invalide."); };

/** Une seule paire par défaut par terrain : la nouvelle remplace l’ancienne. */
async function makeDefault(userId: number, id: number, terrain: ShoeTerrain) {
  await run("UPDATE shoes SET is_default = 0 WHERE user_id = ? AND terrain = ? AND id != ?", [userId, terrain, id]);
  await run("UPDATE shoes SET is_default = 1 WHERE user_id = ? AND id = ?", [userId, id]);
}

export const GET = withUser(async (user) => json({ shoes: await listShoes(user.id) }));

export const POST = withUser(async (user, req) => {
  const b = await body(req);
  const name = text(b.name, 60);
  if (!name) throw new HttpError(400, "Donne un nom à la paire.");
  const count = await one<{ n: number }>("SELECT COUNT(*) AS n FROM shoes WHERE user_id = ?", [user.id]);
  if ((count?.n ?? 0) >= 30) throw new HttpError(400, "30 paires au plus.");
  const terrain = terrainOf(b.terrain);
  const base = num(b.baseKm ?? 0, 0, 5000, "Kilomètres déjà parcourus")!, limit = num(b.limitKm ?? 700, 100, 3000, "Limite d’usure")!;
  const { id } = await run("INSERT INTO shoes(user_id, name, terrain, base_km, limit_km, is_default, retired, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)",
    [user.id, name, terrain, base, Math.round(limit), Date.now()]);
  if (b.isDefault !== false) await makeDefault(user.id, Number(id), terrain);
  return json({ shoes: await listShoes(user.id) }, 201);
});

export const PATCH = withUser(async (user, req) => {
  const b = await body(req);
  const id = Number(b.id);
  const s = await one<{ terrain: ShoeTerrain }>("SELECT terrain FROM shoes WHERE id = ? AND user_id = ?", [id, user.id]);
  if (!s) throw new HttpError(404, "Paire introuvable.");
  if (b.name !== undefined) { const name = text(b.name, 60); if (!name) throw new HttpError(400, "Donne un nom à la paire."); await run("UPDATE shoes SET name = ? WHERE id = ?", [name, id]); }
  if (b.limitKm !== undefined) await run("UPDATE shoes SET limit_km = ? WHERE id = ?", [Math.round(num(b.limitKm, 100, 3000, "Limite d’usure")!), id]);
  if (b.retired !== undefined) await run("UPDATE shoes SET retired = ?, is_default = CASE WHEN ? = 1 THEN 0 ELSE is_default END WHERE id = ?", [b.retired ? 1 : 0, b.retired ? 1 : 0, id]);
  if (b.isDefault === true) await makeDefault(user.id, id, s.terrain);
  return json({ shoes: await listShoes(user.id) });
});

export const DELETE = withUser(async (user, req) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  await run("UPDATE activities SET shoe_id = 0 WHERE shoe_id = ? AND user_id = ?", [id, user.id]);
  await run("DELETE FROM shoes WHERE id = ? AND user_id = ?", [id, user.id]);
  return json({ shoes: await listShoes(user.id) });
});
