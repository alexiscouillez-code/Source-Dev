// Parcours : choix de l'apparence (Jour, Nuit, Verre, Topo, Frontale) par le bouton et par le réglage du compte,
// mémorisé après rechargement ; chaque changement joue un effet.
const { OUT, iso, check, newUser, openApp, tab, scenario } = require("./lib.cjs");

scenario("Apparence : Jour, Nuit, Verre, Topo et Frontale", async () => {
  for (const device of ["phone", "desktop"]) {
    console.log(`— ${device}`);
    const { page, errors } = await newUser(device, { theme: "light" });
    await openApp(page);
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
    // Apparence affichée (famille de couleurs + apparence) et effet en cours.
    const ap = () => page.evaluate(() => { const h = document.documentElement; return h.dataset.ap || h.dataset.theme; });
    const effect = () => page.evaluate(() => { const h = document.documentElement; return h.dataset.lq ? "liquide" : ["vt-dots", "vt-topo", "vt-beam"].find((c) => h.classList.contains(c)) ?? null; });
    const btn = page.locator(".ap-toggle >> visible=true").first();
    check((await theme()) === "light", "départ en mode Jour");
    check(/Jour.*Nuit/.test(await btn.getAttribute("aria-label")), "le bouton annonce l'apparence actuelle et la suivante", await btn.getAttribute("aria-label"));

    // Cycle : Jour → Nuit (liquide) → Verre (trame de points) → Topo (courbes de niveau) → Frontale (faisceau) → Jour (faisceau).
    const seen = [], fx = [];
    for (let k = 0; k < 5; k++) {
      await btn.click(); await page.waitForTimeout(120);
      fx.push(await effect());
      if (k === 2) check(await page.waitForFunction(() => document.querySelectorAll(".vt-topo-lines path").length === 9, null, { timeout: 800 }).then(() => true, () => false), "vers Topo : les courbes de niveau se dessinent");
      // Image au milieu de l'effet (relue à l'œil).
      if (device === "phone" && (k === 2 || k === 3)) await page.screenshot({ path: `${OUT}/transition-${k === 2 ? "topo" : "frontale"}.png` });
      await page.waitForTimeout(2200); seen.push(await ap());
    }
    check(seen.join(",") === "dark,glass,topo,frontale,light", "le bouton fait le tour Jour → Nuit → Verre → Topo → Frontale → Jour", seen);
    check(fx.join(",") === "liquide,vt-dots,vt-topo,vt-beam,vt-beam", "chaque changement joue un effet (celui de l'apparence d'arrivée, ou de celle qu'on quitte vers Jour)", fx);
    check((await page.locator(".vt-topo-lines").count()) === 0 && !(await effect()), "les effets se referment");

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

    // Topo et Frontale : couleurs propres, gardées après rechargement.
    await tab(page, "account");
    for (const [label, id, fam] of [["Topo", "topo", "light"], ["Frontale", "frontale", "dark"]]) {
      await page.locator(".ap-tile", { hasText: label }).click(); await page.waitForTimeout(1700);
      await page.reload(); await page.waitForTimeout(800);
      const st = await page.evaluate(() => ({ th: document.documentElement.dataset.theme, ap: document.documentElement.dataset.ap, bg: getComputedStyle(document.body).backgroundImage, ink: getComputedStyle(document.documentElement).getPropertyValue("--ink").trim(), text: getComputedStyle(document.body).color }));
      check(st.th === fam && st.ap === id, `${label} gardé après rechargement`, st);
      if (id === "topo") check(/topo\.svg/.test(st.bg), "Topo : fond de courbes de niveau", st.bg);
      else check(/^#000(000)?$/.test(st.ink) && /^rgb\(255, 138, 100\)/.test(st.text), "Frontale : texte rouge ambré sur noir", st);
      await tab(page, "account");
    }

    // Captures du réglage et de l'écran Aujourd'hui dans les cinq apparences (rendu vérifié à l'œil).
    for (const t of ["light", "dark", "glass", "topo", "frontale"]) {
      await page.evaluate((x) => { const h = document.documentElement; h.dataset.theme = { topo: "light", frontale: "dark" }[x] ?? x; if (x === "topo" || x === "frontale") h.dataset.ap = x; else delete h.dataset.ap; window.dispatchEvent(new CustomEvent("tp-theme", { detail: x })); }, t);
      await tab(page, "account");
      const fold = page.locator(".fold", { hasText: "Apparence" });
      await fold.scrollIntoViewIfNeeded(); await page.waitForTimeout(700);
      await fold.screenshot({ path: `${OUT}/apparence-${t}-${device}.png` });
      await tab(page, "today"); await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/aujourdhui-${t}-${device}.png` });
    }
    await page.evaluate(() => { const h = document.documentElement; h.dataset.theme = "glass"; delete h.dataset.ap; window.dispatchEvent(new CustomEvent("tp-theme", { detail: "glass" })); });

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
