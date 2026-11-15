/**
 * Planning : règles qu’un plan doit toujours respecter, vérifiées sur des profils de coureurs variés.
 * Ces règles ont chacune été cassées au moins une fois pendant le développement (semaine « allégée » plus lourde
 * que la précédente, saut de volume de +63 %, sortie longue à 50 % de la semaine, volume annoncé ≠ séances).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRacePlan, baselineWeekly, recentLongest, type Level, type PlanItem } from "../../lib/engine/planner";
import { addDays } from "../../lib/engine/dates";

const today = "2026-11-16"; // un lundi : semaines pleines dès le départ
const hist = (weekly: number, perWeek: number) =>
  Array.from({ length: 4 * perWeek }, (_, i) => ({ date: addDays(today, -1 - Math.floor((i * 7) / perWeek)), sport: "course" as const, durationMin: weekly / perWeek, distanceKm: weekly / perWeek / 6, gainM: 150 }));

const PROFILES: { label: string; level: Level; km: number; gain: number; days: number; weekly: number; perWeek: number; vdot: number | null; cap?: number }[] = [
  { label: "débutant 20 km", level: "debutant", km: 20, gain: 900, days: 84, weekly: 120, perWeek: 3, vdot: null },
  { label: "régulier marathon trail", level: "regulier", km: 42, gain: 2500, days: 112, weekly: 240, perWeek: 4, vdot: 48 },
  { label: "confirmé 80 km", level: "confirme", km: 80, gain: 4500, days: 140, weekly: 360, perWeek: 5, vdot: 55 },
  { label: "confirmé ultra 170 km", level: "confirme", km: 170, gain: 10000, days: 196, weekly: 480, perWeek: 6, vdot: 58 },
  { label: "régulier 30 km en 5 semaines", level: "regulier", km: 30, gain: 1500, days: 35, weekly: 180, perWeek: 4, vdot: 45 },
  { label: "régulier plafonné à 4 h/sem", level: "regulier", km: 50, gain: 3000, days: 126, weekly: 200, perWeek: 4, vdot: 47, cap: 240 },
];

const weighted = (xs: PlanItem[]) => xs.reduce((t, x) => t + (x.template === "strength" ? x.durationMin * 0.5 : x.durationMin), 0);

for (const p of PROFILES) {
  const goalDate = addDays(today, p.days);
  const { items, plan } = buildRacePlan({
    today,
    profile: { daysPerWeek: p.perWeek, longDay: 6, maxWeeklyMinutes: p.cap ?? null, level: p.level },
    goal: { name: "Course test", date: goalDate, distanceKm: p.km, gainM: p.gain },
    activities: hist(p.weekly, p.perWeek),
    load: { ctl: (p.weekly / 7) * 1.6, atl: (p.weekly / 7) * 1.6, ratio: 1, calibrated: true },
    vdot: p.vdot,
  });
  const inWeek = (monday: string) => items.filter((i) => i.date >= monday && i.date < addDays(monday, 7) && i.template !== "race");
  const build = plan.weeks.filter((w) => w.phase !== "Affûtage" && w.phase !== "Semaine de course");

  test(`${p.label} : la course est le dernier jour du plan`, () => {
    const race = items.filter((i) => i.template === "race");
    assert.equal(race.length, 1);
    assert.equal(race[0].date, goalDate);
    assert.ok(items.every((i) => i.date <= goalDate && i.date >= today), "aucune séance hors de la période du plan");
  });

  test(`${p.label} : le volume annoncé de chaque semaine est celui des séances`, () => {
    for (const w of plan.weeks) {
      const xs = inWeek(w.monday);
      if (xs.length < 2) continue;
      assert.ok(Math.abs(weighted(xs) - w.minutes) <= 5, `semaine du ${w.monday} : annoncé ${w.minutes} min, séances ${weighted(xs)} min`);
    }
  });

  test(`${p.label} : une semaine allégée est vraiment plus légère que la précédente`, () => {
    for (let i = 1; i < build.length; i++) {
      if (!build[i].light || build[i - 1].light) continue;
      assert.ok(build[i].minutes < build[i - 1].minutes, `semaine allégée du ${build[i].monday} : ${build[i].minutes} min contre ${build[i - 1].minutes} la semaine d’avant`);
    }
  });

  test(`${p.label} : le volume ne monte pas de plus de 20 % d’une semaine pleine à la suivante`, () => {
    let prev = plan.current.weeklyMin;
    for (const w of build) {
      if (w.light) continue;
      assert.ok(w.minutes <= prev * 1.2 + 5, `semaine du ${w.monday} : ${w.minutes} min après ${Math.round(prev)} min`);
      prev = w.minutes;
    }
  });

  test(`${p.label} : la sortie longue ne dépasse pas 45 % de la semaine`, () => {
    for (const w of build) if (w.longMin && w.minutes >= 60) assert.ok(w.longMin <= w.minutes * 0.45 + 5, `semaine du ${w.monday} : longue ${w.longMin} min sur ${w.minutes}`);
  });

  test(`${p.label} : au moins 60 % du temps en facile, une seule séance dure par semaine au plus`, () => {
    const xs = items.filter((i) => i.template !== "race" && i.sport !== "renfo");
    const tot = xs.reduce((t, x) => t + x.durationMin, 0);
    const easy = xs.filter((x) => x.rpeTarget <= 4).reduce((t, x) => t + x.durationMin, 0);
    assert.ok(easy / tot >= 0.6, `facile ${Math.round((easy / tot) * 100)} %`);
    for (const w of plan.weeks) assert.ok(inWeek(w.monday).filter((x) => x.rpeTarget >= 7).length <= 2, `semaine du ${w.monday}`);
  });

  if (p.cap) test(`${p.label} : le temps disponible par semaine est respecté`, () => {
    for (const w of plan.weeks) assert.ok(w.minutes <= p.cap! + 5, `semaine du ${w.monday} : ${w.minutes} min pour ${p.cap} disponibles`);
  });
}

test("point de départ : une semaine creuse isolée n’entraîne pas le plan vers le bas", () => {
  const acts = [0, 1, 2].flatMap((w) => [0, 2, 4].map((d) => ({ date: addDays(today, -1 - w * 7 - d), sport: "course" as const, durationMin: 60 })));
  assert.equal(Math.round(baselineWeekly(acts, today, "regulier")), 180);
});

test("point de départ : une sortie exceptionnelle n’est pas prise pour la sortie longue habituelle", () => {
  const acts = [{ date: addDays(today, -3), sport: "trail" as const, durationMin: 400 }, { date: addDays(today, -9), sport: "course" as const, durationMin: 90 }];
  assert.equal(recentLongest(acts, today), 135);
});
