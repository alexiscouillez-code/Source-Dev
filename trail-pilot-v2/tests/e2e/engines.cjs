// Parcours : les moteurs de calcul vus à travers l'API réelle (base de données, profil, plan enregistré).
const { iso, check, newUser, openApp, tab, scenario } = require("./lib.cjs");

scenario("Moteurs de calcul de bout en bout", async () => {
  const { page, errors, api } = await newUser("desktop", { profile: { hrMax: 188, hrRest: 48, daysPerWeek: 4, longDay: 6, level: "regulier" } });
  // 20 sorties avec cardio (de quoi estimer une VO2max), puis 10 sorties récentes sans cardio ni ressenti.
  for (let i = 0; i < 20; i++) await api.activity({ date: iso(-30 - i * 2), sport: "course", durationMin: 55, distanceKm: 10, gainM: 60, avgHr: 150, maxHr: 172 });
  for (let i = 0; i < 10; i++) await api.activity({ date: iso(-1 - i * 2), sport: "course", durationMin: i < 8 ? 60 : 40, distanceKm: i < 8 ? 9.5 : 9.4, gainM: 40 });

  const acts = (await api.get(`/api/activities?today=${iso(0)}`)).activities;
  const noHr = acts.filter((a) => !a.avg_hr);
  check(noHr.length === 10 && noHr.every((a) => a.effortSource === "allure"), "sans cardio, l'effort est déduit de l'allure", noHr.map((a) => a.effortSource));
  const slow = noHr.find((a) => a.duration_min === 60), fast = noHr.find((a) => a.duration_min === 40);
  check(slow?.effort <= 4, "un footing lent compte comme facile", slow?.effort);
  check(fast?.effort >= 7, "une sortie rapide compte comme intense", fast?.effort);

  const an = await api.get(`/api/analysis?today=${iso(0)}`);
  const tot = an.intensity.easy + an.intensity.moderate + an.intensity.hard;
  check(an.intensity.easy / tot > 0.7, "la répartition d'intensité reflète des footings faciles", Math.round((an.intensity.easy / tot) * 100) + " %");

  const g = await api.put("/api/goal", { today: iso(0), name: "Trail test", date: iso(98), distanceKm: 42, gainM: 2500 });
  check(g.ok(), "l'objectif est enregistré", g.status());
  const plan = await api.get(`/api/plan?today=${iso(0)}`);
  const meta = plan.meta ?? plan.plan;
  check(meta?.engine === 3, "le plan est calculé par le moteur actuel", meta?.engine);
  const build = (meta?.weeks ?? []).filter((w) => w.phase !== "Affûtage" && w.phase !== "Semaine de course");
  const bad = build.filter((w, i) => w.light && i > 0 && !build[i - 1].light && w.minutes >= build[i - 1].minutes);
  check(build.length > 4 && bad.length === 0, "chaque semaine allégée est plus légère que la précédente", bad.map((w) => w.monday));

  await openApp(page);
  await tab(page, "analysis");
  await page.waitForTimeout(2000);
  const vo2 = await page.locator(".vo2-big, .vo2 .big").first().innerText().catch(() => "");
  check(/^\d{2},\d$/.test(vo2.trim()), "la VO2max s'affiche", vo2);
  check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3));
});
