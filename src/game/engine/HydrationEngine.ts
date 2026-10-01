import { ACTION } from "@/game/engine/balance";
import { clamp } from "@/game/engine/hash";
import { weatherMods } from "@/game/engine/WeatherEngine";
import { segmentDistance } from "@/game/format";
import type { SimContext } from "@/game/models/types";

export function hydrationCost(ctx: SimContext): number {
  const distance = segmentDistance(ctx.segment.startKm, ctx.segment.endKm);
  let loss = 5 + distance * 0.48;
  loss *= ACTION[ctx.action].hydration;
  loss *= weatherMods(ctx.segment.weather).hydration;
  if (ctx.segment.night) loss *= 0.95;
  loss *= 1 - clamp(ctx.mods.hydrationBonus, 0, 40) / 100;
  loss *= 1 - ctx.ranks.ULTRA * 0.03;
  return Math.max(1, Math.round(loss));
}
