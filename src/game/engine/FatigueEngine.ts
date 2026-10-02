import { ACTION } from "@/game/engine/balance";
import { clamp } from "@/game/engine/hash";
import { terrainMods } from "@/game/engine/TerrainEngine";
import { weatherMods } from "@/game/engine/WeatherEngine";
import { segmentDistance } from "@/game/format";
import type { SimContext } from "@/game/models/types";

export function fatigueGain(ctx: SimContext): number {
  const distance = segmentDistance(ctx.segment.startKm, ctx.segment.endKm);
  let gain =
    4 +
    ctx.segment.difficulty * 0.7 +
    distance * 0.2 +
    ctx.segment.elevationGain / 210 +
    ctx.segment.elevationLoss / 240;
  if (
    ctx.segment.terrainType === "descent" ||
    ctx.segment.terrainType === "technical" ||
    ctx.segment.terrainType === "rocky"
  ) {
    gain += 1.6;
  }
  gain *= terrainMods(ctx.segment.terrainType).fatigue;
  gain *= ACTION[ctx.action].fatigue;
  gain *= weatherMods(ctx.segment.weather).fatigue;
  gain *= 1 - clamp((ctx.stats.resistance - 40) * 0.004, -0.06, 0.22);
  gain *= 1 - ctx.ranks.ULTRA * 0.04;
  if (ctx.segment.terrainType === "descent") {
    gain *= 1 - ctx.ranks.DESCENTE * 0.03;
  }
  if (ctx.action === "SAVE") gain -= 3;
  return Math.round(gain);
}
