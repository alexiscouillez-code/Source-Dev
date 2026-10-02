import { GRIP_NEED, JACKET_PROTECTION_NEED } from "@/game/engine/balance";
import { unitHash } from "@/game/engine/hash";
import { isSteepClimb, isTechnicalDescent } from "@/game/engine/TerrainEngine";
import { eventById } from "@/game/data/events";
import { signed } from "@/game/format";
import { softenMentalLoss } from "@/game/engine/MentalEngine";
import type { LoadoutMods, RaceState, StatDelta, TerrainSegment } from "@/game/models/types";

interface Effect {
  minutes: number;
  energy: number;
  hydration: number;
  fatigue: number;
  mental: number;
  risk?: number;
  drink?: boolean;
  eat?: boolean;
  need?: "jacket" | "poles" | "grip" | "drink" | "eat";
  fallback?: Effect;
}

const EFFECTS: Record<string, Record<string, Effect>> = {
  pluie: {
    continuer: { minutes: 0, energy: 0, hydration: -1, fatigue: 4, mental: 0, risk: 0.28 },
    ralentir: { minutes: 10, energy: 0, hydration: 0, fatigue: -1, mental: 0, risk: 0.06 },
    adapter: {
      minutes: 4,
      energy: 0,
      hydration: 0,
      fatigue: 1,
      mental: 1,
      risk: 0.08,
      need: "jacket",
      fallback: { minutes: 8, energy: 0, hydration: -1, fatigue: 3, mental: -2, risk: 0.2 },
    },
    risquer: { minutes: -6, energy: -2, hydration: -2, fatigue: 3, mental: 0, risk: 0.62 },
  },
  chaleur: {
    continuer: { minutes: 0, energy: -2, hydration: -8, fatigue: 1, mental: -1 },
    ralentir: { minutes: 8, energy: 0, hydration: -3, fatigue: -1, mental: 0 },
    adapter: {
      minutes: 4,
      energy: 0,
      hydration: 10,
      fatigue: 0,
      mental: 1,
      drink: true,
      need: "drink",
      fallback: { minutes: 2, energy: 0, hydration: -6, fatigue: 1, mental: -3 },
    },
    risquer: { minutes: -4, energy: -6, hydration: -10, fatigue: 4, mental: -2 },
  },
  froid: {
    continuer: { minutes: 0, energy: -5, hydration: 0, fatigue: 1, mental: -3 },
    ralentir: { minutes: 8, energy: -2, hydration: 0, fatigue: 0, mental: -1 },
    adapter: {
      minutes: 3,
      energy: -1,
      hydration: 0,
      fatigue: 0,
      mental: 3,
      need: "jacket",
      fallback: { minutes: 4, energy: -7, hydration: 0, fatigue: 2, mental: -4 },
    },
    risquer: { minutes: -4, energy: -4, hydration: 0, fatigue: 7, mental: -2 },
  },
  brouillard: {
    continuer: { minutes: 0, energy: 0, hydration: 0, fatigue: 1, mental: -1, risk: 0.3 },
    ralentir: { minutes: 9, energy: 0, hydration: 0, fatigue: 0, mental: 0, risk: 0.05 },
    adapter: { minutes: 4, energy: 0, hydration: 0, fatigue: 0, mental: 1, risk: 0.1 },
    risquer: { minutes: -6, energy: -2, hydration: 0, fatigue: 2, mental: -1, risk: 0.6 },
  },
  boue: {
    continuer: { minutes: 0, energy: -3, hydration: 0, fatigue: 5, mental: -1 },
    ralentir: { minutes: 8, energy: -1, hydration: 0, fatigue: 1, mental: 0 },
    adapter: {
      minutes: 3,
      energy: -1,
      hydration: 0,
      fatigue: 1,
      mental: 0,
      need: "grip",
      fallback: { minutes: 6, energy: -3, hydration: 0, fatigue: 6, mental: -1 },
    },
    risquer: { minutes: -5, energy: -6, hydration: 0, fatigue: 8, mental: -1, risk: 0.45 },
  },
  crampe: {
    continuer: { minutes: 0, energy: -4, hydration: 0, fatigue: 8, mental: -2 },
    ralentir: { minutes: 12, energy: 0, hydration: 0, fatigue: -6, mental: 1 },
    adapter: {
      minutes: 6,
      energy: 8,
      hydration: 0,
      fatigue: -8,
      mental: 1,
      eat: true,
      need: "eat",
      fallback: { minutes: 8, energy: 0, hydration: 0, fatigue: -2, mental: -2 },
    },
    risquer: { minutes: -3, energy: -2, hydration: 0, fatigue: 12, mental: -5 },
  },
  probleme_materiel: {
    continuer: { minutes: 6, energy: -3, hydration: 0, fatigue: 2, mental: -1 },
    ralentir: { minutes: 12, energy: -1, hydration: 0, fatigue: 1, mental: 0 },
    adapter: { minutes: 8, energy: 0, hydration: 0, fatigue: -2, mental: 1 },
    risquer: { minutes: -3, energy: -4, hydration: 0, fatigue: 3, mental: -2, risk: 0.5 },
  },
  baisse_moral: {
    continuer: { minutes: 0, energy: 0, hydration: 0, fatigue: 0, mental: -3 },
    ralentir: { minutes: 5, energy: 0, hydration: 0, fatigue: -1, mental: 2 },
    adapter: { minutes: 4, energy: 0, hydration: 0, fatigue: -1, mental: 8 },
    risquer: { minutes: -3, energy: -4, hydration: 0, fatigue: 2, mental: -8 },
  },
  manque_eau: {
    continuer: { minutes: 0, energy: 0, hydration: -5, fatigue: 1, mental: -3 },
    ralentir: { minutes: 5, energy: 0, hydration: -2, fatigue: 0, mental: -1 },
    adapter: {
      minutes: 4,
      energy: 0,
      hydration: 16,
      fatigue: -1,
      mental: 1,
      drink: true,
      need: "drink",
      fallback: { minutes: 2, energy: 0, hydration: -6, fatigue: 2, mental: -5 },
    },
    risquer: { minutes: -2, energy: -2, hydration: -10, fatigue: 5, mental: -2 },
  },
  fatigue_importante: {
    continuer: { minutes: 0, energy: -1, hydration: 0, fatigue: 5, mental: -1 },
    ralentir: { minutes: 10, energy: 0, hydration: 0, fatigue: -8, mental: 1 },
    adapter: { minutes: 6, energy: -2, hydration: 0, fatigue: -5, mental: 1 },
    risquer: { minutes: -5, energy: -6, hydration: 0, fatigue: 11, mental: -2 },
  },
  montee_brutale: {
    continuer: { minutes: 0, energy: -7, hydration: -1, fatigue: 6, mental: -1 },
    ralentir: { minutes: 12, energy: -3, hydration: 0, fatigue: 2, mental: 0 },
    adapter: {
      minutes: 5,
      energy: -2,
      hydration: 0,
      fatigue: 1,
      mental: 1,
      need: "poles",
      fallback: { minutes: 8, energy: -9, hydration: -1, fatigue: 7, mental: -2 },
    },
    risquer: { minutes: -8, energy: -12, hydration: -2, fatigue: 9, mental: -1 },
  },
  descente_technique: {
    continuer: { minutes: 0, energy: -1, hydration: 0, fatigue: 3, mental: 0, risk: 0.34 },
    ralentir: { minutes: 10, energy: 0, hydration: 0, fatigue: -2, mental: 0, risk: 0.08 },
    adapter: {
      minutes: 4,
      energy: 0,
      hydration: 0,
      fatigue: 1,
      mental: 0,
      risk: 0.1,
      need: "grip",
      fallback: { minutes: 8, energy: -2, hydration: 0, fatigue: 4, mental: -1, risk: 0.28 },
    },
    risquer: { minutes: -8, energy: -2, hydration: 0, fatigue: 4, mental: 0, risk: 0.66 },
  },
  second_souffle: {
    pousser: { minutes: -5, energy: -4, hydration: -1, fatigue: 2, mental: 6 },
    consolider: { minutes: 2, energy: 2, hydration: 0, fatigue: -7, mental: 3 },
  },
};

