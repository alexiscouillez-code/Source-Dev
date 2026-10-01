import { analyzeRun } from "@/game/analysis/analyze";
import { RACES } from "@/game/data/races";
import { DEFAULT_PREP } from "@/game/data/plans";
import { energyCost } from "@/game/engine/EnergyEngine";
import { fatigueGain } from "@/game/engine/FatigueEngine";
import { GameEngine } from "@/game/engine/GameEngine";
import { hydrationCost } from "@/game/engine/HydrationEngine";
import { pickEvent } from "@/game/engine/EventEngine";
import { paceMinPerKm } from "@/game/engine/RaceEngine";
import { incidentTriggers } from "@/game/engine/RiskEngine";
import { effectiveStats, xpForRun } from "@/game/engine/ProgressionEngine";
import { createDefaultSave, loadSave, parseSave, writeSave, type KeyValueStore } from "@/game/storage/save";
import type { PaceAction, RaceState, SimContext } from "@/game/models/types";
import { describe, expect, it } from "vitest";

function engine(seed?: string): GameEngine {
  const game = new GameEngine(createDefaultSave());
  game.startRace("alpine-50", DEFAULT_PREP, seed ?? "test");
  return game;
}

function context(action: PaceAction, patch?: Partial<SimContext>): SimContext {
  const segment = RACES[0]?.segments[0];
  if (!segment) throw new Error("segment");
  const base: SimContext = {
    segment,
    action,
    energy: 84,
    hydration: 78,
    fatigue: 12,
    mental: 74,
    stats: effectiveStats(createDefaultSave().runner),
    ranks: createDefaultSave().runner.ranks,
    mods: {
      weightG: 800,
      grip: 18,
      comfort: 20,
      protection: 16,
      energyBonus: 6,
      hydrationBonus: 10,
      terrainBonus: 14,
      hasPoles: true,
      lampPower: 4,
    },
  };
  return { ...base, ...patch, segment: patch?.segment ?? segment };
}

function memoryStore(): KeyValueStore & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => {
      raw.set(key, value);
    },
  };
}

function safeChoice(eventId: string): string {
  if (eventId === "second_souffle") return "consolider";
  if (eventId === "chaleur" || eventId === "manque_eau" || eventId === "crampe" || eventId === "montee_brutale") {
    return "adapter";
  }
  return "ralentir";
}

function playManaged(game: GameEngine): void {
  let guard = 0;
  while (game.getRace() && guard < 120) {
    guard += 1;
    const race = game.getRace();
    if (!race) break;
    if (race.phase === "event" && race.pendingEventId) {
      game.chooseEvent(safeChoice(race.pendingEventId));
      continue;
    }
    if (race.phase === "aid") {
      if (!race.aidUsed.drink && race.hydration < 82) game.useAid("drink");
      else if (!race.aidUsed.eat && race.energy < 82) game.useAid("eat");
      else if (!race.aidUsed.recover && race.fatigue > 34) game.useAid("recover");
      else game.useAid("leave");
      continue;
    }
    if (race.drinksLeft > 0 && race.hydration < 56) {
      game.executeAction("DRINK");
      continue;
    }
    if (race.eatsLeft > 0 && race.energy < 66) {
      game.executeAction("EAT");
      continue;
    }
    const segment = RACES.find((raceDef) => raceDef.id === race.raceId)?.segments[race.currentSegment];
    if (!segment) throw new Error("segment manquant");
    const action: PaceAction =
      segment.terrainType === "climb" || segment.slope >= 6 || segment.difficulty >= 4 ? "SAVE" : "NORMAL";
    game.executeAction(action);
  }
  if (guard >= 120) throw new Error("boucle de course");
}

function playAttack(game: GameEngine): void {
  let guard = 0;
  while (game.getRace() && guard < 80) {
    guard += 1;
    const race = game.getRace();
    if (!race) break;
    if (race.phase === "event" && race.pendingEventId) {
      const choice = race.pendingEventId === "second_souffle" ? "pousser" : "risquer";
      game.chooseEvent(choice);
      continue;
    }
    if (race.phase === "aid") {
      game.useAid("leave");
      continue;
    }
    game.executeAction("ATTACK");
  }
}

describe("données des courses fictives", () => {
  it("aligne distance et dénivelé annoncés", () => {
    expect(RACES.length).toBeGreaterThanOrEqual(5);
    for (const race of RACES) {
      expect(race.fictional).toBe(true);
      const distance = race.segments.reduce((sum, segment) => sum + (segment.endKm - segment.startKm), 0);
      const gain = race.segments.reduce((sum, segment) => sum + segment.elevationGain, 0);
      expect(distance).toBe(race.distanceKm);
      expect(gain).toBe(race.elevationGainM);
      expect(race.segments[0]?.startKm).toBe(0);
      expect(race.segments[race.segments.length - 1]?.endKm).toBe(race.distanceKm);
    }
    const alpine = RACES.find((race) => race.id === "alpine-50");
    expect(alpine?.distanceKm).toBe(50);
    expect(alpine?.elevationGainM).toBe(2950);
    expect(alpine?.segments.map((segment) => segment.endKm)).toEqual([8, 17, 23, 31, 38, 50]);
  });
});

