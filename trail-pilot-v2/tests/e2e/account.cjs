// Parcours : état des connexions dans le compte, bilan IA des sorties (affichage, et refus pour une sortie Strava).
// L'IA n'est pas branchée pendant les tests : on vérifie les garde-fous et l'affichage d'un bilan enregistré.
const { OUT, iso, check, newUser, openApp, tab, unfoldAll, overflow, scenario, db, userId } = require("./lib.cjs");

scenario("État des connexions et bilan IA des sorties", async () => {
  for (const device of ["phone", "desktop"]) {
    console.log(`— ${device}`);
    const { page, errors, api, email } = await newUser(device, { profile: { hrMax: 188, hrRest: 48, daysPerWeek: 4, longDay: 6, level: "regulier" } });
    const uid = await userId(email);

    // État des connexions.
    const st = await api.get("/api/status");
    const byKey = Object.fromEntries((st.services ?? []).map((s) => [s.key, s]));
    check(["strava", "push", "ia", "meteo", "mail"].every((k) => byKey[k]), "les cinq services sont listés", Object.keys(byKey));
    check(!JSON.stringify(st).match(/secret|token|bearer|api_?key|password|@/i), "aucune clé, aucun jeton ni adresse dans la réponse");
    await db().execute({ sql: "INSERT OR REPLACE INTO service_status(service, user_id, last_ok_at, last_fail_at, last_error) VALUES ('meteo', 0, ?, ?, 'Réponse 503 du service')", args: [Date.now() - 7200e3, Date.now() - 600e3] });
    await openApp(page);
    await tab(page, "account");
    await unfoldAll(page);
    const card = page.locator(".svc-list");
    await card.scrollIntoViewIfNeeded();
    check((await page.locator(".svc").count()) === 5, "la carte affiche les cinq services");
    await page.locator(".fold", { hasText: "État des connexions" }).screenshot({ path: `${OUT}/${device}-etat-connexions.png` }).catch(() => {});
    const meteo = (await page.locator(".svc", { hasText: "Météo" }).innerText()).replace(/\n+/g, " ");
    check(/En panne depuis 10 min/i.test(meteo) && /503/.test(meteo), "une panne en cours est signalée avec sa durée", meteo);
    check(/1 en panne/i.test(await page.locator(".fold", { hasText: "État des connexions" }).locator(".chip").first().innerText()), "le résumé de la carte compte la panne");

    // Bilan IA : refus pour une sortie Strava, affichage d'un bilan enregistré.
    await db().execute({ sql: "INSERT INTO activities(user_id, date, sport, name, duration_min, distance_km, gain_m, source, strava_id, created_at, updated_at) VALUES (?, ?, 'course', 'Sortie Strava', 50, 9, 80, 'strava', ?, 0, 0)", args: [uid, iso(-2), String(Date.now())] });
    const r = await api.activity({ date: iso(-1), sport: "trail", name: "Sortie fichier", durationMin: 70, distanceKm: 12, gainM: 600, avgHr: 145, source: "fichier" });
    const fileId = (await r.json()).id;
    const strava = (await db().execute({ sql: "SELECT id FROM activities WHERE user_id = ? AND strava_id IS NOT NULL", args: [uid] })).rows[0].id;
    const refused = await api.post(`/api/activities/${strava}/review`, {});
    check(refused.status() === 400 || refused.status() === 503, "le bilan IA est refusé pour une sortie Strava", refused.status());
    const off = await api.post(`/api/activities/${fileId}/review`, {});
    check(off.status() === 503, "sans IA activée, le bilan est refusé proprement", off.status());

    const review = { v: 1, at: Date.now(), titre: "Sortie régulière, bonne gestion des montées", forts: ["Temps au kilomètre réguliers sur la seconde moitié."], surveiller: ["Fréquence cardiaque haute dans la dernière montée."], conseil: "Prends un gel toutes les 40 minutes sur ta prochaine sortie longue." };
    await db().execute({ sql: "UPDATE activities SET ai_review = ? WHERE id = ?", args: [JSON.stringify(review), fileId] });
    const list = await api.get(`/api/activities?today=${iso(0)}`);
    const fileAct = list.activities.find((a) => a.id === fileId), stravaAct = list.activities.find((a) => a.id === strava);
    check(fileAct?.review?.titre === review.titre && fileAct.reviewable === true, "le bilan enregistré est renvoyé avec la sortie");
    check(stravaAct?.reviewable === false, "une sortie Strava est marquée non éligible");

    await page.evaluate(() => window.scrollTo(0, 0));
    await tab(page, "analysis");
    if (await page.locator("[data-tab=runs] >> visible=true").count()) await tab(page, "runs");
    else await page.locator('button:has-text("Séances") >> visible=true').first().click();
    await page.waitForTimeout(1500);
    const box = page.locator(".ai-review").first();
    check(await box.isVisible().catch(() => false), "le bilan IA s'affiche dans la liste des séances");
    const txt = (await box.innerText().catch(() => "")).replace(/\n+/g, " ");
    check(txt.includes(review.titre) && txt.includes("gel"), "le bilan affiche titre, points et conseil", txt.slice(0, 120));
    await box.locator("xpath=ancestor::li[1]").screenshot({ path: `${OUT}/${device}-bilan-ia.png` }).catch(() => {});
    check((await page.locator(".review-ask").count()) === 0, "pas de bouton de bilan quand l'IA n'est pas activée");

    check((await overflow(page)) <= 0, "pas de débordement horizontal");
    check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3));
  }
});
