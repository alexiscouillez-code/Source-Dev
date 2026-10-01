import type { HydrationPlan, NutritionPlan, PrepChoices } from "@/game/models/types";

export interface NutritionDef {
  id: NutritionPlan;
  label: string;
  detail: string;
  startEnergy: number;
  eats: number;
  eatEnergy: number;
  eatFatigue: number;
  eatMental: number;
  eatMinutes: number;
}

export interface HydrationDef {
  id: HydrationPlan;
  label: string;
  detail: string;
  startHydration: number;
  drinks: number;
  drinkHydration: number;
  drinkMinutes: number;
  weightG: number;
}

export const NUTRITION: Record<NutritionPlan, NutritionDef> = {
  bars: {
    id: "bars",
    label: "Barres",
    detail: "Départ 84 d'énergie · 4 repas · manger +16 énergie",
    startEnergy: 84,
    eats: 4,
    eatEnergy: 16,
    eatFatigue: -1,
    eatMental: 1,
    eatMinutes: 6,
  },
  gels: {
    id: "gels",
    label: "Gels",
    detail: "Départ 78 d'énergie · 5 gels · manger +12 énergie, +2 fatigue",
    startEnergy: 78,
    eats: 5,
    eatEnergy: 12,
    eatFatigue: 2,
    eatMental: 0,
    eatMinutes: 4,
  },
  meal: {
    id: "meal",
    label: "Repas solide",
    detail: "Départ 90 d'énergie · 3 repas · manger +22 énergie, plus lent",
    startEnergy: 90,
    eats: 3,
    eatEnergy: 22,
    eatFatigue: -2,
    eatMental: 2,
    eatMinutes: 9,
  },
};

export const HYDRATION: Record<HydrationPlan, HydrationDef> = {
  flasks: {
    id: "flasks",
    label: "Flasques 1 L",
    detail: "Hydratation 78 · 4 buvées · boire +18",
    startHydration: 78,
    drinks: 4,
    drinkHydration: 18,
    drinkMinutes: 4,
    weightG: 40,
  },
  bladder: {
    id: "bladder",
    label: "Vessie 1,5 L",
    detail: "Hydratation 88 · 6 buvées · boire +16 · +80 g",
    startHydration: 88,
    drinks: 6,
    drinkHydration: 16,
    drinkMinutes: 3,
    weightG: 120,
  },
  minimal: {
    id: "minimal",
    label: "Minimal 0,5 L",
    detail: "Hydratation 64 · 2 buvées · boire +14 · plus léger",
    startHydration: 64,
    drinks: 2,
    drinkHydration: 14,
    drinkMinutes: 3,
    weightG: -40,
  },
};

export const DEFAULT_PREP: PrepChoices = {
  shoesId: "shoes-grip",
  packId: "pack-vest",
  polesId: "poles-carbon",
  jacketId: "jacket-shell",
  lampId: "lamp-200",
  nutrition: "bars",
  hydration: "flasks",
};
