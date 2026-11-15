/** Bilan IA d'une sortie : jamais de donnée Strava, réponse de l'IA lue avec prudence. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReview, reviewable, reviewPayload } from "../../lib/engine/ai-review";

const act = { date: "2026-11-10", sport: "trail", name: "Sortie du mardi", source: "fichier", stravaId: null, durationMin: 72, distanceKm: 12.4, gainM: 640, lossM: 630, avgHr: 148, maxHr: 171, rpe: null, analysis: null };

test("une sortie venue de Strava n'est jamais éligible", () => {
  assert.equal(reviewable({ source: "strava", stravaId: "123" }), false);
  assert.equal(reviewable({ source: "fichier", stravaId: "123" }), false, "même marquée fichier, un identifiant Strava l'exclut");
  assert.throws(() => reviewPayload({ ...act, source: "strava", stravaId: "9" }, null, null, { hrMax: 190, hrRest: 50 }));
});

test("fichier de montre, GPX et saisie manuelle sont éligibles", () => {
  for (const source of ["fichier", "gpx", "manual"]) assert.equal(reviewable({ source, stravaId: null }), true, source);
});

test("les données envoyées ne contiennent que la sortie, la séance prévue, le check-in et les repères déclarés", () => {
  const p = reviewPayload(act, { title: "Sortie longue", template: "long", durationMin: 75, rpeTarget: 4, description: "Facile." }, { sleep: 4, legs: 3, motivation: 4, pain: 1, note: "Bonnes jambes" }, { hrMax: 190, hrRest: 50 });
  assert.deepEqual(Object.keys(p).sort(), ["checkin_du_jour", "reperes", "seance_prevue", "sortie"]);
  const text = JSON.stringify(p);
  for (const banned of ["ctl", "atl", "vo2", "forme", "fatigue", "strava"]) assert.ok(!text.toLowerCase().includes(banned), `aucun « ${banned} » dans les données envoyées`);
});

test("lecture de la réponse : JSON entouré de texte, listes bornées", () => {
  const r = parseReview('Voici :\n```json\n{"titre":"Belle sortie régulière","forts":["a","b","c","d"],"surveiller":["x","y","z"],"conseil":"Hydrate-toi."}\n```');
  assert.ok(r);
  assert.equal(r.titre, "Belle sortie régulière");
  assert.equal(r.forts.length, 3);
  assert.equal(r.surveiller.length, 2);
});

test("réponse illisible ou vide : pas de bilan", () => {
  assert.equal(parseReview("Désolé, je ne peux pas."), null);
  assert.equal(parseReview('{"titre":"","forts":[]}'), null);
});
