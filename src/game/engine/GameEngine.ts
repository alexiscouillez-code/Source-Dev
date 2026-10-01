import { EQUIPMENT, equipmentById } from "@/game/data/equipment";
import { eventById } from "@/game/data/events";
import { HYDRATION, NUTRITION } from "@/game/data/plans";
import { raceById } from "@/game/data/races";
import {
  applyEventChoice,
  choiceLabel,
  describeEffect,
  pickEvent,
  resolveChoice,
} from "@/game/engine/EventEngine";
import { itemsFromPrep, modsFromPrep } from "@/game/engine/EquipmentEngine";
import { clamp } from "@/game/engine/hash";
import { effectiveStats, grantXp, spendSkill, xpForRun } from "@/game/engine/ProgressionEngine";
import { closeHydration, hardFailure, previewSegment, resolveSegmentMath } from "@/game/engine/RaceEngine";
import { createDefaultSave } from "@/game/storage/save";
import type {
  ActionLog,
  EquipmentSlot,
  PaceAction,
  PacePreview,
  PlayerAction,
  PrepChoices,
  RaceResult,
  RaceState,
  ResourcePreview,
  ResultStatus,
  SaveData,
  SimContext,
  SkillBranch,
  StatDelta,
  TerrainSegment,
} from "@/game/models/types";

const PACE_LABEL: Record<PaceAction, string> = {
  ATTACK: "Attaquer",
  NORMAL: "Allure normale",
  SAVE: "Économiser",
};

export interface EventChoiceView {
  id: string;
  label: string;
  detail: string;
}

export interface EventView {
  id: string;
  title: string;
  text: string;
  choices: EventChoiceView[];
}

export class GameEngine {
  private save: SaveData;

  constructor(save: SaveData) {
    this.save = structuredClone(save);
  }

  getSave(): SaveData {
    return structuredClone(this.save);
  }

  getRace(): RaceState | null {
    return this.save.activeRace ? structuredClone(this.save.activeRace) : null;
  }

  renameRunner(name: string): void {
    const clean = name.trim().slice(0, 24);
    if (!clean) return;
    this.save.runner.name = clean;
  }

  equip(slot: EquipmentSlot, itemId: string): boolean {
    if (this.save.activeRace) return false;
    const item = equipmentById(itemId);
    if (!item || item.type !== slot) return false;
    if (!this.save.ownedEquipmentIds.includes(itemId)) return false;
    if (item.unlockLevel > this.save.runner.level) return false;
    this.save.equipped[slot] = itemId;
    return true;
  }

  spend(branch: SkillBranch): boolean {
    return spendSkill(this.save.runner, branch);
  }

  reset(): void {
    this.save = createDefaultSave();
  }

  startRace(raceId: string, prep: PrepChoices, seed?: string): RaceState | null {
    if (this.save.activeRace) return null;
    const race = raceById(raceId);
    const items = itemsFromPrep(prep);
    const mods = modsFromPrep(prep);
    if (!race || !items || !mods) return null;
    const slots: EquipmentSlot[] = ["shoes", "pack", "poles", "jacket", "lamp"];
    for (let index = 0; index < slots.length; index += 1) {
      const item = items[index];
      const slot = slots[index];
      if (!item || !slot || item.type !== slot) return null;
      if (!this.save.ownedEquipmentIds.includes(item.id)) return null;
      if (item.unlockLevel > this.save.runner.level) return null;
    }
    const nutrition = NUTRITION[prep.nutrition];
    const hydration = HYDRATION[prep.hydration];
    const first = race.segments[0];
    if (!first) return null;
    const stats = effectiveStats(this.save.runner);
    const state: RaceState = {
      raceId: race.id,
      seed: seed ?? `${race.id}-${this.save.history.length + 1}`,
      distance: 0,
      totalDistance: race.distanceKm,
      elevationGain: 0,
      remainingElevation: race.elevationGainM,
      energy: nutrition.startEnergy,
      hydration: hydration.startHydration,
      fatigue: 12,
      mental: 74,
      pace: 0,
      elapsedTime: 0,
      currentSegment: 0,
      status: "racing",
      phase: "running",
      dnfReason: null,
      weather: first.weather,
      drinksLeft: hydration.drinks,
      eatsLeft: nutrition.eats,
      criticalHydrationStreak: 0,
      pendingEventId: null,
      aidAvailable: false,
      aidUsed: { drink: false, eat: false, recover: false },
      seenEvents: [],
      segmentLog: [],
      actionLog: [],
      eventLog: [],
      lastDelta: null,
      flash: "Départ.",
      levelBefore: this.save.runner.level,
      nutrition: prep.nutrition,
      hydrationPlan: prep.hydration,
      equipmentIds: items.map((item) => item.id),
      mods,
      stats,
      ranks: { ...this.save.runner.ranks },
      prep: { ...prep },
    };
    this.save.equipped = {
      shoes: prep.shoesId,
      pack: prep.packId,
      poles: prep.polesId,
      jacket: prep.jacketId,
      lamp: prep.lampId,
    };
    this.save.lastPrep = { ...prep };
    this.save.activeRace = state;
    return this.getRace();
  }

