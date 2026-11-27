import { test } from "node:test";
import assert from "node:assert/strict";
import { effortOf, recoveryDays, seasonWarnings, spacingDays, withRecovery } from "../../lib/engine/season";
import type { PlanItem } from "../../lib/engine/planner";
import { addDays } from "../../lib/engine/dates";

const item = (date: string, template: PlanItem["template"], durationMin: number): PlanItem => ({ date, template, title: template, sport: "trail", durationMin, gainM: 300, rpeTarget: template === "tempo" ? 7 : 4, description: "", phase: "Développement" });

test("effort, récupération et écart conseillé grandissent avec la course", () => {
  assert.equal(effortOf(25, 1000), 35);
  assert.ok(recoveryDays(20) < recoveryDays(60) && recoveryDays(60) < recoveryDays(100) && recoveryDays(100) < recoveryDays(170));
  assert.equal(spacingDays(30), 21, "trail court : 3 semaines");
  assert.equal(spacingDays(60), 35, "40-50 km : 5 semaines");
  assert.equal(spacingDays(100), 56, "ultra : 8 semaines");
});

test("alerte quand deux courses principales sont trop proches, sauf enchaînement accepté", () => {
  const ultra = { key: "main", name: "Ultra", date: "2027-05-01", distanceKm: 80, gainM: 4000 };
  const w = seasonWarnings([ultra, { key: "next:2", name: "Trail d’été", date: "2027-06-05", distanceKm: 30, gainM: 1500 }]);
  assert.equal(w.length, 1);
  assert.equal(w[0].key, "next:2");
  assert.equal(w[0].gapDays, 35);
  assert.equal(w[0].needDays, 56, "après 120 km-effort : 8 semaines");
  assert.match(w[0].text, /5 semaines après Ultra/);
  assert.equal(seasonWarnings([ultra, { key: "next:2", name: "Trail d’été", date: "2027-06-05", distanceKm: 30, gainM: 1500, chained: true }]).length, 0);
  assert.equal(seasonWarnings([ultra, { key: "next:3", name: "Automne", date: "2027-09-15", distanceKm: 50, gainM: 2500 }]).length, 0);
});

test("récupération après une course principale : repos, puis footings faciles, aucune séance dure", () => {
  const race = "2027-05-01";
  const items = [...[1, 2, 3, 4, 6, 8, 10, 12, 15, 18, 20].map((d, i) => item(addDays(race, d), i % 3 === 0 ? "tempo" : i % 3 === 1 ? "long" : "easy", i % 3 === 1 ? 120 : 50)), item(addDays(race, 25), "tempo", 55)];
  const { items: out, note } = withRecovery(items, { name: "Ultra", date: race, distanceKm: 80, gainM: 4000 }, addDays(race, 1));
  assert.ok(note && /Récupération après Ultra/.test(note));
  assert.ok(!out.some((p) => p.date <= addDays(race, 3)), "trois jours de repos après un ultra");
  const inside = out.filter((p) => p.date <= addDays(race, 21));
  assert.ok(inside.every((p) => p.template === "easy" && p.rpeTarget <= 3 && p.durationMin <= 60), "seulement de l’endurance facile pendant 3 semaines");
  assert.ok(inside.filter((p) => p.date <= addDays(race, 8)).every((p) => p.durationMin <= 30), "très court au début");
  assert.equal(out.find((p) => p.date === addDays(race, 25))?.template, "tempo", "la suite du plan reprend après");
  // Récupération finie : rien ne change.
  assert.equal(withRecovery(items, { name: "Ultra", date: race, distanceKm: 80, gainM: 4000 }, addDays(race, 40)).note, null);
});
