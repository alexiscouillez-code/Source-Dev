"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { EQUIPMENT } from "@/game/data/equipment";
import { HYDRATION, NUTRITION } from "@/game/data/plans";
import { aidKilometers, raceById } from "@/game/data/races";
import {
  describeHydration,
  describeMods,
  describeNutrition,
  modsFromPrep,
} from "@/game/engine/EquipmentEngine";
import { DIFFICULTY_LABEL, formatMeters } from "@/game/format";
import { useGame } from "@/components/GameProvider";
import { ElevationProfile } from "@/components/ElevationProfile";
import type { EquipmentSlot, HydrationPlan, NutritionPlan, PrepChoices } from "@/game/models/types";

const SLOTS: { slot: EquipmentSlot; label: string }[] = [
  { slot: "shoes", label: "Chaussures" },
  { slot: "pack", label: "Sac" },
  { slot: "poles", label: "Bâtons" },
  { slot: "jacket", label: "Veste" },
  { slot: "lamp", label: "Lampe" },
];

export default function PrepPage() {
  const params = useParams<{ raceId: string }>();
  const router = useRouter();
  const { save, race, start } = useGame();
  const raceId = typeof params.raceId === "string" ? params.raceId : "";
  const definition = raceById(raceId);
  const [prep, setPrep] = useState<PrepChoices>(save.lastPrep ?? {
    shoesId: save.equipped.shoes,
    packId: save.equipped.pack,
    polesId: save.equipped.poles,
    jacketId: save.equipped.jacket,
    lampId: save.equipped.lamp,
    nutrition: "bars",
    hydration: "flasks",
  });
  const [error, setError] = useState<string | null>(null);

  if (!definition) {
    return (
      <main className="px-4 pt-8">
        <p>Course introuvable.</p>
        <Link href="/courses" className="mt-4 inline-block text-cyan-300">
          Retour aux courses
        </Link>
      </main>
    );
  }

  const mods = modsFromPrep(prep);
  const effects = mods ? describeMods(mods) : [];

  function selectSlot(slot: EquipmentSlot, itemId: string) {
    setPrep((current) => {
      if (slot === "shoes") return { ...current, shoesId: itemId };
      if (slot === "pack") return { ...current, packId: itemId };
      if (slot === "poles") return { ...current, polesId: itemId };
      if (slot === "jacket") return { ...current, jacketId: itemId };
      return { ...current, lampId: itemId };
    });
  }

  function selectedId(slot: EquipmentSlot): string {
    if (slot === "shoes") return prep.shoesId;
    if (slot === "pack") return prep.packId;
    if (slot === "poles") return prep.polesId;
    if (slot === "jacket") return prep.jacketId;
    return prep.lampId;
  }

  return (
    <main className="px-4 pt-8 pb-28">
      <p className="text-[11px] font-semibold tracking-[0.18em] text-cyan-300">COURSE FICTIVE</p>
      <h1 className="mt-2 text-3xl font-semibold">{definition.name}</h1>
      <p className="mt-2 text-sm text-zinc-300">
        {definition.distanceKm} km · +{formatMeters(definition.elevationGainM)} · départ{" "}
        {formatMeters(definition.startAltitudeM)}
      </p>
      <p className="mt-1 text-sm text-zinc-500">
        {DIFFICULTY_LABEL[definition.difficulty]} · {definition.weatherSummary} · {definition.terrainSummary}
      </p>
      <p className="mt-1 text-sm text-zinc-500">
        Ravitaillements : {aidKilometers(definition).map((km) => `km ${km}`).join(", ") || "aucun"}
      </p>
      <ElevationProfile race={definition} distance={0} />

      {race ? (
        <div className="mt-4 rounded-3xl border border-amber-400/40 bg-zinc-900 p-4">
          <p className="text-sm text-amber-200">Une course est déjà en cours.</p>
          <Link href="/race" className="mt-3 flex min-h-12 items-center justify-center rounded-2xl bg-cyan-400 font-semibold text-zinc-950">
            Continuer
          </Link>
        </div>
      ) : null}

      {SLOTS.map(({ slot, label }) => (
        <section key={slot} className="mt-5">
          <h2 className="text-sm font-semibold text-zinc-300">{label}</h2>
          <div className="mt-2 space-y-2">
            {EQUIPMENT.filter((item) => item.type === slot).map((item) => {
              const owned = save.ownedEquipmentIds.includes(item.id) && item.unlockLevel <= save.runner.level;
              const selected = selectedId(slot) === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!owned || Boolean(race)}
                  onClick={() => selectSlot(slot, item.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left ${
                    selected ? "border-cyan-400 bg-zinc-900" : "border-zinc-800 bg-zinc-950"
                  } disabled:opacity-50`}
                >
                  <span className="block font-semibold">{item.name}</span>
                  <span className="mt-1 block text-sm text-zinc-400">
                    {item.blurb} {owned ? "" : `Niveau ${item.unlockLevel} requis.`}
                  </span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    {item.weight} g · adhérence {item.grip} · confort {item.comfort} · protection {item.protection} ·
                    énergie {item.energyBonus > 0 ? `+${item.energyBonus}` : item.energyBonus}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <section className="mt-5">
        <h2 className="text-sm font-semibold text-zinc-300">Nutrition</h2>
        <div className="mt-2 space-y-2">
          {(Object.keys(NUTRITION) as NutritionPlan[]).map((id) => (
            <button
              key={id}
              type="button"
              disabled={Boolean(race)}
              onClick={() => setPrep((current) => ({ ...current, nutrition: id }))}
              className={`w-full rounded-2xl border px-4 py-3 text-left ${
                prep.nutrition === id ? "border-cyan-400 bg-zinc-900" : "border-zinc-800"
              }`}
            >
              <span className="font-semibold">{NUTRITION[id].label}</span>
              <span className="mt-1 block text-sm text-zinc-400">{NUTRITION[id].detail}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5">
        <h2 className="text-sm font-semibold text-zinc-300">Hydratation</h2>
        <div className="mt-2 space-y-2">
          {(Object.keys(HYDRATION) as HydrationPlan[]).map((id) => (
            <button
              key={id}
              type="button"
              disabled={Boolean(race)}
              onClick={() => setPrep((current) => ({ ...current, hydration: id }))}
              className={`w-full rounded-2xl border px-4 py-3 text-left ${
                prep.hydration === id ? "border-cyan-400 bg-zinc-900" : "border-zinc-800"
              }`}
            >
              <span className="font-semibold">{HYDRATION[id].label}</span>
              <span className="mt-1 block text-sm text-zinc-400">{HYDRATION[id].detail}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold">Effets du choix</h2>
        <p className="mt-2 text-sm text-zinc-400">{describeNutrition(prep)}</p>
        <p className="mt-1 text-sm text-zinc-400">{describeHydration(prep)}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2">
          {effects.map((effect) => (
            <div key={effect.label} className="rounded-2xl bg-zinc-950 px-3 py-2">
              <dt className="text-[11px] text-zinc-500">{effect.label}</dt>
              <dd className="text-sm font-semibold">{effect.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      <div className="fixed inset-x-0 bottom-16 z-20">
        <div className="mx-auto w-full max-w-lg border-t border-zinc-800 bg-[#07090c]/95 px-4 py-3">
          <button
            type="button"
            disabled={Boolean(race)}
            onClick={() => {
              const ok = start(definition.id, prep);
              if (!ok) {
                setError("Départ impossible avec ce matériel.");
                return;
              }
              router.push("/race");
            }}
            className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-cyan-400 text-base font-semibold text-zinc-950 disabled:opacity-40"
          >
            Départ
          </button>
        </div>
      </div>
    </main>
  );
}
