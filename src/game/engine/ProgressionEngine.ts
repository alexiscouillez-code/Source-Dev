import { MAX_SKILL_RANK, XP_PER_LEVEL } from "@/game/engine/balance";
import type {
  EffectiveStats,
  ResultStatus,
  Runner,
  SkillBranch,
  SkillRanks,
} from "@/game/models/types";

export const SKILL_INFO: Record<SkillBranch, { label: string; bonus: string }> = {
  ENDURANCE: {
    label: "Endurance",
    bonus: "+4 endurance, −3 % et −1 de coût énergétique par rang",
  },
  MONTAGNE: {
    label: "Montagne",
    bonus: "+4 montagne, montées moins chères et un peu plus rapides",
  },
  DESCENTE: {
    label: "Descente",
    bonus: "+4 descente, moins de risque et de fatigue en descente",
  },
  MENTAL: {
    label: "Mental",
    bonus: "+4 mental, les baisses de moral sont amorties",
  },
  ULTRA: {
    label: "Ultra",
    bonus: "+3 résistance, moins de fatigue et de soif",
  },
};

export const SKILL_BRANCHES: SkillBranch[] = [
  "ENDURANCE",
  "MONTAGNE",
  "DESCENTE",
  "MENTAL",
  "ULTRA",
];

export function emptyRanks(): SkillRanks {
  return {
    ENDURANCE: 0,
    MONTAGNE: 0,
    DESCENTE: 0,
    MENTAL: 0,
    ULTRA: 0,
  };
}

export function createRunner(name = "Coureur"): Runner {
  return {
    name,
    level: 1,
    xp: 0,
    skillPoints: 0,
    endurance: 52,
    montagne: 48,
    descente: 50,
    resistance: 50,
    mental: 55,
    ranks: emptyRanks(),
  };
}

export function effectiveStats(runner: Runner): EffectiveStats {
  return {
    endurance: runner.endurance + runner.ranks.ENDURANCE * 4 + (runner.level - 1),
    montagne: runner.montagne + runner.ranks.MONTAGNE * 4,
    descente: runner.descente + runner.ranks.DESCENTE * 4,
    resistance: runner.resistance + runner.ranks.ULTRA * 3 + (runner.level - 1),
    mental: runner.mental + runner.ranks.MENTAL * 4,
  };
}

export function xpForRun(
  status: ResultStatus,
  distanceKm: number,
  elevationGain: number,
): number {
  if (status === "FINISH") {
    return Math.max(1, Math.round(30 + distanceKm * 1.1 + elevationGain / 150));
  }
  return Math.max(1, Math.round(distanceKm * 0.8));
}

export function grantXp(runner: Runner, amount: number): void {
  runner.xp += amount;
  while (runner.xp >= XP_PER_LEVEL) {
    runner.xp -= XP_PER_LEVEL;
    runner.level += 1;
    runner.skillPoints += 1;
  }
}

export function spendSkill(runner: Runner, branch: SkillBranch): boolean {
  if (runner.skillPoints <= 0) return false;
  if (runner.ranks[branch] >= MAX_SKILL_RANK) return false;
  runner.skillPoints -= 1;
  runner.ranks[branch] += 1;
  return true;
}
