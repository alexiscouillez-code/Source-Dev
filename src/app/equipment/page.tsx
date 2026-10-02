"use client";

import { EQUIPMENT } from "@/game/data/equipment";
import { useGame } from "@/components/GameProvider";
import type { EquipmentSlot } from "@/game/models/types";

const SLOTS: { slot: EquipmentSlot; label: string }[] = [
  { slot: "shoes", label: "Chaussures" },
  { slot: "pack", label: "Sac" },
  { slot: "poles", label: "Bâtons" },
  { slot: "jacket", label: "Veste" },
  { slot: "lamp", label: "Lampe" },
];

export default function EquipmentPage() {
  const { save, equip, race } = useGame();

  return (
    <main className="px-4 pt-8">
      <h1 className="text-3xl font-semibold">Équipement</h1>
      <p className="mt-2 text-sm text-zinc-400">
        {race ? "Le matériel est figé pendant la course." : "Équipe un objet pour la prochaine préparation."}
      </p>
      {SLOTS.map(({ slot, label }) => (
        <section key={slot} className="mt-5">
          <h2 className="text-sm font-semibold text-zinc-300">{label}</h2>
          <div className="mt-2 space-y-2">
            {EQUIPMENT.filter((item) => item.type === slot).map((item) => {
              const owned = save.ownedEquipmentIds.includes(item.id);
              const equipped = save.equipped[slot] === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!owned || Boolean(race)}
                  onClick={() => equip(slot, item.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left disabled:opacity-50 ${
                    equipped ? "border-cyan-400 bg-zinc-900" : "border-zinc-800"
                  }`}
                >
                  <span className="font-semibold">
                    {item.name}
                    {equipped ? " · équipé" : ""}
                  </span>
                  <span className="mt-1 block text-sm text-zinc-400">
                    {owned ? item.blurb : `Niveau ${item.unlockLevel} requis.`}
                  </span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    {item.weight} g · adhérence {item.grip} · confort {item.comfort} · énergie {item.energyBonus} · terrain{" "}
                    {item.terrainBonus}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
