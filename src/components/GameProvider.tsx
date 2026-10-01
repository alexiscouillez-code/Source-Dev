"use client";

import { createContext, useContext, useEffect, useState } from "react";
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

export function useGame(): GameApi {
  const value = useContext(GameContext);
  if (!value) throw new Error("Jeu indisponible");
  return value;
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const engine = new GameEngine(loadSave());
      // The save lives in localStorage, so it can only be read after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only persistence
      setSession({ engine, save: engine.getSave(), race: engine.getRace() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sauvegarde illisible";
      console.error(message);
      setBootError(message);
    }
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  if (!session) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm tracking-[0.28em] text-cyan-300">TRAIL SURVIVAL</p>
        {bootError ? <p className="mt-3 text-sm text-red-400">{bootError}</p> : null}
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
