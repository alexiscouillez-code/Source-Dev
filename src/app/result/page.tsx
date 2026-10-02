"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatBar } from "@/components/StatBar";
import { useGame } from "@/components/GameProvider";
import { RACES } from "@/game/data/races";
import { formatDuration, formatKm, formatMeters } from "@/game/format";

export default function ResultPage() {
  const router = useRouter();
  const { save, start } = useGame();
  const result = save.history.find((entry) => entry.id === save.lastResultId) ?? save.history.at(-1);

  if (!result) {
    return (
      <main className="px-4 pt-16">
        <p>Aucun résultat.</p>
        <Link href="/courses" className="mt-4 inline-block text-cyan-300">
          Choisir une course
        </Link>
      </main>
    );
  }

  const index = RACES.findIndex((race) => race.id === result.raceId);
  const next = index >= 0 ? RACES[index + 1] : undefined;
  const title = result.status === "FINISH" ? "Arrivée" : result.status === "ABANDON" ? "Abandon" : "DNF";

  return (
    <main className="px-4 pt-8">
      <p className="text-[11px] font-semibold tracking-[0.18em] text-cyan-300">COURSE #{result.number}</p>
      <h1 className="mt-2 text-4xl font-semibold">{title}</h1>
      <p className="mt-2 text-zinc-300">{result.raceName}</p>
      {result.dnfReason ? <p className="mt-2 text-sm text-red-300">Cause : {result.dnfReason}</p> : null}
      <p className="mt-4 text-sm text-zinc-400">
        {formatKm(result.distanceKm)} / {formatKm(result.totalDistanceKm)} km · {formatDuration(result.elapsedMinutes)} ·
        D+ {formatMeters(result.elevationGain)}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatBar label="Énergie" value={result.energy} />
        <StatBar label="Hydratation" value={result.hydration} />
        <StatBar label="Fatigue" value={result.fatigue} invert />
        <StatBar label="Mental" value={result.mental} />
      </div>
      <p className="mt-4 text-sm text-zinc-300">
        +{result.xpGained} XP
        {result.levelAfter > result.levelBefore ? ` · niveau ${result.levelAfter}` : ""}
      </p>
      <div className="mt-6 space-y-3">
        <Link href="/result/analysis" className="flex min-h-14 items-center justify-center rounded-2xl bg-cyan-400 font-semibold text-zinc-950">
          Voir mon analyse
        </Link>
        <button
          type="button"
          onClick={() => {
            if (start(result.raceId, result.prep)) router.push("/race");
          }}
          className="flex min-h-14 w-full items-center justify-center rounded-2xl border border-zinc-700 font-semibold"
        >
          {result.status === "FINISH" ? "Rejouer" : "Recommencer"}
        </button>
        {result.status === "FINISH" ? (
          next ? (
            <Link href={`/courses/${next.id}`} className="flex min-h-14 items-center justify-center rounded-2xl border border-zinc-700 font-semibold">
              Course suivante
            </Link>
          ) : (
            <Link href="/courses" className="flex min-h-14 items-center justify-center rounded-2xl border border-zinc-700 font-semibold">
              Toutes les courses
            </Link>
          )
        ) : null}
      </div>
    </main>
  );
}
