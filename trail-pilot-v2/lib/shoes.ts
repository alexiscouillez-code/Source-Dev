import "server-only";
import { all, run } from "@/db/client";

/**
 * Chaussures : chaque sortie à pied est attribuée à la paire par défaut de son terrain
 * (route pour la course, trail pour le trail et la randonnée ; une paire « mixte » convient aux deux).
 * shoe_id = 0 signifie « aucune paire » choisi à la main : la sortie n’est plus réattribuée.
 */
export type ShoeTerrain = "route" | "trail" | "mixte";
export interface ShoeRow { id: number; name: string; terrain: ShoeTerrain; base_km: number; limit_km: number; is_default: number; retired: number; created_at: number }
export interface Shoe { id: number; name: string; terrain: ShoeTerrain; km: number; limitKm: number; runs: number; isDefault: boolean; retired: boolean; wear: "ok" | "bientot" | "usee"; last: string | null }

export const wearOf = (km: number, limit: number): Shoe["wear"] => (km >= limit ? "usee" : km >= limit * 0.85 ? "bientot" : "ok");

/** Attribue les sorties sans paire à la paire par défaut de leur terrain, à partir de son ajout. */
export async function assignShoes(userId: number) {
  const shoes = await all<ShoeRow>("SELECT * FROM shoes WHERE user_id = ? AND retired = 0 AND is_default = 1", [userId]);
  if (!shoes.length) return;
  const pick = (want: "route" | "trail") => shoes.find((s) => s.terrain === want) ?? shoes.find((s) => s.terrain === "mixte") ?? null;
  for (const [want, sports] of [["route", ["course"]], ["trail", ["trail", "rando"]]] as const) {
    const s = pick(want);
    if (!s) continue;
    const since = new Date(s.created_at - 86400000).toISOString().slice(0, 10);
    await run(`UPDATE activities SET shoe_id = ? WHERE user_id = ? AND shoe_id IS NULL AND date >= ? AND sport IN (${sports.map(() => "?").join(",")})`, [s.id, userId, since, ...sports]);
  }
}

export async function listShoes(userId: number): Promise<Shoe[]> {
  await assignShoes(userId);
  const rows = await all<ShoeRow & { km: number | null; runs: number; last: string | null }>(
    `SELECT s.*, COALESCE(SUM(a.distance_km), 0) AS km, COUNT(a.id) AS runs, MAX(a.date) AS last
     FROM shoes s LEFT JOIN activities a ON a.shoe_id = s.id AND a.user_id = s.user_id
     WHERE s.user_id = ? GROUP BY s.id ORDER BY s.retired, s.created_at DESC`, [userId]);
  return rows.map((r) => {
    const km = Math.round((r.base_km + (r.km ?? 0)) * 10) / 10;
    return { id: r.id, name: r.name, terrain: r.terrain, km, limitKm: r.limit_km, runs: r.runs, isDefault: !!r.is_default, retired: !!r.retired, wear: wearOf(km, r.limit_km), last: r.last };
  });
}
