/** Charge et effort : l’effort d’une sortie doit correspondre aux zones affichées et à l’allure du coureur. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { effort, sessionLoad } from "../../lib/engine/load";
import { timeline } from "../../lib/engine/timeline";
import { addDays } from "../../lib/engine/dates";

const run = (o: Partial<Parameters<typeof effort>[0]>) => ({ date: "2026-11-01", sport: "course" as const, durationMin: 60, ...o });

test("le ressenti saisi prime sur tout le reste", () => {
  assert.deepEqual(effort(run({ rpe: 8, avgHr: 130 }), { hrMax: 190, hrRest: 50 }), { rpe: 8, source: "ressenti" });
});

test("cardio : une sortie en zone 2 est facile, pas modérée", () => {
  // 61 % de la réserve cardiaque (zone 2)
  assert.equal(effort(run({ avgHr: 135 }), { hrMax: 190, hrRest: 50 }).rpe, 4);
  // 74 % (zone 3)
  assert.equal(effort(run({ avgHr: 154 }), { hrMax: 190, hrRest: 50 }).rpe, 5);
});

test("sans cardio ni ressenti : l’effort se déduit de l’allure rapportée à la VO2max", () => {
  const p = { vdot: 50 };
  assert.deepEqual(effort(run({ distanceKm: 10, durationMin: 60, gainM: 50 }), p), { rpe: 4, source: "allure" });
  assert.ok(effort(run({ distanceKm: 10, durationMin: 42 }), p).rpe >= 7, "10 km en 42 min pour une VO2max de 50 : effort soutenu");
  assert.equal(effort(run({ sport: "trail", distanceKm: 15, durationMin: 130, gainM: 900 }), p).rpe, 4, "le dénivelé est compté dans l’allure");
});

test("sans aucune donnée : valeur type du sport", () => {
  assert.equal(effort(run({}), {}).source, "estimé");
});

test("la charge grandit avec la durée, l’effort et le dénivelé", () => {
  const base = sessionLoad(run({ rpe: 4 })).total;
  assert.ok(sessionLoad(run({ rpe: 4, durationMin: 120 })).total > base * 1.8);
  assert.ok(sessionLoad(run({ rpe: 7 })).total > base);
  assert.ok(sessionLoad(run({ rpe: 4, sport: "trail", gainM: 800 })).total > base);
});

test("forme et fatigue : la fatigue réagit vite, la forme lentement", () => {
  const today = "2026-11-15";
  const steady = Array.from({ length: 60 }, (_, i) => run({ date: addDays(today, -1 - i), rpe: 4 }));
  const block = [...steady, ...Array.from({ length: 7 }, (_, i) => run({ date: addDays(today, -i), rpe: 7, durationMin: 90 }))];
  const a = timeline(steady, {}, today), b = timeline(block, {}, today);
  const last = (t: typeof a) => t.points[t.points.length - 1];
  assert.ok(last(b).atl - last(a).atl > last(b).ctl - last(a).ctl, "une semaine chargée monte plus la fatigue que la forme");
  assert.ok(last(b).form < last(a).form, "et fait baisser la fraîcheur");
});
