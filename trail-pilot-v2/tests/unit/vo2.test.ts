/** VO2max : pas de biais lié au nombre de sorties, FC max contrôlée. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthValue, estimateVo2 } from "../../lib/engine/vo2";

// Générateur pseudo-aléatoire déterministe : le test donne toujours le même résultat.
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

test("la valeur mensuelle ne monte pas avec le nombre de sorties", () => {
  const r = rng(42), mean = (n: number) => {
    let s = 0; for (let k = 0; k < 2000; k++) s += monthValue(Array.from({ length: n }, () => 50 + 3 * gauss(r)), false);
    return s / 2000;
  };
  const few = mean(4), many = mean(24);
  assert.ok(Math.abs(many - few) < 1, `4 sorties : ${few.toFixed(1)}, 24 sorties : ${many.toFixed(1)}`);
  assert.ok(many < 53, "pas de surestimation nette pour une vraie valeur de 50");
});

const runs = (maxHr: number, n = 14) => Array.from({ length: n }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, sport: "course" as const, durationMin: 50, distanceKm: 9.5, gainM: 60, avgHr: 150, maxHr }));

test("FC max du profil dépassée sur plusieurs sorties : la valeur observée est retenue et signalée", () => {
  const e = estimateVo2([...runs(175, 11), ...runs(192, 3)], "2026-11-14", { hrMax: 185, hrRest: 50 });
  assert.equal(e.hrMax, 192);
  assert.ok(e.notes.some((n) => n.includes("192")));
});

test("un pic de FC isolé (parasite du capteur) ne remplace pas la FC max du profil", () => {
  const e = estimateVo2([...runs(175, 13), ...runs(215, 1)], "2026-11-14", { hrMax: 185, hrRest: 50 });
  assert.equal(e.hrMax, 185);
});

test("FC max jamais approchée : alerte", () => {
  const e = estimateVo2(runs(168), "2026-11-14", { hrMax: 190, hrRest: 50 });
  assert.ok(e.notes.some((n) => n.includes("jamais")));
});

test("la VO2max de la montre sert aux allures, l’estimation reste affichée pour comparer", () => {
  const e = estimateVo2(runs(175), "2026-11-14", { hrMax: 190, hrRest: 50, watch: 51 });
  assert.equal(e.paceVdot, 51);
  assert.notEqual(e.value, null);
});
