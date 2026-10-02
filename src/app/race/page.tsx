"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ElevationProfile } from "@/components/ElevationProfile";
import { useGame } from "@/components/GameProvider";
import { StatBar } from "@/components/StatBar";
import { raceById } from "@/game/data/races";
import { terrainLabel } from "@/game/engine/TerrainEngine";
import { weatherLabel } from "@/game/engine/WeatherEngine";
import { formatDuration, formatKm, formatMeters, formatPace, signed } from "@/game/format";
import type { PaceAction } from "@/game/models/types";

const PACE: { id: PaceAction; label: string }[] = [
  { id: "ATTACK", label: "Attaquer" },
  { id: "NORMAL", label: "Normal" },
  { id: "SAVE", label: "Économiser" },
];

export default function RacePage() {
  const router = useRouter();
  const game = useGame();
  const { race, act, chooseEvent, aid, abandon, previewPace, previewResource, previewAid, eventView } = game;
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  if (!race) {
    return (
      <main className="px-4 pt-16">
        <h1 className="text-2xl font-semibold">Aucune course en cours</h1>
        <Link href="/courses" className="mt-6 flex min-h-14 items-center justify-center rounded-2xl bg-cyan-400 font-semibold text-zinc-950">
          Choisir une course
        </Link>
      </main>
    );
  }

  const definition = raceById(race.raceId);
  const segment = definition?.segments[race.currentSegment];
  if (!definition || !segment) {
    return (
      <main className="px-4 pt-16">
        <p>Course illisible.</p>
      </main>
    );
  }

  const event = eventView();

  return (
    <main className="px-4 pt-5 pb-44">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-semibold">{definition.name}</h1>
        <p className="text-sm text-zinc-300">{formatDuration(race.elapsedTime)}</p>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight">
        {formatKm(race.distance)}
        <span className="text-lg text-zinc-500"> / {formatKm(race.totalDistance)} km</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full bg-cyan-400"
          style={{ width: `${Math.min(100, (race.distance / race.totalDistance) * 100)}%` }}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-400">
        <span>D+ {formatMeters(race.elevationGain)}</span>
        <span>reste {formatMeters(race.remainingElevation)}</span>
        <span>{race.pace > 0 ? formatPace(race.pace) : "—"}</span>
      </div>
      <ElevationProfile race={definition} distance={race.distance} />

      <div className="mt-2 grid grid-cols-2 gap-3">
        <StatBar label="Énergie" value={race.energy} />
        <StatBar label="Hydratation" value={race.hydration} />
        <StatBar label="Fatigue" value={race.fatigue} invert />
        <StatBar label="Mental" value={race.mental} />
      </div>

      <section className="mt-4 rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-[11px] tracking-[0.16em] text-zinc-500">
          SEGMENT {race.currentSegment + 1}/{definition.segments.length}
        </p>
        <h2 className="mt-1 text-xl font-semibold">{segment.name}</h2>
        <p className="mt-1 text-sm text-zinc-400">
          {formatKm(segment.endKm - segment.startKm)} km · D+ {segment.elevationGain} m ·{" "}
          {terrainLabel(segment.terrainType)} · {weatherLabel(segment.weather)}
          {segment.night ? " · nuit" : ""}
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Eau {race.drinksLeft} · repas {race.eatsLeft}
        </p>
      </section>

      {race.flash && race.lastDelta ? (
        <p className="mt-3 text-sm leading-6 text-cyan-200">
          {race.flash} Énergie {signed(race.lastDelta.energy)} · hydratation {signed(race.lastDelta.hydration)} ·
          fatigue {signed(race.lastDelta.fatigue)} · mental {signed(race.lastDelta.mental)} ·{" "}
          {signed(race.lastDelta.minutes)} min
        </p>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">{race.flash}</p>
      )}

      {event ? (
        <section className="mt-4 rounded-3xl border border-cyan-400/40 bg-zinc-900 p-4">
          <p className="text-[11px] tracking-[0.16em] text-cyan-300">ÉVÉNEMENT</p>
          <h2 className="mt-1 text-2xl font-semibold">{event.title}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-300">{event.text}</p>
          <div className="mt-4 space-y-2">
            {event.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => {
                  if (chooseEvent(choice.id)) router.push("/result");
                }}
                className="flex min-h-16 w-full flex-col items-start justify-center rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-left"
              >
                <span className="font-semibold">{choice.label}</span>
                <span className="mt-1 text-xs leading-5 text-zinc-400">{choice.detail}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {race.phase === "aid" ? (
        <section className="mt-4 rounded-3xl border border-zinc-700 bg-zinc-900 p-4">
          <p className="text-[11px] tracking-[0.16em] text-cyan-300">RAVITAILLEMENT</p>
          <h2 className="mt-1 text-2xl font-semibold">Km {formatKm(race.distance)}</h2>
          <p className="mt-2 text-sm text-zinc-400">Boire, manger ou récupérer coûte du temps. Repartir referme le point.</p>
          <div className="mt-4 space-y-2">
            <AidButton
              label="Boire"
              used={race.aidUsed.drink}
              detail={previewAid("drink")}
              onClick={() => {
                if (aid("drink")) router.push("/result");
              }}
            />
            <AidButton
              label="Manger"
              used={race.aidUsed.eat}
              detail={previewAid("eat")}
              onClick={() => {
                if (aid("eat")) router.push("/result");
              }}
            />
            <AidButton
              label="Récupérer"
              used={race.aidUsed.recover}
              detail={previewAid("recover")}
              onClick={() => {
                if (aid("recover")) router.push("/result");
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (aid("leave")) router.push("/result");
              }}
              className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-cyan-400 font-semibold text-zinc-950"
            >
              Repartir
            </button>
          </div>
        </section>
      ) : null}

      {race.phase === "running" ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-[#07090c]/95 pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto max-w-lg space-y-2 px-3 py-3">
            <div className="grid grid-cols-3 gap-2">
              {PACE.map((action) => {
                const preview = previewPace(action.id);
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => {
                      if (act(action.id)) router.push("/result");
                    }}
                    className="min-h-16 rounded-2xl bg-cyan-400 px-2 py-2 text-zinc-950"
                  >
                    <span className="block text-sm font-semibold">{action.label}</span>
                    {preview ? (
                      <span className="mt-1 block text-[10px] leading-4">
                        {signed(preview.energy)} én · {signed(preview.fatigue)} fat
                        {preview.riskPercent >= 10 ? ` · risque ${preview.riskPercent} %` : ""}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["DRINK", "EAT"] as const).map((action) => {
                const preview = previewResource(action);
                return (
                  <button
                    key={action}
                    type="button"
                    onClick={() => {
                      if (act(action)) router.push("/result");
                    }}
                    className="min-h-14 rounded-2xl border border-zinc-700 bg-zinc-900 px-3 text-left"
                  >
                    <span className="block text-sm font-semibold">{action === "DRINK" ? "Boire" : "Manger"}</span>
                    <span className="block text-[11px] text-zinc-400">{preview?.detail}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        {confirmAbandon ? (
          <button
            type="button"
            onClick={() => {
              abandon();
              router.push("/result");
            }}
            className="text-sm text-red-400"
          >
            Confirmer l’abandon
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmAbandon(true)} className="text-sm text-zinc-500">
            Abandonner
          </button>
        )}
      </div>
    </main>
  );
}

function AidButton({
  label,
  detail,
  used,
  onClick,
}: {
  label: string;
  detail: { minutes: number; energy: number; hydration: number; fatigue: number; mental: number } | null;
  used: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={used || !detail}
      onClick={onClick}
      className="flex min-h-14 w-full flex-col items-start justify-center rounded-2xl border border-zinc-700 px-4 py-2 text-left disabled:opacity-40"
    >
      <span className="font-semibold">{used ? `${label} · fait` : label}</span>
      {detail ? (
        <span className="text-xs text-zinc-400">
          {signed(detail.minutes)} min · én {signed(detail.energy)} · hyd {signed(detail.hydration)} · fat{" "}
          {signed(detail.fatigue)}
        </span>
      ) : null}
    </button>
  );
}
