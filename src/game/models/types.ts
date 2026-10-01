export type TerrainType =
  | "rolling"
  | "climb"
  | "descent"
  | "technical"
  | "muddy"
  | "rocky";

export type WeatherType = "clear" | "rain" | "heat" | "cold" | "fog" | "wind";

export type PaceAction = "ATTACK" | "NORMAL" | "SAVE";

export type ResourceAction = "DRINK" | "EAT";

export type PlayerAction = PaceAction | ResourceAction;

export type EquipmentSlot = "shoes" | "pack" | "poles" | "jacket" | "lamp";

export type NutritionPlan = "bars" | "gels" | "meal";

export type HydrationPlan = "flasks" | "bladder" | "minimal";

export type SkillBranch =
  | "ENDURANCE"
  | "MONTAGNE"
  | "DESCENTE"
  | "MENTAL"
  | "ULTRA";

export type RacePhase = "running" | "event" | "aid";

export type RaceStatus = "racing" | "finish" | "dnf" | "abandon";

export type ResultStatus = "FINISH" | "DNF" | "ABANDON";

export interface TerrainSegment {
  id: string;
  name: string;
  startKm: number;
  endKm: number;
  elevationGain: number;
  elevationLoss: number;
  slope: number;
  terrainType: TerrainType;
  difficulty: 1 | 2 | 3 | 4 | 5;
  weather: WeatherType;
  night: boolean;
  aidAtEnd: boolean;
}

export interface Race {
  id: string;
  name: string;
  fictional: true;
  source: "fictional";
  distanceKm: number;
  elevationGainM: number;
  startAltitudeM: number;
  terrainSummary: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  weatherSummary: string;
  segments: TerrainSegment[];
}

export interface EquipmentItem {
  id: string;
  name: string;
  type: EquipmentSlot;
  weight: number;
  grip: number;
  comfort: number;
  protection: number;
  energyBonus: number;
  hydrationBonus: number;
  terrainBonus: number;
  unlockLevel: number;
  blurb: string;
}

export interface SkillRanks {
  ENDURANCE: number;
  MONTAGNE: number;
  DESCENTE: number;
  MENTAL: number;
  ULTRA: number;
}

export interface Runner {
  name: string;
  level: number;
  xp: number;
  skillPoints: number;
  endurance: number;
  montagne: number;
  descente: number;
  resistance: number;
  mental: number;
  ranks: SkillRanks;
}

export interface EffectiveStats {
  endurance: number;
  montagne: number;
  descente: number;
  resistance: number;
  mental: number;
}

export interface LoadoutMods {
  weightG: number;
  grip: number;
  comfort: number;
  protection: number;
  energyBonus: number;
  hydrationBonus: number;
  terrainBonus: number;
  hasPoles: boolean;
  lampPower: number;
}

export interface PrepChoices {
  shoesId: string;
  packId: string;
  polesId: string;
  jacketId: string;
  lampId: string;
  nutrition: NutritionPlan;
  hydration: HydrationPlan;
}

export interface StatDelta {
  energy: number;
  hydration: number;
  fatigue: number;
  mental: number;
  minutes: number;
}

export interface SegmentLog {
  segmentId: string;
  segmentName: string;
  index: number;
  action: PaceAction;
  minutes: number;
  paceMinPerKm: number;
  distanceKm: number;
  elevationGain: number;
  energyBefore: number;
  energyAfter: number;
  hydrationBefore: number;
  hydrationAfter: number;
  fatigueBefore: number;
  fatigueAfter: number;
  mentalBefore: number;
  mentalAfter: number;
  incident: string | null;
}

export interface ActionLog {
  kind: "pace" | "resource" | "event" | "aid" | "abandon";
  id: string;
  segmentIndex: number;
  label: string;
  delta: StatDelta;
  note: string;
}

export interface EventLog {
  segmentIndex: number;
  eventId: string;
  choiceId: string;
  title: string;
  choiceLabel: string;
  delta: StatDelta;
  note: string;
}

export interface AidUsed {
  drink: boolean;
  eat: boolean;
  recover: boolean;
}

export interface RaceState {
  raceId: string;
  seed: string;
  distance: number;
  totalDistance: number;
  elevationGain: number;
  remainingElevation: number;
  energy: number;
  hydration: number;
  fatigue: number;
  mental: number;
  pace: number;
  elapsedTime: number;
  currentSegment: number;
  status: RaceStatus;
  phase: RacePhase;
  dnfReason: string | null;
  weather: WeatherType;
  drinksLeft: number;
  eatsLeft: number;
  criticalHydrationStreak: number;
  pendingEventId: string | null;
  aidAvailable: boolean;
  aidUsed: AidUsed;
  seenEvents: string[];
  segmentLog: SegmentLog[];
  actionLog: ActionLog[];
  eventLog: EventLog[];
  lastDelta: StatDelta | null;
  flash: string | null;
  levelBefore: number;
  nutrition: NutritionPlan;
  hydrationPlan: HydrationPlan;
  equipmentIds: string[];
  mods: LoadoutMods;
  stats: EffectiveStats;
  ranks: SkillRanks;
  prep: PrepChoices;
}

export interface RaceResult {
  id: string;
  number: number;
  raceId: string;
  raceName: string;
  status: ResultStatus;
  distanceKm: number;
  totalDistanceKm: number;
  elapsedMinutes: number;
  elevationGain: number;
  energy: number;
  hydration: number;
  fatigue: number;
  mental: number;
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  dnfReason: string | null;
  segmentLog: SegmentLog[];
  actionLog: ActionLog[];
  eventLog: EventLog[];
  equipmentIds: string[];
  prep: PrepChoices;
}

export interface SaveData {
  version: 1;
  runner: Runner;
  ownedEquipmentIds: string[];
  equipped: Record<EquipmentSlot, string>;
  history: RaceResult[];
  activeRace: RaceState | null;
  lastResultId: string | null;
  lastPrep: PrepChoices | null;
}

export interface SimContext {
  segment: TerrainSegment;
  action: PaceAction;
  energy: number;
  hydration: number;
  fatigue: number;
  mental: number;
  stats: EffectiveStats;
  ranks: SkillRanks;
  mods: LoadoutMods;
}

export interface PacePreview {
  minutes: number;
  energy: number;
  hydration: number;
  fatigue: number;
  mental: number;
  pace: number;
  riskPercent: number;
}

export interface ResourcePreview {
  minutes: number;
  energy: number;
  hydration: number;
  fatigue: number;
  mental: number;
  blocked: boolean;
  detail: string;
}
