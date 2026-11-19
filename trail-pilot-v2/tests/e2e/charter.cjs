// Parcours : charte pointillée du mode Verre sur toutes les pages, couleur de fond au choix et transition en trame de points.
const { OUT, iso, check, newUser, openApp, tab, unfoldAll, scenario } = require("./lib.cjs");

/** Fait défiler l'élément jusqu'à l'écran, laisse jouer son animation d'apparition, puis le capture. */
async function shot(page, sel, name) {
  const el = page.locator(sel).first();
  if (!(await el.count())) return false;
  await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(2600);
  await el.screenshot({ path: `${OUT}/charte-${name}.png` });
  return true;
}
const masked = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const st = getComputedStyle(e); return `${st.mask} ${st.maskImage} ${st.webkitMaskImage ?? ""}`; }).filter((m) => /tp-dots|radial-gradient/.test(m)).length, sel);
const vars = (page) => page.evaluate(() => { const st = getComputedStyle(document.documentElement); return ["--g-0", "--g-2", "--g-acc"].map((k) => st.getPropertyValue(k).trim()); });

scenario("Charte pointillée, couleur de fond et transition du mode Verre", async () => {
  const { page, errors, api } = await newUser("phone", { theme: "glass", profile: { hrMax: 188, hrRest: 48, daysPerWeek: 5, longDay: 6, maxWeeklyMinutes: 480, level: "confirme" } });
  await page.setViewportSize({ width: 390, height: 844 });
  await api.put("/api/goal", { today: iso(0), name: "Trail des Crêtes", date: iso(90), distanceKm: 42, gainM: 2500 });
  for (let i = 0; i < 30; i++) await api.activity({ date: iso(-1 - i * 2), sport: i % 2 ? "course" : "trail", durationMin: 45 + (i % 5) * 15, distanceKm: 8 + (i % 5) * 2, gainM: 200 + i * 15, rpe: 3 + (i % 4), avgHr: 138 + (i % 4) * 6 });
  await openApp(page);

  // Masques partagés présents une seule fois.
  check(await page.evaluate(() => !!document.querySelector("mask#tp-dots") && !!document.querySelector("mask#tp-dots-l")), "masques de trame partagés présents");

  // ---------- Planning : barres de volume, jauges, temps estimé ----------
  await tab(page, "plan"); await unfoldAll(page);
  check(await shot(page, "svg.chart", "planning-volume"), "graphique de volume présent");
  check((await masked(page, "svg.chart .ch-bar")) > 0, "barres du volume en trame de points");
  check((await masked(page, ".gap-bar, .need-bar i")) > 0, "jauges du plan en ligne de points");
  await shot(page, ".race", "planning-course");
  const rt = await page.evaluate(() => { const b = document.querySelector(".race-time b"); const s = getComputedStyle(b); return { w: s.fontWeight, f: s.fontFamily, bg: getComputedStyle(b.parentElement).backgroundColor }; });
  check(rt.w === "500" && !/Mono/.test(rt.f), "temps estimé dessiné comme les chiffres du bloc (poids 500, pas de mono)", rt);

  // Repères du temps de course (formulaire), en mode Verre.
  await page.locator(".race-refine").click();
  await page.waitForSelector(".race-anchor[open]"); await page.waitForTimeout(800);
  await page.locator(".race-anchor").screenshot({ path: `${OUT}/charte-reperes.png` });
  await page.locator(".race-form .link", { hasText: "Annuler" }).click();
  await page.waitForSelector(".race-time");

  // ---------- Analyse : courbes pointillées, aplats en trame ----------
  await tab(page, "analysis"); await unfoldAll(page);
  check((await page.evaluate(() => [...document.querySelectorAll(".gc-plot")].filter((e) => e.style.getPropertyValue("--area").startsWith("polygon(")).length)) >= 1, "aire sous la courbe des cartes découpée selon la courbe");
  const dash = await page.evaluate(() => [...document.querySelectorAll(".chart .ch-line, .gc-line")].map((e) => getComputedStyle(e).strokeDasharray));
  check(dash.length > 0 && dash.every((d) => /^0(px)?,? /.test(d)), "courbes en pointillés ronds", dash.slice(0, 3));
  await shot(page, ".gc-card, .gc-face", "analyse-volume");
  await shot(page, "svg.chart", "analyse-vo2");
  await shot(page, "svg.chart >> nth=1", "analyse-forme");
  await shot(page, ".radar", "analyse-profil");
  await shot(page, ".vo2-races", "analyse-equivalences");
  check((await masked(page, ".chart .ch-bar, .chart .ch-area, .radar .radar-you")) > 0, "aplats et barres des graphiques en trame");
  const tiles = await page.evaluate(() => getComputedStyle(document.querySelector(".vo2-races > div")).backgroundColor);
  check(/rgba\(255, 255, 255/.test(tiles), "tuiles intérieures en verre (plus de cases noires)", tiles);

  // ---------- Interaction : reflet sous le pointeur, éclat de points au toucher ----------
  const card = page.locator(".card").first();
  await card.scrollIntoViewIfNeeded();
  const cb = await card.boundingBox();
  await page.mouse.move(cb.x + cb.width * 0.3, cb.y + 20);
  await page.waitForTimeout(200);
  check(await card.evaluate((e) => e.classList.contains("is-lit") && /px/.test(e.style.getPropertyValue("--mx"))), "la carte sous le pointeur capte la lumière");
  const op = await card.evaluate((e) => getComputedStyle(e, "::after").opacity);
  await page.waitForTimeout(450);
  const lit = await card.evaluate((e) => { const st = getComputedStyle(e, "::after"); return { o: st.opacity, c: st.content, bg: st.backgroundImage.slice(0, 40), cls: e.className }; });
  check(Number(lit.o) > 0.9, "le reflet apparaît", { op, lit });
  const nb = await page.locator(".tabbar [data-tab=analysis]").boundingBox();
  await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2); await page.mouse.down();
  check((await page.locator(".tap-dots i").count()) === 10, "un toucher fait éclater un anneau de points");
  await page.mouse.up();

  // ---------- Couleur de fond ----------
  await tab(page, "account");
  const pick = page.locator(".tint-pick");
  await pick.scrollIntoViewIfNeeded();
  check((await page.locator(".tint-sw").count()) === 7, "sept teintes proposées");
  const before = await vars(page);
  await page.locator(".tint-sw", { hasText: "Forêt" }).click();
  await page.waitForTimeout(1300);
  const after = await vars(page);
  check(after[0] !== before[0] && after[2] !== before[2], "choisir « Forêt » change le fond et les boutons", { before, after });
  check(await page.locator(".tint-sw.on", { hasText: "Forêt" }).count() === 1, "la pastille choisie est marquée");
  await pick.screenshot({ path: `${OUT}/charte-teintes.png` });
  await tab(page, "today"); await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/charte-foret-aujourdhui.png` });
  // Gardée après rechargement, posée avant l'affichage (style de <html> déjà là au premier rendu).
  await page.reload();
  const early = await page.evaluate(() => document.documentElement.style.getPropertyValue("--g-0"));
  const rgb = (h) => /^#/.test(h) ? `rgb(${[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", ")})` : h;
  check(rgb(early) === rgb(after[0]), "teinte gardée et posée dès le chargement", { early, after: after[0] });
  // Teinte libre.
  await tab(page, "account");
  const range = page.locator(".tint-free input[type=range]");
  await range.scrollIntoViewIfNeeded();
  await range.fill("20");
  await page.waitForTimeout(1300);
  const free = await page.evaluate(() => JSON.parse(localStorage.getItem("trail-pilot-glass")));
  check(free.h === 20 && free.k === 1 && /^#[0-9a-f]{6}$/.test(free.p["--g-0"]), "teinte libre enregistrée", free && { h: free.h, k: free.k });
  check((await page.locator(".tint-name").innerText()).includes("20"), "la teinte libre est annoncée", await page.locator(".tint-name").innerText());

  // Depuis une autre apparence, choisir une couleur passe en mode Verre.
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await page.locator(".tint-sw", { hasText: "Indigo" }).click();
  await page.waitForTimeout(1600);
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === "glass", "choisir une couleur en mode Jour passe en mode Verre");

  // ---------- Transition en trame de points (vignettes du réglage d'apparence) ----------
  const tile = (label) => page.locator(".ap-tile", { hasText: label }).first();
  await tile("Jour").scrollIntoViewIfNeeded();
  await tile("Jour").click(); // Verre → Jour : l'effet du mode qu'on quitte
  check(await page.evaluate(() => document.documentElement.classList.contains("vt-dots")), "quitter le mode Verre : transition en trame de points");
  await page.waitForTimeout(1600);
  check(!(await page.evaluate(() => document.documentElement.classList.contains("vt-dots"))), "la transition se referme");
  await tile("Verre").click(); // Jour → Verre : trame de points, puis les cartes se givrent
  const frost = await page.evaluate(() => ["vt-dots", "glass-frost"].every((c) => document.documentElement.classList.contains(c)));
  check(frost, "arrivée en mode Verre : trame de points et cartes qui se givrent");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/charte-transition.png` });
  await page.waitForTimeout(1800);
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === "glass", "mode Verre actif après la transition");
  check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3));
});
