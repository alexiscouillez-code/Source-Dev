// Parcours : tour de tous les écrans (pages publiques et application) en mode Verre, à 375 px et 1280 px.
// Enregistre une capture par écran, une capture sans texte, et la position de chaque texte visible,
// pour la mesure de contraste sur tout le site (audit-contrast.py).
const fs = require("fs");
const path = require("path");
const { BASE, OUT, iso, check, newUser, openApp, tab, unfoldAll, overflow, scenario } = require("./lib.cjs");

/** Tous les textes visibles à l'écran (éléments qui portent eux-mêmes du texte), avec leur couleur et leur taille. */
const textBoxes = (page) => page.evaluate(() => {
  const out = [{ sel: "racine", w: innerWidth, h: innerHeight }];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walk.nextNode()) {
    const t = walk.currentNode, e = t.parentElement;
    if (!e || seen.has(e) || !t.textContent.trim()) continue;
    seen.add(e);
    const st = getComputedStyle(e);
    if ((e.checkVisibility && !e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) || st.visibility === "hidden" || +st.opacity < 0.05 || e.closest("[aria-hidden=true], .sr-only, svg, .g-meta, .leaflet-container, .gc-back")) continue;
    // Rectangle du texte lui-même (pas de la boîte entière, dont les bordures fausseraient la mesure du fond).
    const range = document.createRange(); range.selectNodeContents(t);
    const r = range.getBoundingClientRect();
    if (r.width < 4 || r.height < 6 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    out.push({ sel: e.className && typeof e.className === "string" ? e.className : e.tagName.toLowerCase(), text: t.textContent.trim().slice(0, 30), x: r.left, y: r.top, w: r.width, h: r.height, color: st.color, size: parseFloat(st.fontSize), weight: Number(st.fontWeight) });
  }
  return out;
});

async function shoot(page, name, boxes) {
  await page.waitForTimeout(1600);
  await page.addStyleTag({ content: "*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; }" });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/tour-${name}.png` });
  boxes[name] = await textBoxes(page);
  const css = await page.addStyleTag({ content: "body * { color: transparent !important; text-shadow: none !important; -webkit-text-fill-color: transparent !important; } input::placeholder, textarea::placeholder { color: transparent !important; }" });
  await page.screenshot({ path: `${OUT}/tour-${name}-fond.png` });
  await css.evaluate((e) => e.remove());
}

scenario("Tour de tous les écrans (mode Verre)", async () => {
  const boxes = {};
  for (const [device, width] of [["phone", 375], ["desktop", 1280]]) {
    console.log(`— ${width} px`);
    // Pages publiques
    const anon = await (await require("playwright").chromium.launch()).newContext({ viewport: { width, height: width === 375 ? 812 : 900 }, deviceScaleFactor: 2 });
    await anon.addInitScript(() => { try { localStorage.setItem("trail-pilot-theme", "glass"); } catch {} });
    const pub = await anon.newPage();
    for (const [name, url] of [["accueil", "/"], ["connexion", "/connexion"]]) {
      await pub.goto(BASE + url);
      check((await pub.evaluate(() => document.documentElement.dataset.theme)) === "glass", `${name} : mode Verre actif`);
      check((await pub.locator(".ap-toggle:visible").count()) >= 1, `${name} : bouton d'apparence présent`);
      await shoot(pub, `${name}-${width}`, boxes);
      check((await overflow(pub)) <= 0, `${name} : pas de débordement horizontal`);
    }
    await anon.close();

    // Application, avec des données
    const { page, errors, api } = await newUser(device, { theme: "glass", profile: { hrMax: 188, hrRest: 48, daysPerWeek: 5, longDay: 6, maxWeeklyMinutes: 480, level: "confirme" } });
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await api.put("/api/goal", { today: iso(0), name: "Trail des Crêtes", date: iso(90), distanceKm: 42, gainM: 2500 });
    for (let i = 0; i < 30; i++) await api.activity({ date: iso(-1 - i * 2), sport: i % 2 ? "course" : "trail", durationMin: 45 + (i % 5) * 15, distanceKm: 8 + (i % 5) * 2, gainM: 200 + i * 15, rpe: 3 + (i % 4), avgHr: 138 + (i % 4) * 6 });
    await openApp(page);
    await shoot(page, `aujourdhui-${width}`, boxes);
    for (const t of ["plan", "terrains", "analysis", "account"]) {
      await tab(page, t);
      await unfoldAll(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shoot(page, `${t}-${width}`, boxes);
      check((await overflow(page)) <= 0, `${t} : pas de débordement horizontal`);
    }
    check(errors.length === 0, "aucune erreur dans l'application", errors.slice(0, 3));
  }
  fs.writeFileSync(path.join(OUT, "tour-boxes.json"), JSON.stringify(boxes));
});
