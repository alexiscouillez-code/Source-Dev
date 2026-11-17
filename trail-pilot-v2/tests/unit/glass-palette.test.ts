import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTint, glassPalette, luminance, oklchHex, TINTS } from "../../components/glassPalette";

const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const dist = (a: string, b: string) => { const p = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)); const [x, y] = [p(a), p(b)]; return Math.max(...x.map((v, i) => Math.abs(v - y[i]))); };

test("la teinte indigo retrouve la palette d'origine", () => {
  const p = glassPalette({ h: 280, k: 1 });
  for (const [k, ref] of [["--g-0", "#0b0b2b"], ["--g-1", "#2a1f6e"], ["--g-2", "#3b2fa6"], ["--g-3", "#5b4bd6"], ["--g-acc", "#3d46e8"], ["--g-glow", "#b48cff"]]) {
    assert.ok(dist(p[k], ref) <= 6, `${k} : ${p[k]} au lieu de ${ref}`);
  }
});

test("toutes les teintes gardent le texte blanc lisible sur les boutons et le fond", () => {
  for (let h = 0; h < 360; h += 5) for (const k of [0, 0.5, 1]) {
    const p = glassPalette({ h, k });
    assert.ok(contrast("#ffffff", p["--g-acc"]) >= 4.5, `bouton, teinte ${h}, intensité ${k} : ${contrast("#ffffff", p["--g-acc"]).toFixed(2)}`);
    assert.ok(contrast("#ffffff", p["--g-3"]) >= 4.5, `bas du bloc, teinte ${h}, intensité ${k}`);
    assert.ok(contrast("#ffffff", p["--g-ink"]) >= 10, `texte sombre, teinte ${h}`);
    for (const v of Object.values(p)) assert.match(v, /^#[0-9a-f]{6}$/);
  }
});

test("une couleur hors de l'écran perd de la saturation, pas de luminosité", () => {
  // Vert très saturé et sombre : impossible en sRGB, ramené à la couleur la plus saturée possible.
  const g = oklchHex(0.503, 0.238, 145), grey = oklchHex(0.503, 0, 145);
  assert.ok(Math.abs(luminance(g) - luminance(grey)) < 0.02, `${g} / ${grey}`);
});

test("teintes proposées distinctes et teinte nettoyée", () => {
  assert.equal(new Set(TINTS.map((t) => glassPalette(t.tint)["--g-2"])).size, TINTS.length);
  assert.deepEqual(cleanTint({ h: -30, k: 3 }), { h: 330, k: 1 });
  assert.deepEqual(cleanTint({ h: 725.4, k: Number.NaN }), { h: 5, k: 1 });
  assert.deepEqual(cleanTint(null), { h: 280, k: 1 });
});
