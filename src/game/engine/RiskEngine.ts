import { clamp, unitHash } from "@/game/engine/hash";
import { terrainMods } from "@/game/engine/TerrainEngine";
import type { SimContext } from "@/game/models/types";

export function incidentProbability(ctx: SimContext): number {
  let probability = terrainMods(ctx.segment.terrainType).risk;
  if (ctx.action === "ATTACK") probability += 0.14;
  if (ctx.action === "SAVE") probability -= 0.08;
  if (ctx.segment.weather === "rain") probability += 0.07;
  if (ctx.segment.weather === "fog") probability += 0.05;
  if (ctx.segment.night && ctx.mods.lampPower < 4) probability += 0.16;
  probability += Math.max(0, ctx.fatigue - 50) * 0.003;
  probability -= ctx.mental * 0.0008;
  probability -= (ctx.mods.grip + ctx.mods.terrainBonus) * 0.004;
  const technical =
    ctx.segment.terrainType === "descent" ||
    ctx.segment.terrainType === "technical" ||
    ctx.segment.terrainType === "rocky";
  if (technical) {
    probability -= Math.max(0, ctx.stats.descente - 40) * 0.002;
    probability -= ctx.ranks.DESCENTE * 0.03;
  }
  return clamp(probability, 0, 0.85);
}

export function incidentTriggers(ctx: SimContext, seed: string): boolean {
  const probability = incidentProbability(ctx);
  if (probability <= 0) return false;
  return unitHash([seed, "segment", String(ctx.segment.startKm), ctx.action, "risk"]) < probability;
}
