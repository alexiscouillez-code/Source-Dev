import type { PaceAction, TerrainType, WeatherType } from "@/game/models/types";

export const ACTION: Record<
  PaceAction,
  { pace: number; energy: number; hydration: number; fatigue: number; mental: number }
> = {
  ATTACK: { pace: 0.84, energy: 1.7, hydration: 1.45, fatigue: 1.8, mental: 1 },
  NORMAL: { pace: 1, energy: 1, hydration: 1, fatigue: 1, mental: 0 },
  SAVE: { pace: 1.28, energy: 0.55, hydration: 0.82, fatigue: 0.4, mental: -1 },
};

export const TERRAIN: Record<
  TerrainType,
  { label: string; pace: number; energy: number; fatigue: number; risk: number }
> = {
  rolling: { label: "Roulant", pace: 6.2, energy: 0.68, fatigue: 0.72, risk: 0.03 },
  climb: { label: "Montée", pace: 10.8, energy: 1.28, fatigue: 1.22, risk: 0.05 },
  descent: { label: "Descente", pace: 6.8, energy: 0.8, fatigue: 1.08, risk: 0.16 },
  technical: { label: "Technique", pace: 8.4, energy: 1.14, fatigue: 1.16, risk: 0.18 },
  muddy: { label: "Boueux", pace: 8.2, energy: 1.18, fatigue: 1.2, risk: 0.15 },
  rocky: { label: "Rocheux", pace: 8.8, energy: 1.1, fatigue: 1.14, risk: 0.2 },
};

export const WEATHER: Record<
  WeatherType,
  { label: string; pace: number; energy: number; hydration: number; fatigue: number }
> = {
  clear: { label: "Clair", pace: 1, energy: 1, hydration: 1, fatigue: 1 },
  rain: { label: "Pluie", pace: 1.08, energy: 1.05, hydration: 0.9, fatigue: 1.1 },
  heat: { label: "Chaleur", pace: 1.07, energy: 1.18, hydration: 1.5, fatigue: 1.14 },
  cold: { label: "Froid", pace: 1.05, energy: 1.1, hydration: 0.88, fatigue: 1.06 },
  fog: { label: "Brouillard", pace: 1.1, energy: 1.02, hydration: 1, fatigue: 1.05 },
  wind: { label: "Vent", pace: 1.08, energy: 1.08, hydration: 1.12, fatigue: 1.12 },
};

export const MAX_SKILL_RANK = 5;
export const XP_PER_LEVEL = 100;
export const JACKET_PROTECTION_NEED = 12;
export const GRIP_NEED = 16;
