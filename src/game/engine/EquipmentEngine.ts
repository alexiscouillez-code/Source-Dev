import { equipmentById } from "@/game/data/equipment";
import { HYDRATION, NUTRITION } from "@/game/data/plans";
import type {
  EquipmentItem,
  LoadoutMods,
  PrepChoices,
} from "@/game/models/types";

export function emptyMods(): LoadoutMods {
  return {
    weightG: 0,
    grip: 0,
    comfort: 0,
    protection: 0,
    energyBonus: 0,
    hydrationBonus: 0,
    terrainBonus: 0,
    hasPoles: false,
    lampPower: 0,
  };
}

export function aggregateEquipment(
  items: EquipmentItem[],
  extraWeightG = 0,
): LoadoutMods {
  const mods = emptyMods();
  for (const item of items) {
    mods.weightG += item.weight;
    mods.grip += item.grip;
    mods.comfort += item.comfort;
    mods.energyBonus += item.energyBonus;
    mods.hydrationBonus += item.hydrationBonus;
    mods.terrainBonus += item.terrainBonus;
    if (item.type === "jacket") mods.protection += item.protection;
    if (item.type === "poles" && item.id !== "poles-none") mods.hasPoles = true;
    if (item.type === "lamp") mods.lampPower = item.protection;
  }
  mods.weightG += extraWeightG;
  return mods;
}

export function itemsFromPrep(prep: PrepChoices): EquipmentItem[] | null {
  const ids = [prep.shoesId, prep.packId, prep.polesId, prep.jacketId, prep.lampId];
  const items: EquipmentItem[] = [];
  for (const id of ids) {
    const item = equipmentById(id);
    if (!item) return null;
    items.push(item);
  }
  return items;
}

export function modsFromPrep(prep: PrepChoices): LoadoutMods | null {
  const items = itemsFromPrep(prep);
  if (!items) return null;
  return aggregateEquipment(items, HYDRATION[prep.hydration].weightG);
}

export interface PrepEffectLine {
  label: string;
  value: string;
}

export function describeMods(mods: LoadoutMods): PrepEffectLine[] {
  const weightKg = mods.weightG / 1000;
  const weight = `${weightKg > 0 ? "" : "−"}${Math.abs(weightKg).toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} kg`;
  return [
    { label: "Adhérence", value: signedStat(mods.grip) },
    { label: "Confort", value: signedStat(mods.comfort) },
    { label: "Protection", value: signedStat(mods.protection) },
    { label: "Poids", value: weight },
    { label: "Énergie", value: `${signedStat(mods.energyBonus)} %` },
    { label: "Hydratation", value: `${signedStat(mods.hydrationBonus)} %` },
    { label: "Terrain", value: signedStat(mods.terrainBonus) },
  ];
}

function signedStat(value: number): string {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

export function describeNutrition(prep: PrepChoices): string {
  return NUTRITION[prep.nutrition].detail;
}

export function describeHydration(prep: PrepChoices): string {
  return HYDRATION[prep.hydration].detail;
}
