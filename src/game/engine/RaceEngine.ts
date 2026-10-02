import { ACTION } from "@/game/engine/balance";
import { energyCost } from "@/game/engine/EnergyEngine";
import { fatigueGain } from "@/game/engine/FatigueEngine";
import { hydrationCost } from "@/game/engine/HydrationEngine";
import { mentalDelta } from "@/game/engine/MentalEngine";
import { incidentProbability, incidentTriggers } from "@/game/engine/RiskEngine";
import { terrainMods } from "@/game/engine/TerrainEngine";
import { weatherMods } from "@/game/engine/WeatherEngine";
import { segmentDistance } from "@/game/format";
import type { PacePreview, SimContext } from "@/game/models/types";
import { clamp } from "@/game/engine/hash";

export interface SegmentMath extends PacePreview {
  incident: boolean;
}

export function paceMinPerKm(ctx: SimContext): number {
  const terrain = terrainMods(ctx.segment.terrainType);
  let pace = terrain.pace * ACTION[ctx.action].pace;
  pace += Math.max(0, ctx.segment.slope) * 0.12;
  pace *= weatherMods(ctx.segment.weather).pace;
  if (ctx.fatigue > 40) pace *= 1 + (ctx.fatigue - 40) * 0.0035;
  if (ctx.energy < 35) pace *= 1 + (35 - ctx.energy) * 0.004;
  pace *= 1 + Math.max(0, ctx.mods.weightG) / 1000 * 0.045;
  if (ctx.segment.terrainType === "climb") {
    pace *= 1 - clamp((ctx.stats.montagne - 40) * 0.004, -0.08, 0.18);
    pace *= 1 - ctx.ranks.MONTAGNE * 0.02;
  }
  const grip = ctx.mods.grip + ctx.mods.terrainBonus;
  if (
    ctx.segment.terrainType === "technical" ||
    ctx.segment.terrainType === "rocky" ||
    ctx.segment.terrainType === "descent" ||
    ctx.segment.terrainType === "muddy"
  ) {
    pace *= 1 - clamp(grip * 0.004, 0, 0.14);
    pace *= 1 - clamp((ctx.stats.descente - 40) * 0.003, -0.06, 0.12);
  }
  if (ctx.segment.night && ctx.mods.lampPower < 4) pace *= 1.22;
  if (ctx.segment.night && ctx.mods.lampPower >= 8) pace *= 0.96;
  return Math.round(clamp(pace, 4.2, 22) * 10) / 10;
}

export function resolveSegmentMath(ctx: SimContext, seed: string): SegmentMath {
  const distance = segmentDistance(ctx.segment.startKm, ctx.segment.endKm);
  const pace = paceMinPerKm(ctx);
  let minutes = Math.max(1, Math.round(pace * distance));
  const energy = -energyCost(ctx);
  const hydration = -hydrationCost(ctx);
  let fatigue = fatigueGain(ctx);
  const incident = incidentTriggers(ctx, seed);
  if (incident) {
    minutes += 8;
    fatigue += 9;
  }
  const energyAfter = clampStat(ctx.energy + energy - (incident ? 7 : 0));
  const hydrationAfter = clampStat(ctx.hydration + hydration);
  const fatigueAfter = clampStat(ctx.fatigue + fatigue);
  const mental =
    mentalDelta({
      action: ctx.action,
      energyAfter,
      hydrationAfter,
      fatigueAfter,
      ranks: ctx.ranks,
      comfort: ctx.mods.comfort,
    }) + (incident ? -4 : 0);
  return {
    minutes,
    energy: energy - (incident ? 7 : 0),
    hydration,
    fatigue,
    mental,
    pace,
    riskPercent: Math.round(incidentProbability(ctx) * 100),
    incident,
  };
}

export function previewSegment(ctx: SimContext): PacePreview {
  const distance = segmentDistance(ctx.segment.startKm, ctx.segment.endKm);
  const pace = paceMinPerKm(ctx);
  const minutes = Math.max(1, Math.round(pace * distance));
  const energy = -energyCost(ctx);
  const hydration = -hydrationCost(ctx);
  const fatigue = fatigueGain(ctx);
  const mental = mentalDelta({
    action: ctx.action,
    energyAfter: clampStat(ctx.energy + energy),
    hydrationAfter: clampStat(ctx.hydration + hydration),
    fatigueAfter: clampStat(ctx.fatigue + fatigue),
    ranks: ctx.ranks,
    comfort: ctx.mods.comfort,
  });
  return {
    minutes,
    energy,
    hydration,
    fatigue,
    mental,
    pace,
    riskPercent: Math.round(incidentProbability(ctx) * 100),
  };
}

function clampStat(value: number): number {
  return clamp(Math.round(value), 0, 100);
}

export function hardFailure(state: {
  energy: number;
  hydration: number;
  fatigue: number;
  mental: number;
}): string | null {
  if (state.energy <= 0) return "Épuisement";
  if (state.fatigue >= 100) return "Fatigue maximale";
  if (state.mental <= 0) return "Moral brisé";
  if (state.energy <= 12 && state.hydration <= 18 && state.fatigue >= 88) return "État critique";
  return null;
}

export function closeHydration(state: {
  hydration: number;
  criticalHydrationStreak: number;
}): string | null {
  if (state.hydration <= 15) state.criticalHydrationStreak += 1;
  else if (state.hydration >= 22) state.criticalHydrationStreak = 0;
  if (state.criticalHydrationStreak >= 2) return "Déshydratation";
  return null;
}
