"use client";

import Link from "next/link";
import { raceById } from "@/game/data/races";
import { effectiveStats } from "@/game/engine/ProgressionEngine";
import { formatMeters } from "@/game/format";
import { useGame } from "@/components/GameProvider";

export default function HomePage() {
  const { save, race } = useGame();
  const alpine = raceById("alpine-50");
  const stats = effectiveStats(save.runner);
  if (!alpine) return null;

  return (
    <main className="px-4 pt-8">
      <p className="text-xs font-semibold tracking-[0.28em] text-cyan-300">COURSE FICTIVE</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">TRAIL SURVIVAL</h1>
      <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-400">
        Énergie, eau, fatigue, mental. Chaque décision compte.
      </p>

      {race ? (
        <Link
          href="/race"
          className="mt-6 flex min-h-14 items-center justify-center rounded-2xl bg-cyan-400 text-base font-semibold text-zinc-950"
        >
          Continuer
        </Link>
      ) : null}

      <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Prochaine course</p>
        <h2 className="mt-2 text-2xl font-semibold">{alpine.name}</h2>
        <p className="mt-1 text-zinc-300">
          {alpine.distanceKm} km · +{formatMeters(alpine.elevationGainM)}
        </p>
        <p className="mt-1 text-sm text-zinc-500">{alpine.terrainSummary}</p>
        <Link
          href="/courses/alpine-50"
          className="mt-4 flex min-h-14 items-center justify-center rounded-2xl bg-cyan-400 text-base font-semibold text-zinc-950"
        >
          Courir
        </Link>
      </section>

      <section className="mt-4 rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">{save.runner.name}</h2>
          <p className="text-sm text-zinc-400">Niveau {save.runner.level}</p>
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          XP {save.runner.xp}/100
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full bg-cyan-400" style={{ width: `${save.runner.xp}%` }} />
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="Endurance" value={stats.endurance} />
          <Stat label="Montagne" value={stats.montagne} />
          <Stat label="Mental" value={stats.mental} />
        </dl>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-zinc-950 px-2 py-3">
      <dt className="text-[11px] text-zinc-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}
