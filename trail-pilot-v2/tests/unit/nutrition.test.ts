import { test } from "node:test";
import assert from "node:assert/strict";
import { carbDay, cleanDraft, cleanPlate, compareIntake, dayKind, fromOpenFoodFacts, guessKind, intakeStats, personalWater, PLATES, plateFeedback, recoveryFor, sweatTest, testedBest } from "../../lib/engine/nutrition";

const s = (template: string, durationMin: number, status = "planned") => ({ template, durationMin, status });

test("assiettes : proportions qui font 100 %, plus de féculents quand la journée est dure", () => {
  for (const p of Object.values(PLATES)) assert.equal(p.feculents + p.legumes + p.proteines, 100);
  assert.ok(PLATES.dur.feculents > PLATES.modere.feculents && PLATES.modere.feculents > PLATES.facile.feculents);
});

test("type de journée : repos facile, qualité modérée, sortie longue ou veille de course dure", () => {
  assert.equal(dayKind({ today: null, tomorrow: null }).kind, "facile");
  assert.equal(dayKind({ today: s("easy", 40), tomorrow: null }).kind, "facile");
  assert.equal(dayKind({ today: s("tempo", 50), tomorrow: null }).kind, "modere");
  assert.equal(dayKind({ today: s("easy", 70), tomorrow: null }).kind, "modere");
  assert.equal(dayKind({ today: s("long", 150), tomorrow: null }).kind, "dur");
  assert.equal(dayKind({ today: s("easy", 30), tomorrow: s("race", 300) }).kind, "dur");
  assert.equal(dayKind({ today: null, tomorrow: s("long", 140) }).kind, "dur", "veille de sortie longue");
  // Sortie non prévue plus longue que la séance : c'est ce qui a été fait qui compte.
  assert.equal(dayKind({ today: s("easy", 40), doneMin: 135, tomorrow: null }).kind, "dur");
  // Séance sautée : on ne compte pas sa durée.
  assert.equal(dayKind({ today: s("long", 150, "skipped"), tomorrow: null }).kind, "facile");
});

test("récupération : seulement après une séance lourde, repas complet après une très longue sortie", () => {
  assert.equal(recoveryFor({ durationMin: 45, template: "easy", effort: 4 }), null);
  const q = recoveryFor({ durationMin: 50, template: "tempo" });
  assert.ok(q && /collation/.test(q.title));
  const l = recoveryFor({ durationMin: 180, template: "long", tomorrow: s("tempo", 60) });
  assert.ok(l && /repas complet/.test(l.title) && l.next);
  assert.ok(recoveryFor({ durationMin: 55, template: null, effort: 8 }), "effort ressenti dur");
});

test("prises : glucides par heure comptés dès la 30e minute, comparés à la cible", () => {
  const products = [{ id: 1, name: "Gel", carbs: 25, sodium: 50, caffeine: 0 }, { id: 2, name: "Barre", carbs: 40, sodium: 100 }];
  const st = intakeStats([{ productId: 1, qty: 4 }, { productId: 2, qty: 1 }, { productId: 9, qty: 3 }], products, 150);
  assert.equal(st.carbs, 140);
  assert.equal(st.units, 5);
  assert.equal(st.gPerHour, 70, "140 g sur 2 h (150 min moins la première demi-heure)");
  assert.equal(compareIntake(70, 60)?.verdict, "au-dessus");
  assert.equal(compareIntake(55, 60)?.verdict, "dans-cible");
  assert.equal(compareIntake(40, 60)?.verdict, "en-dessous");
  assert.equal(compareIntake(null, 60), null);
  assert.deepEqual(testedBest([{ date: "2026-10-01", feel: "ok", gPerHour: 50 }, { date: "2026-10-08", feel: "ko", gPerHour: 80 }, { date: "2026-10-15", feel: "ok", gPerHour: 65 }]), { gPerHour: 65, date: "2026-10-15" });
});

test("photo d'assiette : pourcentages ramenés à 100, retour qui n'invite jamais à manger moins", () => {
  const r = cleanPlate({ feculents: 1, legumes: 2, proteines: 1, foods: ["riz", "brocoli", 3] });
  assert.deepEqual(r, { feculents: 25, legumes: 50, proteines: 25, foods: ["riz", "brocoli"] });
  assert.equal(cleanPlate({ feculents: 0, legumes: 0, proteines: 0 }), null);
  assert.equal(plateFeedback(r!, "facile").ok, true);
  const hard = plateFeedback(r!, "dur");
  assert.equal(hard.ok, false);
  assert.match(hard.text, /féculents/);
  // Beaucoup de féculents un jour facile : pas de reproche.
  const pasta = cleanPlate({ feculents: 60, legumes: 15, proteines: 25 })!;
  assert.doesNotMatch(plateFeedback(pasta, "facile").text, /trop|moins/i);
});

