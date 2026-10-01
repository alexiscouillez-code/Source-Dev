import { TERRAIN } from "@/game/engine/balance";
import type { TerrainSegment, TerrainType } from "@/game/models/types";
import { segmentDistance } from "@/game/format";

export function terrainMods(type: TerrainType) {
  return TERRAIN[type];
}

export function terrainLabel(type: TerrainType): string {
  return TERRAIN[type].label;
}

export function isSteepClimb(segment: TerrainSegment): boolean {
  const distance = Math.max(0.1, segmentDistance(segment.startKm, segment.endKm));
  return (
    segment.terrainType === "climb" &&
    (segment.slope >= 8 || segment.elevationGain / distance >= 75)
  );
}

export function isTechnicalDescent(segment: TerrainSegment): boolean {
  return (
    (segment.terrainType === "descent" || segment.terrainType === "rocky") &&
    segment.elevationLoss >= 400
  );
}