export function pickEvent(
  state: RaceState,
  segment: TerrainSegment,
  mods: LoadoutMods,
): string | null {
  const seen = new Set(state.seenEvents);
  const unseen = (id: string) => !seen.has(id);

  if (state.hydration <= 22 && unseen("manque_eau")) return "manque_eau";
  if ((state.energy <= 28 || state.fatigue >= 86) && unseen("crampe")) return "crampe";
  if (state.fatigue >= 74 && unseen("fatigue_importante")) return "fatigue_importante";

  if (segment.weather === "cold" && mods.protection < JACKET_PROTECTION_NEED && unseen("froid")) {
    return "froid";
  }
  if (
    segment.weather === "rain" &&
    (segment.terrainType === "descent" ||
      segment.terrainType === "muddy" ||
      segment.terrainType === "technical" ||
      segment.terrainType === "rocky") &&
    unseen("pluie")
  ) {
    return "pluie";
  }
  if (segment.weather === "heat" && unseen("chaleur")) return "chaleur";
  if (segment.weather === "fog" && unseen("brouillard")) return "brouillard";

  if (isSteepClimb(segment) && unseen("montee_brutale")) return "montee_brutale";
  if (segment.terrainType === "muddy" && unseen("boue")) return "boue";
  if (isTechnicalDescent(segment) && unseen("descente_technique")) return "descente_technique";
  if (
    segment.terrainType === "rocky" &&
    mods.grip + mods.terrainBonus < GRIP_NEED &&
    unseen("probleme_materiel")
  ) {
    return "probleme_materiel";
  }
  if (state.mental <= 36 && unseen("baisse_moral")) return "baisse_moral";
  if (
    segment.terrainType === "rolling" &&
    segment.weather === "clear" &&
    state.fatigue < 48 &&
    state.energy > 58 &&
    state.hydration > 40 &&
    unseen("second_souffle")
  ) {
    return "second_souffle";
  }
  return null;
}

