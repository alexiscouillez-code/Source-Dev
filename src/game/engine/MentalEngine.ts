import { clamp } from "@/game/engine/hash";
import type { PaceAction, SkillRanks } from "@/game/models/types";

export function mentalDelta(input: {
  action: PaceAction;
  energyAfter: number;
  hydrationAfter: number;
  fatigueAfter: number;
  ranks: SkillRanks;
  comfort: number;
}): number {
  let delta = 0;
  if (input.action === "ATTACK" && input.energyAfter >= 40) delta += 1;
  if (input.action === "SAVE") delta -= 1;
  if (input.energyAfter < 30) delta -= 4;
  if (input.hydrationAfter < 26) delta -= 4;
  if (input.fatigueAfter > 74) delta -= 3;
  if (input.comfort >= 24) delta += 1;
  if (delta < 0) {
    delta = Math.round(delta * (1 - input.ranks.MENTAL * 0.15));
  }
  return delta;
}

export function softenMentalLoss(delta: number, ranks: SkillRanks): number {
  if (delta >= 0) return delta;
  return Math.round(delta * (1 - clamp(ranks.MENTAL, 0, 5) * 0.15));
}
