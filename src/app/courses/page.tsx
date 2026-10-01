"use client";

import Link from "next/link";
import { aidKilometers, RACES } from "@/game/data/races";
import { terrainLabel } from "@/game/engine/TerrainEngine";
import { DIFFICULTY_LABEL, formatMeters } from "@/game/format";
import { ElevationProfile } from "@/components/ElevationProfile";

export default function CoursesPage() {
  return (
    <main className="px-4 pt-8">
      <h1 className="text-3xl font-semibold tracking-tight">Courses</h1>
      <p className="mt-2 text-sm text-zinc-400">Cinq courses fictives. Aucune n’est une épreuve officielle.</p>
      <div className="mt-5 space-y-3">
        {RACES.map((race) => {
          const terrain = race.segments[0] ? terrainLabel(race.segments[0].terrainType) : race.terrainSummary;
          return (
            <Link
              key={race.id}
              href={`/courses/${race.id}`}
              className="block rounded-3xl border border-zinc-800 bg-zinc-900 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-cyan-300">FICTIVE</p>
                  <h2 className="mt-1 text-xl font-semibold">{race.name}</h2>
                </div>
                <p className="text-sm text-zinc-400">{DIFFICULTY_LABEL[race.difficulty]}</p>
              </div>
              <p className="mt-2 text-sm text-zinc-300">
                {race.distanceKm} km · +{formatMeters(race.elevationGainM)} · {formatMeters(race.startAltitudeM)}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                {race.terrainSummary} · {race.weatherSummary}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Départ {terrain.toLowerCase()} · {aidKilometers(race).length} ravitaillements
              </p>
              <div className="mt-2">
                <ElevationProfile race={race} distance={0} />
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