function needMet(need: Effect["need"], state: RaceState, mods: LoadoutMods): boolean {
  if (!need) return true;
  if (need === "jacket") return mods.protection >= JACKET_PROTECTION_NEED;
  if (need === "poles") return mods.hasPoles;
  if (need === "grip") return mods.grip + mods.terrainBonus >= GRIP_NEED;
  if (need === "drink") return state.drinksLeft > 0;
  return state.eatsLeft > 0;
}

export function resolveChoice(
  eventId: string,
  choiceId: string,
  state: RaceState,
): { effect: Effect; replaced: boolean } | null {
  const table = EFFECTS[eventId];
  const effect = table?.[choiceId];
  if (!effect) return null;
  if (effect.need && effect.fallback && !needMet(effect.need, state, state.mods)) {
    return { effect: effect.fallback, replaced: true };
  }
  return { effect, replaced: false };
}

export function describeEffect(effect: Effect): string {
  const parts: string[] = [];
  if (effect.minutes) parts.push(`temps ${signed(effect.minutes)} min`);
  if (effect.energy) parts.push(`énergie ${signed(effect.energy)}`);
  if (effect.hydration) parts.push(`hydratation ${signed(effect.hydration)}`);
  if (effect.fatigue) parts.push(`fatigue ${signed(effect.fatigue)}`);
  if (effect.mental) parts.push(`mental ${signed(effect.mental)}`);
  if (effect.risk) parts.push(`risque ${Math.round(effect.risk * 100)} %`);
  if (effect.drink) parts.push("consomme une buvée");
  if (effect.eat) parts.push("consomme un repas");
  return parts.join(" · ") || "Aucun changement chiffré";
}

export function applyEventChoice(
  state: RaceState,
  eventId: string,
  choiceId: string,
): { delta: StatDelta; note: string } | null {
  const resolved = resolveChoice(eventId, choiceId, state);
  if (!resolved) return null;
  const { effect, replaced } = resolved;
  const delta: StatDelta = {
    minutes: effect.minutes,
    energy: effect.energy,
    hydration: effect.hydration,
    fatigue: effect.fatigue,
    mental: softenMentalLoss(effect.mental, state.ranks),
  };
  let note = replaced ? "Condition non remplie." : "Choix appliqué.";
  if (effect.drink && state.drinksLeft > 0) state.drinksLeft -= 1;
  if (effect.eat && state.eatsLeft > 0) state.eatsLeft -= 1;
  if (effect.risk && effect.risk > 0) {
    const roll = unitHash([
      state.seed,
      "event",
      eventId,
      choiceId,
      String(state.currentSegment),
    ]);
    if (roll < effect.risk) {
      delta.minutes += 8;
      delta.energy -= 8;
      delta.fatigue += 10;
      delta.mental -= 4;
      note = replaced ? "Condition non remplie. Incident." : "Incident sur le terrain.";
    }
  }
  return { delta, note };
}

export function choiceLabel(eventId: string, choiceId: string): string {
  return eventById(eventId)?.choices.find((choice) => choice.id === choiceId)?.label ?? choiceId;
}
