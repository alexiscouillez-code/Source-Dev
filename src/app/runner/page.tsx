"use client";

import { useState } from "react";
import { useGame } from "@/components/GameProvider";
import { MAX_SKILL_RANK } from "@/game/engine/balance";
import { SKILL_BRANCHES, SKILL_INFO, effectiveStats } from "@/game/engine/ProgressionEngine";

export default function RunnerPage() {
  const { save, rename, spend, reset, race } = useGame();
  const [name, setName] = useState(save.runner.name);
  const [confirmReset, setConfirmReset] = useState(false);
  const stats = effectiveStats(save.runner);

  return (
    <main className="px-4 pt-8">
      <h1 className="text-3xl font-semibold">Coureur</h1>
      <p className="mt-2 text-sm text-zinc-400">Progression enregistrée sur cet appareil.</p>
      <form
        className="mt-5"
        onSubmit={(event) => {
          event.preventDefault();
          rename(name);
        }}
      >
        <label htmlFor="runner-name" className="text-sm text-zinc-400">
          Nom
        </label>
        <input
          id="runner-name"
          value={name}
          maxLength={24}
          onChange={(event) => setName(event.target.value)}
          className="mt-2 min-h-12 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4"
        />
        <button type="submit" className="mt-3 flex min-h-12 w-full items-center justify-center rounded-2xl bg-cyan-400 font-semibold text-zinc-950">
          Enregistrer le nom
        </button>
      </form>

      <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm text-zinc-400">
          Niveau {save.runner.level} · XP {save.runner.xp}/100 · {save.runner.skillPoints} point
          {save.runner.skillPoints > 1 ? "s" : ""}
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full bg-cyan-400" style={{ width: `${save.runner.xp}%` }} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <Line label="Endurance" value={stats.endurance} />
          <Line label="Montagne" value={stats.montagne} />
          <Line label="Descente" value={stats.descente} />
          <Line label="Résistance" value={stats.resistance} />
          <Line label="Mental" value={stats.mental} />
        </dl>
      </section>

      <section className="mt-5">
        <h2 className="text-lg font-semibold">Arbre</h2>
        <div className="mt-3 space-y-2">
          {SKILL_BRANCHES.map((branch) => {
            const rank = save.runner.ranks[branch];
            const locked = Boolean(race) || save.runner.skillPoints <= 0 || rank >= MAX_SKILL_RANK;
            return (
              <button
                key={branch}
                type="button"
                disabled={locked}
                onClick={() => spend(branch)}
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-left disabled:opacity-50"
              >
                <span className="font-semibold">
                  {SKILL_INFO[branch].label} · {rank}/{MAX_SKILL_RANK}
                </span>
                <span className="mt-1 block text-sm text-zinc-400">{SKILL_INFO[branch].bonus}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-8">
        {confirmReset ? (
          <button type="button" onClick={() => reset()} className="text-sm text-red-400">
            Confirmer l’effacement
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmReset(true)} className="text-sm text-zinc-500">
            Nouveau coureur
          </button>
        )}
      </div>
    </main>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between rounded-2xl bg-zinc-950 px-3 py-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
