// Parcours : séances suspectes repérées, exclues, et le graphique de forme qui n'est plus écrasé. En thème clair.
const { iso, check, newUser, openApp, tab, overflow, scenario } = require("./lib.cjs");

scenario("Séances suspectes et échelle du graphique (thème clair)", async () => {
  for (const device of ["phone", "desktop"]) {
    console.log(`— ${device}`);
    const { page, errors, api } = await newUser(device, { theme: "light", profile: { hrMax: 188, hrRest: 48, daysPerWeek: 5, longDay: 6, maxWeeklyMinutes: 480, level: "confirme" } });
    for (let i = 0; i < 36; i++) await api.activity({ date: iso(-1 - i * 2), sport: i % 3 ? "course" : "trail", durationMin: 45 + (i % 5) * 12, distanceKm: 8 + (i % 5) * 1.6, gainM: 150 + (i % 4) * 120, avgHr: 128 + (i % 4) * 7 });
    await api.activity({ date: iso(-40), sport: "trail", durationMin: 1700, distanceKm: 18, gainM: 900, avgHr: 118 }); // chrono resté allumé
    await api.activity({ date: iso(-20), sport: "course", durationMin: 35, distanceKm: 33 }); // trajet en voiture

    await openApp(page);
    check(await page.evaluate(() => document.documentElement.dataset.theme === "light" || document.documentElement.classList.contains("light")), "le thème clair est actif");
    await tab(page, "analysis");
    const card = page.locator(".card.suspects");
    check(await card.waitFor({ timeout: 15000 }).then(() => true, () => false), "la carte « Séances à vérifier » apparaît");
    const n = await page.locator(".sus-list li").count();
    check(n === 2, "les deux séances piégées sont repérées, et elles seules", n);

    const chart = page.locator('svg.chart[aria-label^="Évolution de la forme"]');
    await chart.scrollIntoViewIfNeeded();
    await page.waitForTimeout(3500);
    check((await page.locator(".ch-peak text").count()) > 0, "le pic hors norme est signalé hors échelle");

    for (let k = 0; k < n; k++) { await page.locator(".sus-list li:not(.out)").first().locator("text=Exclure du calcul").click(); await page.waitForTimeout(1800); }
    check((await card.count()) === 0, "la carte disparaît une fois les séances exclues");
    await chart.scrollIntoViewIfNeeded();
    await page.waitForTimeout(3500);
    check((await page.locator(".ch-peak text").count()) === 0, "le graphique retrouve une échelle normale");
    const records = await page.locator(".records").innerText().catch(() => "");
    check(!/28 h|33 km/.test(records), "les records ne contiennent plus les séances exclues");

    // Les séances exclues restent visibles dans la liste, barrées.
    await page.evaluate(() => window.scrollTo(0, 0));
    if (await page.locator("[data-tab=runs] >> visible=true").count()) await tab(page, "runs");
    else await page.locator('button:has-text("Séances") >> visible=true').first().click();
    await page.waitForTimeout(1800);
    check((await page.locator(".item.excluded").count()) === 2, "les séances exclues restent listées, barrées", await page.locator(".item.excluded").count());

    check((await overflow(page)) <= 0, "pas de débordement horizontal");
    check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3));
  }
});
