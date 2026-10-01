"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { GameEngine, type EventView } from "@/game/engine/GameEngine";
import { loadSave, writeSave } from "@/game/storage/save";
import type {
  EquipmentSlot,
  PaceAction,
  PacePreview,
  PlayerAction,
  PrepChoices,
  RaceState,
  ResourcePreview,
  SaveData,
  SkillBranch,
  StatDelta,
} from "@/game/models/types";

interface GameApi {
  save: SaveData;
  race: RaceState | null;
  rename: (name: string) => void;
  equip: (slot: EquipmentSlot, itemId: string) => boolean;
  spend: (branch: SkillBranch) => boolean;
  reset: () => void;
  start: (raceId: string, prep: PrepChoices) => boolean;
  act: (action: PlayerAction) => boolean;
  chooseEvent: (choiceId: string) => boolean;
  aid: (choice: "drink" | "eat" | "recover" | "leave") => boolean;
  abandon: () => void;
  previewPace: (action: PaceAction) => PacePreview | null;
  previewResource: (action: "DRINK" | "EAT") => ResourcePreview | null;
  previewAid: (choice: "drink" | "eat" | "recover") => StatDelta | null;
  eventView: () => EventView | null;
}

interface Session {
  engine: GameEngine;
  save: SaveData;
  race: RaceState | null;
}

const GameContext = createContext<GameApi | null>(null);

function subscribe(): () => void {
  return () => undefined;
}

export function useGame(): GameApi {
  const value = useContext(GameContext);
  if (!value) throw new Error("Jeu indisponible");
  return value;
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [session, setSession] = useState<Session | null>(null);

  if (mounted && session === null) {
    const engine = new GameEngine(loadSave());
    setSession({ engine, save: engine.getSave(), race: engine.getRace() });
  }

  useEffect(() => {
    if (!mounted || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, [mounted]);

  if (!session) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm tracking-[0.28em] text-cyan-300">TRAIL SURVIVAL</p>
      </div>
    );
  }

  const { engine } = session;

  function commit() {
    const save = engine.getSave();
    writeSave(save);
    setSession({ engine, save, race: engine.getRace() });
  }

  const api: GameApi = {
    save: session.save,
    race: session.race,
    rename: (name) => {
      engine.renameRunner(name);
      commit();
    },
    equip: (slot, itemId) => {
      const ok = engine.equip(slot, itemId);
      commit();
      return ok;
    },
    spend: (branch) => {
      const ok = engine.spend(branch);
      commit();
      return ok;
    },
    reset: () => {
      engine.reset();
      commit();
    },
    start: (raceId, prep) => {
      const started = engine.startRace(raceId, prep);
      commit();
      return Boolean(started);
    },
    act: (action) => {
      engine.executeAction(action);
      const finished = engine.getRace() === null;
      commit();
      return finished;
    },
    chooseEvent: (choiceId) => {
      engine.chooseEvent(choiceId);
      const finished = engine.getRace() === null;
      commit();
      return finished;
    },
    aid: (choice) => {
      engine.useAid(choice);
      const finished = engine.getRace() === null;
      commit();
      return finished;
    },
    abandon: () => {
      engine.abandon();
      commit();
    },
    previewPace: (action) => engine.previewPace(action),
    previewResource: (action) => engine.previewResource(action),
    previewAid: (choice) => engine.previewAid(choice),
    eventView: () => engine.eventView(),
  };

  const hideNav = pathname === "/race";

  return (
    <GameContext.Provider value={api}>
      <div className={`mx-auto min-h-dvh w-full max-w-lg ${hideNav ? "" : "pb-24"}`}>{children}</div>
      {hideNav ? null : <BottomNav />}
    </GameContext.Provider>
  );
}
