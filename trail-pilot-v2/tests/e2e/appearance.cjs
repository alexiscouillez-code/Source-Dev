// Parcours : choix de l'apparence (Jour, Nuit, Verre) par le bouton et par le réglage du compte, mémorisé après rechargement.
const { OUT, iso, check, newUser, openApp, tab, scenario } = require("./lib.cjs");

scenario("Apparence : Jour, Nuit et Verre", async () => {
  for (const device of ["phone", "desktop"]) {
    console.log(`— ${device}`);
    const { page, errors } = await newUser(device, { theme: "light" });
    await openApp(page);
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
    const btn = page.locator(".ap-toggle >> visible=true").first();
    check((await theme()) === "light", "départ en mode Jour");
    check(/Jour.*Nuit/.test(await btn.getAttribute("aria-label")), "le bouton annonce l'apparence actuelle et la suivante", await btn.getAttribute("aria-label"));

    // Cycle : Jour → Nuit (liquide versé) → Verre (révélation) → Jour.
    const seen = [];
    for (let k = 0; k < 3; k++) { await btn.click(); await page.waitForTimeout(2300); seen.push(await theme()); }
    check(seen.join(",") === "dark,glass,light", "le bouton fait le tour Jour → Nuit → Verre → Jour", seen);

    // Réglage du compte : choix direct, mémorisé.
    await tab(page, "account");
    const tile = page.locator(".ap-tile", { hasText: "Verre" });
    await tile.scrollIntoViewIfNeeded();
    await tile.click();
    await page.waitForTimeout(1300);
    check((await theme()) === "glass", "le choix « Verre » dans Compte s'applique aussitôt");
    check(await page.locator(".ap-tile.ap-glass input").isChecked(), "la vignette Verre est cochée");
    await page.reload();
    await page.waitForTimeout(800);
    check((await theme()) === "glass", "le mode Verre est gardé après rechargement");
    check(await page.evaluate(() => getComputedStyle(document.querySelector(".card")).backdropFilter.includes("blur")), "en mode Verre, les cartes sont en verre dépoli");

    // Captures du réglage et de l'écran Aujourd'hui dans les trois apparences (rendu vérifié à l'œil).
    for (const t of ["light", "dark", "glass"]) {
      await page.evaluate((x) => { document.documentElement.dataset.theme = x; }, t);
      await tab(page, "account");
      const fold = page.locator(".fold", { hasText: "Apparence" });
      await fold.scrollIntoViewIfNeeded(); await page.waitForTimeout(700);
      await fold.screenshot({ path: `${OUT}/apparence-${t}-${device}.png` });
      await tab(page, "today"); await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/aujourdhui-${t}-${device}.png` });
    }
    await page.evaluate(() => { document.documentElement.dataset.theme = "glass"; });

    // Clavier : les flèches changent d'apparence dans le réglage.
    await tab(page, "account");
    await page.locator(".ap-tile.ap-glass input").focus();
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(1300);
    check((await theme()) === "dark", "au clavier, flèche gauche : retour en mode Nuit");

    // Mouvement réduit : changement immédiat, sans transition.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator(".ap-toggle >> visible=true").first().click();
    check((await theme()) === "glass", "avec « moins de mouvement », le changement est immédiat");
    check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3));
  }
});
