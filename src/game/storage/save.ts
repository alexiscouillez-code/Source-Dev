import { EQUIPMENT } from "@/game/data/equipment";
import { DEFAULT_PREP } from "@/game/data/plans";
import { createRunner } from "@/game/engine/ProgressionEngine";
import type { PrepChoices, SaveData } from "@/game/models/types";

export const SAVE_KEY = "trail-survival-save-v1";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createDefaultSave(): SaveData {
  return {
    version: 1,
    runner: createRunner(),
    ownedEquipmentIds: EQUIPMENT.filter((item) => item.unlockLevel <= 1).map((item) => item.id),
    equipped: {
      shoes: DEFAULT_PREP.shoesId,
      pack: DEFAULT_PREP.packId,
      poles: DEFAULT_PREP.polesId,
      jacket: DEFAULT_PREP.jacketId,
      lamp: DEFAULT_PREP.lampId,
    },
    history: [],
    activeRace: null,
    lastResultId: null,
    lastPrep: { ...DEFAULT_PREP },
  };
}

export function parseSave(raw: string): SaveData | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (!isSave(data)) return null;
    return data;
  } catch {
    return null;
  }
}

export function loadSave(storage: KeyValueStore | null = browserStore()): SaveData {
  if (!storage) return createDefaultSave();
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return createDefaultSave();
  return parseSave(raw) ?? createDefaultSave();
}

export function writeSave(save: SaveData, storage: KeyValueStore | null = browserStore()): void {
  if (!storage) return;
  storage.setItem(SAVE_KEY, JSON.stringify(save));
}

export function defaultPrep(): PrepChoices {
  return { ...DEFAULT_PREP };
}

function browserStore(): KeyValueStore | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function isSave(data: unknown): data is SaveData {
  if (!data || typeof data !== "object") return false;
  const save = data as SaveData;
  if (save.version !== 1) return false;
  if (!save.runner || typeof save.runner.name !== "string" || typeof save.runner.level !== "number") {
    return false;
  }
  if (!Array.isArray(save.history) || !Array.isArray(save.ownedEquipmentIds)) return false;
  if (!save.equipped || typeof save.equipped.shoes !== "string") return false;
  if (save.activeRace !== null) {
    if (!save.activeRace || typeof save.activeRace.raceId !== "string") return false;
    if (typeof save.activeRace.energy !== "number") return false;
  }
  return true;
}
