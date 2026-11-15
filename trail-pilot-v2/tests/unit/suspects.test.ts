/** Séances suspectes : chaque piège doit être repéré, une séance confirmée ne doit plus l’être. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { findSuspects, robustMax } from "../../lib/engine/suspects";

const base = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `Footing ${i}`, date: `2026-10-${String(1 + i).padStart(2, "0")}`, sport: "course" as const, durationMin: 50 + (i % 4) * 10, distanceKm: 9 + (i % 4), gainM: 100, avgHr: 140 }));
const physio = { hrMax: 190, hrRest: 50 };
const kinds = (xs: ReturnType<typeof findSuspects>) => Object.fromEntries(xs.map((x) => [x.id, x.kind]));

test("doublon, chrono oublié et vitesse impossible sont repérés", () => {
  const k = kinds(findSuspects([...base,
    { id: 100, name: "copie", date: "2026-10-04", sport: "course", durationMin: 80, distanceKm: 12, gainM: 100, avgHr: 140 },
    { id: 101, name: "montre oubliée", date: "2026-10-22", sport: "trail", durationMin: 26 * 60, distanceKm: 14, gainM: 600, avgHr: 120 },
    { id: 102, name: "voiture", date: "2026-10-23", sport: "course", durationMin: 40, distanceKm: 38 },
  ], physio));
  assert.equal(k[100], "doublon");
  assert.equal(k[101], "chrono");
  assert.equal(k[102], "vitesse");
  assert.equal(Object.keys(k).length, 3, "aucune sortie normale signalée");
});

test("une course exceptionnelle confirmée n’est plus signalée", () => {
  const xs = findSuspects([...base, { id: 103, name: "UTMB", date: "2026-10-24", sport: "trail", durationMin: 40 * 60, distanceKm: 171, gainM: 10000, avgHr: 135, checkState: 2 }], physio);
  assert.equal(xs.length, 0);
});

test("échelle des graphiques : un pic isolé n’écrase pas le reste", () => {
  const vals = [...Array.from({ length: 100 }, (_, i) => 40 + (i % 10)), 561];
  assert.ok(robustMax(vals) < 150);
  assert.equal(robustMax([10, 20, 30, 40]), 40, "sans pic, l’échelle va jusqu’au maximum");
});
