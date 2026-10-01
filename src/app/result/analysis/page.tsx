"use client";

import Link from "next/link";
import { CoachPanel } from "@/components/CoachPanel";
import { StatBar } from "@/components/StatBar";
import { useGame } from "@/components/GameProvider";
import { analyzeRun } from "@/game/analysis/analyze";

export default function AnalysisPage() {
  const { save } = useGame();
  const result = save.history.find((entry) => entry.id === save.lastResultId) ?? save.history.at(-1);
  if (!result) {
    return (
      <main className="px-4 pt-16">
        <p>Aucune analyse.</p>
        <Link href="/" className="mt-4 inline-block text-cyan-300">
          Accueil
        </Link>
      </main>
    );
  }
  const analysis = analyzeRun(result);

  return (
    <main className="px-4 pt-8">
      <p className="text-[11px] tracking-[0.16em] text-zinc-500">ANALYSE · COURSE #{result.number}</p>
      <h1 className="mt-2 text-3xl font-semibold">{result.raceName}</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-300">{analysis.summary}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatBar label="Énergie" value={result.energy} />
        <StatBar label="Hydratation" value={result.hydration} />
        <StatBar label="Fatigue" value={result.fatigue} invert />
        <StatBar label="Mental" value={result.mental} />
      </div>
      <ul className="mt-5 space-y-3 text-sm leading-6 text-zinc-300">
        <li>{analysis.bestSegment}</li>
        <li>{analysis.criticalSegment}</li>
        <li>{analysis.bestDecision}</li>
        <li>{analysis.worstDecision}</li>
      </ul>
      <CoachPanel result={result} />
      <Link href="/result" className="mt-6 mb-4 flex min-h-12 items-center justify-center text-sm text-cyan-300">
        Retour au résultat
      </Link>
    </main>
  );
}
