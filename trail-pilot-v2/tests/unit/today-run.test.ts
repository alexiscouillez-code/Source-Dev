/** Bloc « Ma sortie du jour » : profil d'altitude compact, grille de points, formats. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { altProfile, analyze, cleanAnalysis } from "../../lib/engine/streams";
import { alongTrack, dotHeights, fmtKm1, fmtPace, resample } from "../../lib/engine/today-run";

test("profil d'altitude : 40 points régulièrement espacés en distance", () => {
  // 12 km : montée de 400 à 900 m sur 6 km puis descente.
  const n = 3600, dist = Array.from({ length: n }, (_, i) => (i / (n - 1)) * 12000);
  const alt = dist.map((d) => (d <= 6000 ? 400 + d / 12 : 900 - (d - 6000) / 12));
  const p = altProfile(alt, dist)!;
  assert.equal(p.length, 40);
  assert.ok(Math.abs(p[0] - 400) < 15 && Math.abs(p[39] - 400) < 15, `départ ${p[0]}, arrivée ${p[39]}`);
  assert.ok(Math.max(...p) > 880, "le sommet est conservé");
});

test("profil d'altitude : rien sans distance, sous 1 km ou avec des valeurs aberrantes seules", () => {
  assert.equal(altProfile([1, 2, 3], undefined), undefined);
  const dist = Array.from({ length: 100 }, (_, i) => i * 5);
  assert.equal(altProfile(dist.map(() => 500), dist), undefined, "500 m de sortie : pas de profil");
});

test("le profil est produit par l'analyse et survit à la validation", () => {
  const n = 1800, time = Array.from({ length: n }, (_, i) => i), dist = time.map((t) => t * 3), alt = dist.map((d) => 300 + Math.sin(d / 800) * 50);
  const a = analyze({ time, distance: dist, altitude: alt, speed: time.map(() => 3) })!;
  assert.equal(a.alt?.length, 40);
  assert.deepEqual(cleanAnalysis(JSON.parse(JSON.stringify(a)))?.alt, a.alt);
  assert.equal(cleanAnalysis({ ...a, alt: [1, 2, 99999] })?.alt, undefined, "un profil invalide est écarté");
});

test("rééchantillonnage et hauteur des colonnes de points", () => {
  assert.deepEqual(resample([0, 10, 20, 30], 2), [5, 25]);
  assert.equal(resample(Array.from({ length: 100 }, (_, i) => i), 40).length, 40);
  const h = dotHeights([100, 150, 200], 12);
  assert.deepEqual([h[0], h[2]], [1, 12], "le point le plus bas a une rangée, le plus haut toutes");
  assert.ok(dotHeights([500, 500], 12).every((x) => x === 6), "profil plat : colonnes à mi-hauteur");
});

test("formats : allure et distance à la française", () => {
  assert.equal(fmtPace(342), "5'42");
  assert.equal(fmtPace(359.6), "6'00");
  assert.equal(fmtKm1(24.64), "24,6");
});

test("alongTrack : points régulièrement espacés du départ à l'arrivée", () => {
  const line: [number, number][] = [[45, 6], [45.01, 6], [45.03, 6]]; // environ 3,3 km vers le nord
  const pts = alongTrack(line, 5);
  assert.equal(pts.length, 5);
  assert.deepEqual(pts[0], [45, 6]);
  assert.ok(Math.abs(pts[4][0] - 45.03) < 1e-9);
  for (let i = 1; i < 5; i++) assert.ok(Math.abs(pts[i][0] - pts[i - 1][0] - 0.0075) < 1e-6);
  assert.deepEqual(alongTrack([[45, 6], [45.001, 6]], 5), []); // moins de 500 m
  assert.deepEqual(alongTrack([[45, 6]], 5), []);
});