  previewPace(action: PaceAction): PacePreview | null {
    const race = this.save.activeRace;
    if (!race || race.phase !== "running") return null;
    return previewSegment(this.context(action));
  }

  previewResource(action: "DRINK" | "EAT"): ResourcePreview | null {
    const race = this.save.activeRace;
    if (!race || race.phase !== "running") return null;
    if (action === "DRINK") {
      const plan = HYDRATION[race.hydrationPlan];
      if (race.drinksLeft <= 0) {
        return {
          minutes: 1,
          energy: 0,
          hydration: 0,
          fatigue: 0,
          mental: -2,
          blocked: true,
          detail: "Plus d'eau",
        };
      }
      return {
        minutes: plan.drinkMinutes,
        energy: 0,
        hydration: plan.drinkHydration,
        fatigue: -1,
        mental: 0,
        blocked: false,
        detail: `+${plan.drinkHydration} hydratation · ${plan.drinkMinutes} min`,
      };
    }
    const plan = NUTRITION[race.nutrition];
    if (race.eatsLeft <= 0) {
      return {
        minutes: 1,
        energy: 0,
        hydration: 0,
        fatigue: 0,
        mental: -1,
        blocked: true,
        detail: "Plus de ravitaillement",
      };
    }
    return {
      minutes: plan.eatMinutes,
      energy: plan.eatEnergy,
      hydration: 0,
      fatigue: plan.eatFatigue,
      mental: plan.eatMental,
      blocked: false,
      detail: `${plan.eatEnergy > 0 ? "+" : ""}${plan.eatEnergy} énergie · ${plan.eatMinutes} min`,
    };
  }

  eventView(): EventView | null {
    const race = this.save.activeRace;
    if (!race?.pendingEventId) return null;
    const definition = eventById(race.pendingEventId);
    if (!definition) return null;
    return {
      id: definition.id,
      title: definition.title,
      text: definition.text,
      choices: definition.choices.map((choice) => {
        const resolved = resolveChoice(definition.id, choice.id, race);
        const detail = resolved
          ? `${describeEffect(resolved.effect)}${resolved.replaced ? " · condition non remplie" : ""}`
          : "";
        return { id: choice.id, label: choice.label, detail };
      }),
    };
  }

  executeAction(action: PlayerAction): void {
    const race = this.save.activeRace;
    if (!race || race.phase !== "running") return;
    if (action === "DRINK" || action === "EAT") {
      this.useResource(action);
      return;
    }
    this.runSegment(action);
  }

  chooseEvent(choiceId: string): void {
    const race = this.save.activeRace;
    if (!race || race.phase !== "event" || !race.pendingEventId) return;
    const eventId = race.pendingEventId;
    const applied = applyEventChoice(race, eventId, choiceId);
    if (!applied) return;
    this.applyDelta(applied.delta);
    const label = choiceLabel(eventId, choiceId);
    race.eventLog.push({
      segmentIndex: race.currentSegment,
      eventId,
      choiceId,
      title: eventById(eventId)?.title ?? eventId,
      choiceLabel: label,
      delta: applied.delta,
      note: applied.note,
    });
    this.pushAction({
      kind: "event",
      id: `${eventId}:${choiceId}`,
      segmentIndex: race.currentSegment,
      label,
      delta: applied.delta,
      note: applied.note,
    });
    race.flash = `${eventById(eventId)?.title ?? "Événement"} · ${label}. ${applied.note}`;
    race.pendingEventId = null;
    const cause = hardFailure(race);
    if (cause) {
      this.conclude("DNF", cause);
      return;
    }
    this.proceed();
  }