test("produits : nettoyage des saisies et lecture d'une fiche Open Food Facts", () => {
  assert.equal(cleanDraft({ name: "" }), null);
  const d = cleanDraft({ name: "Gel coco", kind: "gel", carbsPerUnit: "25,5", sodiumMg: 9999, barcode: "37 0000 000 0017" });
  assert.equal(d?.carbs, 25.5);
  assert.equal(d?.sodium, null, "valeur aberrante écartée");
  assert.equal(d?.barcode, "3700000000017");
  assert.equal(guessKind("Energy Gel Citron"), "gel");
  assert.equal(guessKind("Barre amande"), "barre");
  const off = fromOpenFoodFacts("3700000000017", { product_name_fr: "Gel énergétique citron", brands: "Marque, Autre", quantity: "32 g", nutriments: { carbohydrates_100g: 78, sodium_100g: 0.15, caffeine_100g: 0.25 } });
  assert.equal(off?.kind, "gel");
  assert.equal(off?.brand, "Marque");
  assert.equal(off?.carbs, 25, "78 g pour 100 g × 32 g");
  assert.equal(off?.sodium, 48);
  assert.equal(off?.caffeine, 80);
  const serving = fromOpenFoodFacts("123456789012", { product_name: "Drink mix", serving_size: "1 dose (40 g)", serving_quantity: 40, nutriments: { carbohydrates_serving: 38, carbohydrates_100g: 95 } });
  assert.equal(serving?.carbs, 38, "la portion prime sur les valeurs pour 100 g");
  assert.equal(serving?.unit, "1 dose (40 g)");
});

test("récupération en grammes quand le poids est connu", () => {
  assert.equal(recoveryFor({ durationMin: 180, template: "long" })?.grams, null, "sans poids : portions seulement");
  const r = recoveryFor({ durationMin: 180, template: "long", weightKg: 70 })!;
  assert.deepEqual(r.grams, { carbs: [70, 85], protein: [20, 20] });
  assert.match(r.items[0], /70 à 85 g de glucides et environ 20 g de protéines/);
  assert.match(r.items[0], /g de pâtes ou de riz crus/);
  const q = recoveryFor({ durationMin: 60, template: "tempo", weightKg: 60 })!;
  assert.deepEqual(q.grams?.carbs, [50, 60], "0,8 à 1 g/kg après une séance moins longue");
  assert.equal(recoveryFor({ durationMin: 180, template: "long", weightKg: 500 })?.grams, null, "poids aberrant ignoré");
});

test("glucides de la journée : seulement en recharge ou grosse journée, avec un poids", () => {
  assert.equal(carbDay({ kind: "dur", loading: false, weightKg: null }), null);
  assert.equal(carbDay({ kind: "modere", loading: false, weightKg: 70 }), null, "jour normal : les proportions suffisent");
  const big = carbDay({ kind: "dur", loading: false, weightKg: 70 })!;
  assert.deepEqual(big.total, [420, 560]);
  const load = carbDay({ kind: "dur", loading: true, weightKg: 70 })!;
  assert.deepEqual(load.perKg, [8, 10]);
  assert.deepEqual(load.total, [560, 700]);
  assert.equal(load.meal, 160, "un quart par repas");
  assert.equal(load.pasta, 160, "(160 − 45) / 0,72 ≈ 160 g crus");
  assert.equal(load.snacks, 160);
});

test("test de sudation : perte par heure, seuil des 2 %, jamais finir plus lourd", () => {
  const ok = sweatTest({ preKg: 70, postKg: 69.2, drankMl: 500, minutes: 90 })!;
  assert.equal(ok.rate, 0.87, "(0,8 kg + 0,5 L) / 1,5 h");
  assert.equal(ok.lossPct, 1.1);
  assert.equal(ok.verdict, "ok");
  const dry = sweatTest({ preKg: 70, postKg: 68.4, drankMl: 0, minutes: 120 })!;
  assert.equal(dry.verdict, "trop-perdu");
  assert.match(dry.text, /2,3 %/);
  const wet = sweatTest({ preKg: 70, postKg: 70.3, drankMl: 1500, minutes: 120 })!;
  assert.equal(wet.verdict, "trop-bu");
  assert.equal(sweatTest({ preKg: 70, postKg: 69, drankMl: 0, minutes: 30 }), null, "sortie trop courte");
  assert.equal(sweatTest({ preKg: 70, postKg: 60, drankMl: 0, minutes: 90 }), null, "pesées incohérentes");
});

test("eau par heure en course : 60 à 80 % de la sudation, plus s'il fait plus chaud que pendant le test", () => {
  assert.deepEqual(personalWater(1, "doux"), [600, 800]);
  const hot = personalWater(1, "doux", "chaud");
  assert.ok(hot[0] > 600 && hot[1] > 800);
  assert.deepEqual(personalWater(1, "chaud", "chaud"), [600, 800], "test déjà au chaud : pas de majoration");
  assert.ok(personalWater(1, "doux", "froid")[1] < 800);
  assert.equal(personalWater(0.3, "frais")[0], 300, "plancher de 300 ml/h");
  const [lo, hi] = personalWater(1.4, "frais", "tres-chaud");
  assert.ok(hi <= 1.4 * 1.35 * 1000 && lo <= hi, "jamais plus que la sueur, même majorée");
});
