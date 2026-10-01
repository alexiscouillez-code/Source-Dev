import { ACTION } from "@/game/engine/balance";
import { clamp } from "@/game/engine/hash";
import { terrainMods } from "@/game/engine/TerrainEngine";
import { weatherMods } from "@/game/engine/WeatherEngine";
import { segmentDistance } from "@/game/format";
import type { SimContext } from "@/game/models/types";

export function energyCost(ctx: SimContext): number {
  const distance = segmentDistance(ctx.segment.startKm, ctx.segment.endKm);
  let loss =
    6 +
    ctx.segment.difficulty * 0.85 +
    distance * 0.28 +
    ctx.segment.elevationGain / 150;
  loss *= terrainMods(ctx.segment.terrainType).energy;
  loss *= ACTION[ctx.action].energy;
  loss *= weatherMods(ctx.segment.weather).energy;
  if (ctx.segment.night && ctx.mods.lampPower < 4) loss *= 1.08;
  loss *= 1 - clamp(ctx.mods.energyBonus, -20, 35) / 100;
  loss *= 1 - clamp((ctx.stats.endurance - 40) * 0.005, -0.08, 0.25);
  loss *= 1 - ctx.ranks.ENDURANCE * 0.03;
  if (ctx.segment.terrainType === "climb") {
    loss *= 1 - clamp((ctx.stats.montagne - 40) * 0.003, -0.06, 0.16);
    loss *= 1 - ctx.ranks.MONTAGNE * 0.03;
  }
  return Math.max(1, Math.round(loss) - ctx.ranks.ENDURANCE);
}