  previewAid(choice: "drink" | "eat" | "recover"): StatDelta | null {
    const race = this.save.activeRace;
    if (!race || race.phase !== "aid" || race.aidUsed[choice]) return null;
    return aidDelta(choice);
  }

  useAid(choice: "drink" | "eat" | "recover" | "leave"): void {
    const race = this.save.activeRace;
    if (!race || race.phase !== "aid") return;
    if (choice === "leave") {
      race.aidAvailable = false;
      race.flash = "Repartir.";
      this.proceed();
      return;
    }
    if (race.aidUsed[choice]) return;
    const delta = aidDelta(choice);
    race.aidUsed[choice] = true;
    if (choice === "drink") race.drinksLeft = Math.min(8, race.drinksLeft + 2);
    if (choice === "eat") race.eatsLeft += 1;
    this.applyDelta(delta);
    const label = choice === "drink" ? "Boire au ravitaillement" : choice === "eat" ? "Manger au ravitaillement" : "Récupérer";
    this.pushAction({
      kind: "aid",
      id: choice,
      segmentIndex: race.currentSegment,
      label,
      delta,
      note: "Ravitaillement",
    });
    race.flash = `${label}.`;
    const cause = hardFailure(race);
    if (cause) this.conclude("DNF", cause);
  }

  abandon(): void {
    if (!this.save.activeRace) return;
    this.conclude("ABANDON", "Abandon volontaire");
  }

  private useResource(action: "DRINK" | "EAT"): void {
    const race = this.save.activeRace;
    if (!race) return;
    const preview = this.previewResource(action);
    if (!preview) return;
    if (action === "DRINK" && race.drinksLeft > 0) race.drinksLeft -= 1;
    if (action === "EAT" && race.eatsLeft > 0) race.eatsLeft -= 1;
    const delta: StatDelta = {
      minutes: preview.minutes,
      energy: preview.energy,
      hydration: preview.hydration,
      fatigue: preview.fatigue,
      mental: preview.mental,
    };
    this.applyDelta(delta);
    const label = action === "DRINK" ? "Boire" : "Manger";
    this.pushAction({
      kind: "resource",
      id: action,
      segmentIndex: race.currentSegment,
      label,
      delta,
      note: preview.blocked ? preview.detail : label,
    });
    race.flash = preview.blocked ? `${preview.detail}.` : `${label}.`;
    const cause = hardFailure(race);
    if (cause) this.conclude("DNF", cause);
  }

  private runSegment(action: PaceAction): void {
    const race = this.save.activeRace;
    if (!race) return;
    const segment = this.currentSegment();
    if (!segment) return;
    const before = {
      energy: race.energy,
      hydration: race.hydration,
      fatigue: race.fatigue,
      mental: race.mental,
    };
    const math = resolveSegmentMath(this.context(action), race.seed);
    const delta: StatDelta = {
      minutes: math.minutes,
      energy: math.energy,
      hydration: math.hydration,
      fatigue: math.fatigue,
      mental: math.mental,
    };
    this.applyDelta(delta);
    race.pace = math.pace;
    race.distance = segment.endKm;
    race.elevationGain += segment.elevationGain;
    race.remainingElevation = Math.max(0, race.remainingElevation - segment.elevationGain);
    const incident = math.incident ? "Glissade" : null;
    race.segmentLog.push({
      segmentId: segment.id,
      segmentName: segment.name,
      index: race.currentSegment,
      action,
      minutes: math.minutes,
      paceMinPerKm: math.pace,
      distanceKm: segment.endKm - segment.startKm,
      elevationGain: segment.elevationGain,
      energyBefore: before.energy,
      energyAfter: race.energy,
      hydrationBefore: before.hydration,
      hydrationAfter: race.hydration,
      fatigueBefore: before.fatigue,
      fatigueAfter: race.fatigue,
      mentalBefore: before.mental,
      mentalAfter: race.mental,
      incident,
    });
    this.pushAction({
      kind: "pace",
      id: action,
      segmentIndex: race.currentSegment,
      label: PACE_LABEL[action],
      delta,
      note: incident ?? segment.name,
    });
    race.flash = incident
      ? `${PACE_LABEL[action]} sur ${segment.name}. Glissade.`
      : `${PACE_LABEL[action]} sur ${segment.name}.`;
    const cause = hardFailure(race);
    if (cause) {
      this.conclude("DNF", cause);
      return;
    }
    if (segment.aidAtEnd) race.aidAvailable = true;
    const eventId = pickEvent(race, segment, race.mods);
    if (eventId) {
      race.pendingEventId = eventId;
      race.phase = "event";
      race.seenEvents.push(eventId);
      return;
    }
    this.proceed();
  }