describe("moteur", () => {
  it("fait perdre plus d'énergie et gagner plus de fatigue en attaquant", () => {
    const attack = context("ATTACK");
    const save = context("SAVE");
    expect(energyCost(attack)).toBeGreaterThan(energyCost(save));
    expect(fatigueGain(attack)).toBeGreaterThan(fatigueGain(save));

    let compared = false;
    for (let index = 0; index < 40; index += 1) {
      const seed = `cmp-${index}`;
      const attacker = engine(seed);
      const saver = engine(seed);
      const attackCtx = context("ATTACK");
      const saveCtx = context("SAVE");
      if (incidentTriggers(attackCtx, seed) || incidentTriggers(saveCtx, seed)) continue;
      attacker.executeAction("ATTACK");
      saver.executeAction("SAVE");
      const attackRace = attacker.getRace();
      const saveRace = saver.getRace();
      expect(attackRace).not.toBeNull();
      expect(saveRace).not.toBeNull();
      expect(attackRace?.energy).toBeLessThan(saveRace?.energy ?? 0);
      expect(attackRace?.fatigue).toBeGreaterThan(saveRace?.fatigue ?? 100);
      compared = true;
      break;
    }
    expect(compared).toBe(true);
  });

  it("rend la montée plus coûteuse que le roulant et la chaleur plus assoiffante", () => {
    const climb = context("NORMAL");
    const rolling = context("NORMAL", {
      segment: {
        ...climb.segment,
        terrainType: "rolling",
        elevationGain: climb.segment.elevationGain,
      },
    });
    expect(energyCost(climb)).toBeGreaterThan(energyCost(rolling));
    const clear = hydrationCost(context("NORMAL"));
    const heat = hydrationCost(
      context("NORMAL", { segment: { ...climb.segment, weather: "heat" } }),
    );
    expect(heat).toBeGreaterThan(clear);
  });

  it("réduit le coût avec un meilleur bonus d'énergie", () => {
    const heavy = context("NORMAL", {
      mods: { ...context("NORMAL").mods, energyBonus: -4 },
    });
    const light = context("NORMAL", {
      mods: { ...context("NORMAL").mods, energyBonus: 12 },
    });
    expect(energyCost(light)).toBeLessThan(energyCost(heavy));
  });

  it("ralentit la nuit sans lampe", () => {
    const segment = RACES.find((race) => race.id === "combes-42")?.segments[1];
    if (!segment) throw new Error("segment de nuit");
    const darkGame = new GameEngine(createDefaultSave());
    const litGame = new GameEngine(createDefaultSave());
    darkGame.startRace("combes-42", { ...DEFAULT_PREP, lampId: "lamp-none" }, "night-dark");
    litGame.startRace("combes-42", { ...DEFAULT_PREP, lampId: "lamp-200" }, "night-lit");
    const darkMods = darkGame.getRace()?.mods;
    const litMods = litGame.getRace()?.mods;
    expect(darkMods?.lampPower).toBe(0);
    expect(litMods?.lampPower).toBeGreaterThanOrEqual(4);
    const base = context("NORMAL", { segment });
    expect(paceMinPerKm({ ...base, mods: darkMods ?? base.mods })).toBeGreaterThan(
      paceMinPerKm({ ...base, mods: litMods ?? base.mods }),
    );
  });

  it("boire augmente l'hydratation sans avancer", () => {
    const game = engine("drink");
    const before = game.getRace();
    game.executeAction("DRINK");
    const after = game.getRace();
    expect(after?.distance).toBe(before?.distance);
    expect(after?.hydration).toBeGreaterThan(before?.hydration ?? 0);
    expect(after?.elapsedTime).toBeGreaterThan(before?.elapsedTime ?? 0);
    expect(after?.currentSegment).toBe(0);
  });

  it("déclenche la pluie sur la descente alpine si le coureur tient", () => {
    const game = engine("events");
    const race = game.getRace();
    if (!race) throw new Error("course");
    const descent = RACES[0]?.segments[2];
    if (!descent) throw new Error("descente");
    const forced: RaceState = {
      ...race,
      hydration: 70,
      energy: 70,
      fatigue: 30,
      mental: 70,
      seenEvents: [],
    };
    expect(pickEvent(forced, descent, race.mods)).toBe("pluie");
  });

  it("fait durer plus longtemps le choix ralentir que continuer", () => {
    const pushed = engine("slow");
    const held = engine("hold");
    advanceToEvent(pushed);
    advanceToEvent(held);
    const beforePush = pushed.getRace()?.elapsedTime ?? 0;
    const beforeHold = held.getRace()?.elapsedTime ?? 0;
    pushed.chooseEvent("ralentir");
    held.chooseEvent("continuer");
    const pushTime = (pushed.getRace()?.elapsedTime ?? pushed.getSave().history[0]?.elapsedMinutes ?? 0) - beforePush;
    const holdTime = (held.getRace()?.elapsedTime ?? held.getSave().history[0]?.elapsedMinutes ?? 0) - beforeHold;
    expect(pushTime).toBeGreaterThan(holdTime);
  });

  it("termine ALPINE 50 avec une gestion sobre et échoue en attaquant tout", () => {
    const managed = engine("managed");
    playManaged(managed);
    const managedSave = managed.getSave();
    const finish = managedSave.history[0];
    expect(finish?.status).toBe("FINISH");
    expect(finish?.distanceKm).toBe(50);
    expect(finish?.eventLog.length).toBeGreaterThan(0);
    expect(managedSave.runner.xp + (managedSave.runner.level - 1) * 100).toBe(finish?.xpGained);
    expect(managedSave.runner.level).toBeGreaterThan(1);

    const attacker = engine("attack");
    playAttack(attacker);
    const dnf = attacker.getSave().history[0];
    expect(dnf?.status).toBe("DNF");
    expect(dnf?.dnfReason).toBeTruthy();
    expect(dnf?.distanceKm).toBeLessThan(50);
  });

  it("donne le même résultat pour la même graine", () => {
    const first = engine("stable");
    const second = engine("stable");
    playManaged(first);
    playManaged(second);
    expect(first.getSave().history[0]).toEqual(second.getSave().history[0]);
  });

  it("calcule l'XP et débloque un rang qui change la course suivante", () => {
    expect(xpForRun("FINISH", 50, 2950)).toBeGreaterThanOrEqual(100);
    const game = engine("xp");
    playManaged(game);
    expect(game.spend("ENDURANCE")).toBe(true);
    const skilledPreview = new GameEngine(game.getSave());
    skilledPreview.startRace("alpine-50", DEFAULT_PREP, "after-skill");
    const plain = new GameEngine(createDefaultSave());
    plain.startRace("alpine-50", DEFAULT_PREP, "plain");
    const skilledCost = skilledPreview.previewPace("NORMAL")?.energy ?? 0;
    const plainCost = plain.previewPace("NORMAL")?.energy ?? 0;
    expect(skilledCost).toBeGreaterThan(plainCost);
  });

  it("analyse uniquement les données du résultat", () => {
    const game = engine("analysis");
    playManaged(game);
    const result = game.getSave().history[0];
    if (!result) throw new Error("résultat");
    const analysis = analyzeRun(result);
    expect(analysis.summary).toContain("Arrivée");
    expect(analysis.bestSegment).toContain("Meilleur segment");
    expect(analysis.criticalSegment).toContain("Segment critique");
    expect(analysis.bestDecision.length).toBeGreaterThan(10);
    expect(analysis.worstDecision.length).toBeGreaterThan(10);
  });

  it("conserve la course et la progression dans la sauvegarde", () => {
    const game = engine("persist");
    game.executeAction("SAVE");
    game.renameRunner("Nuria");
    const store = memoryStore();
    writeSave(game.getSave(), store);
    const loaded = loadSave(store);
    expect(loaded.runner.name).toBe("Nuria");
    expect(loaded.activeRace?.distance).toBe(8);
    expect(loaded.activeRace?.energy).toBe(game.getRace()?.energy);
    const resumed = new GameEngine(loaded);
    expect(resumed.getRace()?.currentSegment).toBe(game.getRace()?.currentSegment);
    expect(parseSave("{")).toBeNull();
    expect(loadSave({ getItem: () => "{", setItem: () => undefined }).runner.name).toBe("Coureur");
  });
});

function advanceToEvent(game: GameEngine): void {
  let guard = 0;
  while (game.getRace()?.phase !== "event" && guard < 30) {
    guard += 1;
    const race = game.getRace();
    if (!race) throw new Error("course terminée avant l'événement");
    if (race.phase === "aid") {
      game.useAid("leave");
      continue;
    }
    if (race.hydration < 50 && race.drinksLeft > 0) game.executeAction("DRINK");
    else game.executeAction("SAVE");
  }
  if (game.getRace()?.phase !== "event") throw new Error("événement absent");
}
