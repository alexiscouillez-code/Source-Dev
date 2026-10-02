"use client";

import Link from "next/link";
import { useGame } from "@/components/GameProvider";
import { formatDuration, formatKm } from "@/game/format";

export default function HistoryPage() {
  const { save } = useGame();
  const history = [...save.history].reverse();

  return (
    <main className="px-4 pt-8">
      <h1 className="text-3xl font-semibold">Historique</h1>
      {history.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">Aucune course pour l’instant.</p>
      ) : (
        <div className="mt-5 space-y-3">
          {history.map((result) => (
            <Link key={result.id} href={`/history/${result.id}`} className="block rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-[11px] tracking-[0.16em] text-cyan-300">COURSE #{result.number}</p>
              <h2 className="mt-1 text-xl font-semibold">{result.raceName}</h2>
              <p className="mt-1 text-sm text-zinc-400">
                {result.status} · {formatKm(result.distanceKm)} km · {formatDuration(result.elapsedMinutes)} · +{result.xpGained} XP
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
