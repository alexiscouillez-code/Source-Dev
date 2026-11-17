import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanAnchor, courseCorrection, courseFactor, fromReference, parseDuration, trailTime, winnerModel, wear } from "../../lib/engine/race-anchor";
import { raceDemands } from "../../lib/engine/planner";

const near = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} au lieu de ${b} ± ${tol}`);

test("usure des longues durées : rien sous 4 h, +4 %/h jusqu'à 12 h, puis +1,2 %/h", () => {
  assert.equal(wear(3), 1);
  near(wear(8), 1.16, 1e-9);
  near(wear(20), 1.32 + 0.096, 1e-9);
});

test("un résultat transposé sur la même course redonne le même temps", () => {
  near(fromReference({ km: 42, gain: 2500, min: 400 }, 42, 2500), 400, 0.5);
  near(fromReference({ km: 170, gain: 10000, min: 30 * 60 }, 170, 10000), 1800, 1);
});

test("transposition plus longue : plus lent au km-effort (Riegel 1,06 et usure)", () => {
  const ref = { km: 30, gain: 1500, min: 240 }; // 45 km-effort en 4 h, soit 5'20 par km-effort
  const t = fromReference(ref, 100, 6000); // 160 km-effort
  const paceRef = 240 / 45, pace = t / 160;
  assert.ok(pace > paceRef * 1.15 && pace < paceRef * 1.6, `allure ${pace.toFixed(2)} contre ${paceRef.toFixed(2)}`);
  assert.ok(fromReference(ref, 20, 800) < 240, "plus court : plus rapide");
});

test("vainqueur de référence : UTMB 2025 retrouvé, parcours plus durs repérés", () => {
  near(winnerModel(174, 9900), 19 * 60 + 19, 1);
  near(courseFactor(19 * 60 + 19, 174, 9900), 1, 1e-6);
  // TDS 2025 : 18 h 22 sur environ 148 km et 9 100 m D+, réputée plus technique que l'UTMB.
  const tds = courseFactor(18 * 60 + 22, 148, 9100);
  assert.ok(tds > 1.05 && tds < 1.2, `TDS ${tds}`);
  assert.equal(courseFactor(10, 42, 2500), 0.85); // borné
  assert.equal(courseFactor(9000, 42, 2500), 1.4);
});

test("correction du parcours : vainqueur d'abord, sinon terrain, sinon rien", () => {
  assert.deepEqual(courseCorrection(null, 42, 2500), { factor: 1, from: null });
  assert.deepEqual(courseCorrection({ terrain: "technique" }, 42, 2500), { factor: 1.07, from: "terrain" });
  assert.deepEqual(courseCorrection({ terrain: "mixte" }, 42, 2500), { factor: 1, from: null });
  assert.equal(courseCorrection({ terrain: "roulant", winnerMin: 240 }, 42, 2500).from, "vainqueur");
});

test("repères nettoyés : résultat invraisemblable ignoré", () => {
  assert.equal(cleanAnchor(null), null);
  assert.equal(cleanAnchor({ ref: { km: 30, gain: 1500, min: 20 } }), null); // 20 min pour 45 km-effort
  assert.deepEqual(cleanAnchor({ ref: { km: "30", gain: 1500.4, min: 240 }, terrain: "x", winnerMin: 0 }), { ref: { km: 30, gain: 1500, min: 240 }, terrain: null, winnerMin: null });
  assert.deepEqual(cleanAnchor({ terrain: "tres" }), { ref: null, terrain: "tres", winnerMin: null });
});

test("estimation du plan : le vrai résultat passe avant la VO2max, la fourchette se resserre", () => {
  const goal = { name: "Course", date: "2027-01-01", distanceKm: 42, gainM: 2500 };
  const vo2 = raceDemands(goal, "confirme", 40, 55);
  assert.equal(vo2.from, "vo2");
  const ref = raceDemands({ ...goal, anchor: { ref: { km: 30, gain: 1500, min: 300 } } }, "confirme", 40, 55);
  assert.equal(ref.from, "reference");
  near(ref.modelMid, fromReference({ km: 30, gain: 1500, min: 300 }, 42, 2500), 1);
  assert.ok((ref.estimate.high - ref.estimate.low) / ref.modelMid < (vo2.estimate.high - vo2.estimate.low) / vo2.modelMid);
  // Parcours technique : +7 % sur le temps médian.
  const tech = raceDemands({ ...goal, anchor: { terrain: "technique" } }, "confirme", 40, 55);
  near(tech.modelMid, trailTime(55, 42, 2500) * 1.07, 1);
  assert.deepEqual(tech.course, { factor: 1.07, from: "terrain" });
  // Sans repère : inchangé.
  near(vo2.modelMid, trailTime(55, 42, 2500), 1);
});

test("saisie des durées", () => {
  assert.equal(parseDuration("4h05"), 245);
  assert.equal(parseDuration("4 h 05"), 245);
  assert.equal(parseDuration("19:19"), 1159);
  assert.equal(parseDuration("6h"), 360);
  assert.equal(parseDuration("4,5"), 270);
  assert.equal(parseDuration("95 min"), 95);
  assert.equal(parseDuration("4h75"), null);
  assert.equal(parseDuration("abc"), null);
  assert.equal(parseDuration(""), null);
});
