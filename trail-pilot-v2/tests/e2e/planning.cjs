// Parcours : accueil avec objectif, check-in du matin, calendrier, validation automatique des séances.
const { BASE, iso, check, newUser, tab, overflow, scenario, db, userId } = require("./lib.cjs");

scenario("Planning, check-in et validation automatique", async () => {
  for (const device of ["phone", "desktop"]) {
    console.log(`— ${device}`);
    const { page, errors, api, email } = await newUser(device);
    // Accueil : l'objectif crée le plan.
    await page.goto(BASE + "/espace");
    await page.waitForSelector(".onb");
    await page.fill('.onb input[maxlength="100"]', "Trail des Crêtes");
    await page.fill(".onb input[type=date]", iso(120));
    await page.fill('.onb input[placeholder="42"]', "32");
    await page.fill('.onb input[placeholder="2500"]', "1800");
    await page.click(".onb button[type=submit]");
    await page.waitForSelector("text=Ton profil de coureur", { timeout: 20000 });
    await page.click(".onb button[type=submit]");
    await page.waitForSelector("text=Ajoute tes sorties");
    await api.put("/api/profile", { hrMax: 188, hrRest: 48, daysPerWeek: 5, longDay: 6, maxWeeklyMinutes: 480, level: "confirme" });
    for (let w = 0; w < 5; w++) await api.activity({ date: iso(-9 - w * 7), sport: "trail", durationMin: 110, distanceKm: 16, gainM: 700, rpe: 4, avgHr: 145 });
    await page.click(".onb >> text=Plus tard").catch(() => {});

    const plan = await api.get(`/api/plan?today=${iso(0)}`);
    check(plan.sessions?.length > 20, "le plan est construit", plan.sessions?.length);
    check(plan.sessions?.some((s) => s.template === "race" && s.date === iso(120)), "la course est placée le jour J");

    // Check-in du matin avec commentaire.
    await page.goto(BASE + "/espace");
    // Le check-in s'ouvre en fiche, par-dessus l'accueil.
    await page.getByRole("button", { name: "Faire mon check-in" }).click();
    await page.waitForSelector(".panel-checkin .ci-card");
    for (const [i, n] of [[0, 1], [1, 1], [2, 2]]) await page.locator("fieldset.scale").nth(i).locator("label").nth(n).click();
    await page.fill(".ci-note textarea", "Nuit hachée, mollet droit raide au réveil.");
    await page.locator(".ci-card button[type=submit]").click();
    check(await page.waitForSelector(".verdict", { timeout: 15000 }).then(() => true, () => false), "le check-in donne une décision du jour");

    // Calendrier.
    await tab(page, "plan");
    await page.waitForSelector(".cal-grid");
    const days = await page.locator(".cal-day").count();
    check(days >= 28 && days <= 42, "le calendrier affiche le mois", days);
    check((await page.locator(".ev").count()) > 5, "les séances apparaissent dans le calendrier");
    await page.locator('.view-switch button:has-text("Liste")').click();
    check(await page.waitForSelector(".wk", { timeout: 5000 }).then(() => true, () => false), "la vue liste s'affiche");
    await page.locator('.view-switch button:has-text("Calendrier")').click();
    // Toucher un jour ouvre sa fiche par-dessus le calendrier (rien ne s'ouvre en dessous).
    const future = page.locator(".cal-day:not(.past):has(.ev)").nth(1);
    await future.click();
    await page.waitForSelector(".panel-day .day-sess", { timeout: 6000 });
    check(await page.locator(".cal-detail").count() === 0 && await page.locator(".panel-day .cal-comment textarea").count() === 1, "un jour du calendrier s'ouvre en fiche, avec son commentaire du jour");
    await page.locator(".panel-day .panel-x").click(); await page.waitForTimeout(700);

    // Une sortie enregistrée le jour d'une séance prévue valide cette séance (séance de demain-matin simulée hier, pour rester dans le passé).
    const uid = await userId(email);
    await db().execute({ sql: "INSERT INTO plan_sessions(user_id, date, template, title, sport, duration_min, gain_m, rpe_target, description, phase, status, created_at, updated_at) VALUES (?, ?, 'easy', 'Footing test', 'course', 45, NULL, 4, 'Séance test.', 'Fondation', 'planned', 0, 0)", args: [uid, iso(-1)] });
    await api.activity({ date: iso(-1), sport: "course", durationMin: 44, distanceKm: 8, rpe: 4 });
    const month = await api.get(`/api/plan/month?today=${iso(0)}&month=${iso(-1).slice(0, 7)}`);
    const done = month.sessions.find((s) => s.date === iso(-1) && s.title === "Footing test");
    check(done?.status === "done" && done?.activity_id, "une sortie le jour d'une séance la valide automatiquement", done?.status);

    // Temps de course au plus près du réel : un vrai résultat, puis le temps du vainqueur précédent.
    await tab(page, "plan");
    const before = await api.get(`/api/plan?today=${iso(0)}`);
    await page.locator(".race-refine").click();
    await page.waitForSelector(".race-anchor[open]");
    await page.locator('.race-anchor input[placeholder="30"]').fill("25");
    await page.locator('.race-anchor input[placeholder="1500"]').fill("1200");
    await page.locator('.race-anchor input[placeholder="4h05"]').fill("3h30");
    await page.locator(".race-form button[type=submit]").click();
    // Le plan se recharge après l'enregistrement : on attend le nouveau texte.
    await page.waitForFunction(() => document.querySelector(".race-time")?.textContent.includes("d’après ton résultat"), null, { timeout: 20000 }).catch(() => {});
    const withRef = await api.get(`/api/plan?today=${iso(0)}`);
    check(withRef.plan.estimateFrom === "reference" && withRef.goal.anchor?.ref?.min === 210, "le temps vient du résultat de référence", withRef.plan.estimateFrom);
    check(/d’après ton résultat : 25 km, 1\s?200 m D\+ en 3 h 30/.test(await page.locator(".race-time").innerText()), "l'écran dit d'où vient le temps", await page.locator(".race-time").innerText());
    check(withRef.plan.estimate.low !== before.plan.estimate.low || withRef.plan.estimate.high !== before.plan.estimate.high, "le temps estimé change avec le vrai résultat", [before.plan.estimate, withRef.plan.estimate]);
    await page.locator(".race-refine").click();
    await page.waitForSelector(".race-anchor[open]");
    check((await page.locator('.race-anchor input[placeholder="4h05"]').inputValue()) === "3 h 30", "les repères sont pré-remplis");
    await page.locator('.race-anchor input[placeholder="6h42"]').fill("3h40");
    await page.locator(".race-form button[type=submit]").click();
    await page.waitForFunction(() => document.querySelector(".race-time")?.textContent.includes("vainqueur précédent"), null, { timeout: 20000 }).catch(() => {});
    const withWin = await api.get(`/api/plan?today=${iso(0)}`);
    check(withWin.plan.estimateCourse?.from === "vainqueur", "le temps du vainqueur corrige le parcours", withWin.plan.estimateCourse);
    check(/parcours [+−±]\d+ % \(temps du vainqueur précédent\)/.test(await page.locator(".race-time").innerText()), "la correction du parcours est affichée");
    // Saisie incomplète : message clair, rien n'est enregistré.
    await page.locator(".race-refine").click();
    await page.locator('.race-anchor input[placeholder="4h05"]').fill("");
    await page.locator(".race-form button[type=submit]").click();
    check(await page.locator(".race-form .note.err").isVisible(), "résultat incomplet : message clair");
    await page.locator(".race-form .link", { hasText: "Annuler" }).click();

    check((await overflow(page)) <= 0, "pas de débordement horizontal");
    check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3));
  }
});
