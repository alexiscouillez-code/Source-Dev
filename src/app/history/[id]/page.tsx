"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { StatBar } from "@/components/StatBar";
import { useGame } from "@/components/GameProvider";
import { analyzeRun } from "@/game/analysis/analyze";
import { formatDuration, formatKm, formatMeters } from "@/game/format";

export default function HistoryDetailPage() {
  const params = useParams<{ id: string }>();
  const { save } = useGame();
  const id = typeof params.id === "string" ? params.id : "";
  const result = save.history.find((entry) => entry.id === id);

  if (!result) {
    return (
      <main className="px-4 pt-16">
        <p>Course introuvable.</p>
        <Link href="/history" className="mt-4 inline-block text-cyan-300">
          Historique
        </Link>
      </main>
    );
  }

  const analysis = analyzeRun(result);

  return (
    <main className="px-4 pt-8">
      <p className="text-[11px] tracking-[0.16em] text-cyan-300">COURSE #{result.number}</p>
      <h1 className="mt-2 text-3xl font-semibold">{result.raceName}</h1>
      <p className="mt-2 text-sm text-zinc-400">
        {result.status} · {formatKm(result.distanceKm)} km · {formatDuration(result.elapsedMinutes)} · D+{" "}
        {formatMeters(result.elevationGain)}
      </p>
      {result.dnfReason ? <p className="mt-2 text-sm text-red-300">{result.dnfReason}</p> : null}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatBar label="Énergie" value={result.energy} />
        <StatBar label="Hydratation" value={result.hydration} />
        <StatBar label="Fatigue" value={result.fatigue} invert />
        <StatBar label="Mental" value={result.mental} />
      </div>
      <ul className="mt-5 space-y-3 text-sm leading-6 text-zinc-300">
        <li>{analysis.summary}</li>
        <li>{analysis.bestSegment}</li>
        <li>{analysis.criticalSegment}</li>
        <li>{analysis.bestDecision}</li>
        <li>{analysis.worstDecision}</li>
      </ul>
    </main>
  );
}