  private proceed(): void {
    const race = this.save.activeRace;
    if (!race) return;
    if (race.aidAvailable) {
      race.phase = "aid";
      race.aidUsed = { drink: false, eat: false, recover: false };
      race.pendingEventId = null;
      return;
    }
    const hydro = closeHydration(race);
    if (hydro) {
      this.conclude("DNF", hydro);
      return;
    }
    const definition = raceById(race.raceId);
    if (!definition) return;
    if (race.currentSegment >= definition.segments.length - 1) {
      this.conclude("FINISH", null);
      return;
    }
    race.currentSegment += 1;
    const next = definition.segments[race.currentSegment];
    if (!next) return;
    race.weather = next.weather;
    race.phase = "running";
    race.pendingEventId = null;
  }

  private conclude(status: ResultStatus, reason: string | null): void {
    const race = this.save.activeRace;
    if (!race) return;
    const definition = raceById(race.raceId);
    if (!definition) return;
    const xpGained = xpForRun(status, race.distance, race.elevationGain);
    const levelBefore = race.levelBefore;
    grantXp(this.save.runner, xpGained);
    this.unlockForLevel();
    const number = this.save.history.length + 1;
    const result: RaceResult = {
      id: `run-${number}`,
      number,
      raceId: race.raceId,
      raceName: definition.name,
      status,
      distanceKm: race.distance,
      totalDistanceKm: race.totalDistance,
      elapsedMinutes: race.elapsedTime,
      elevationGain: race.elevationGain,
      energy: race.energy,
      hydration: race.hydration,
      fatigue: race.fatigue,
      mental: race.mental,
      xpGained,
      levelBefore,
      levelAfter: this.save.runner.level,
      dnfReason: reason,
      segmentLog: structuredClone(race.segmentLog),
      actionLog: structuredClone(race.actionLog),
      eventLog: structuredClone(race.eventLog),
      equipmentIds: [...race.equipmentIds],
      prep: { ...race.prep },
    };
    this.save.history.push(result);
    this.save.lastResultId = result.id;
    this.save.activeRace = null;
  }

  private unlockForLevel(): void {
    for (const item of EQUIPMENT) {
      if (
        item.unlockLevel <= this.save.runner.level &&
        !this.save.ownedEquipmentIds.includes(item.id)
      ) {
        this.save.ownedEquipmentIds.push(item.id);
      }
    }
  }

  private applyDelta(delta: StatDelta): void {
    const race = this.save.activeRace;
    if (!race) return;
    race.energy = clamp(race.energy + delta.energy, 0, 100);
    race.hydration = clamp(race.hydration + delta.hydration, 0, 100);
    race.fatigue = clamp(race.fatigue + delta.fatigue, 0, 100);
    race.mental = clamp(race.mental + delta.mental, 0, 100);
    race.elapsedTime = Math.max(0, race.elapsedTime + delta.minutes);
    race.lastDelta = { ...delta };
  }

  private pushAction(entry: ActionLog): void {
    this.save.activeRace?.actionLog.push(entry);
  }

  private currentSegment(): TerrainSegment | null {
    const race = this.save.activeRace;
    if (!race) return null;
    return raceById(race.raceId)?.segments[race.currentSegment] ?? null;
  }

  private context(action: PaceAction): SimContext {
    const race = this.save.activeRace;
    const segment = this.currentSegment();
    if (!race || !segment) {
      throw new Error("Course inactive");
    }
    return {
      segment,
      action,
      energy: race.energy,
      hydration: race.hydration,
      fatigue: race.fatigue,
      mental: race.mental,
      stats: race.stats,
      ranks: race.ranks,
      mods: race.mods,
    };
  }
}

function aidDelta(choice: "drink" | "eat" | "recover"): StatDelta {
  if (choice === "drink") {
    return { minutes: 3, energy: 0, hydration: 26, fatigue: -1, mental: 1 };
  }
  if (choice === "eat") {
    return { minutes: 8, energy: 22, hydration: 0, fatigue: -2, mental: 2 };
  }
  return { minutes: 12, energy: 8, hydration: 4, fatigue: -16, mental: 8 };
}
