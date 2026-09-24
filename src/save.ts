import { raceById } from "./races.ts";
import type { Avatar, Hair, RaceId, Save } from "./types.ts";

const KEY = "le-profil-v1";
const RACE_IDS = new Set<RaceId>(["occ", "ccc", "utmb"]);
const HAIRS = new Set<Hair>(["court", "chignon", "casquette", "rase"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function loadSave(): Save | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const save = parseSave(parsed);
    return save ? sanitizeSave(save) : null;
  } catch {
    return null;
  }
}

export function writeSave(save: Save): void {
  localStorage.setItem(KEY, JSON.stringify(save));
}

export function clearSave(): void {
  localStorage.removeItem(KEY);
}

function parseSave(value: unknown): Save | null {
  if (!isRecord(value) || value.v !== 1) return null;
  if (typeof value.raceId !== "string" || !RACE_IDS.has(value.raceId as RaceId)) {
    return null;
  }
  if (!isRecord(value.avatar)) return null;
  const name = value.avatar.name;
  const skin = value.avatar.skin;
  const hair = value.avatar.hair;
  const jersey = value.avatar.jersey;
  if (typeof name !== "string") return null;
  if (typeof skin !== "number" || skin < 0 || skin > 3) return null;
  if (typeof hair !== "string" || !HAIRS.has(hair as Hair)) return null;
  if (typeof jersey !== "number" || jersey < 0 || jersey > 3) return null;
  const segmentIndex = finite(value.segmentIndex);
  const kmFilled = finite(value.kmFilled);
  const elevationFilled = finite(value.elevationFilled);
  const outings = finite(value.outings);
  if (
    segmentIndex === null ||
    kmFilled === null ||
    elevationFilled === null ||
    outings === null
  ) {
    return null;
  }
  const lastComment =
    typeof value.lastComment === "string" ? value.lastComment : null;
  const avatar: Avatar = {
    name: name.slice(0, 18),
    skin,
    hair: hair as Hair,
    jersey,
  };
  return {
    v: 1,
    raceId: value.raceId as RaceId,
    avatar,
    segmentIndex,
    kmFilled,
    elevationFilled,
    outings: Math.max(0, Math.round(outings)),
    lastComment,
  };
}

export function sanitizeSave(save: Save): Save {
  const race = raceById(save.raceId);
  let segmentIndex = Math.min(
    Math.max(0, Math.floor(save.segmentIndex)),
    race.segments.length,
  );
  let kmFilled = save.kmFilled;
  let elevationFilled = save.elevationFilled;

  while (segmentIndex < race.segments.length) {
    const segment = race.segments[segmentIndex];
    if (!segment) break;
    kmFilled = Math.min(Math.max(0, kmFilled), segment.km);
    elevationFilled = Math.min(
      Math.max(0, Math.round(elevationFilled)),
      segment.elevation,
    );
    const kmDone = kmFilled >= segment.km - 0.0005;
    const elevDone = elevationFilled >= segment.elevation;
    if (kmDone && elevDone) {
      segmentIndex += 1;
      kmFilled = 0;
      elevationFilled = 0;
      continue;
    }
    break;
  }

  if (segmentIndex >= race.segments.length) {
    return {
      ...save,
      segmentIndex: race.segments.length,
      kmFilled: 0,
      elevationFilled: 0,
    };
  }

  return { ...save, segmentIndex, kmFilled, elevationFilled };
}
