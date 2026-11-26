// Carburant : assiette du jour selon la charge, photo d'assiette, récupération après une grosse séance,
// produits de course (code-barres, photo d'étiquette, saisie), prises pendant la sortie et repère pour le plan de course.
// Contraste de la carte et de la fiche des produits dans les cinq apparences.
const fs = require("fs");
const path = require("path");
const { BASE, OUT, iso, check, newUser, openApp, scenario, db, userId } = require("./lib.cjs");

const PHOTO = path.join(__dirname, "fixtures", "plate.jpg");
const MODES = [["light", "light", null], ["dark", "dark", null], ["glass", "glass", null], ["topo", "light", "topo"], ["frontale", "dark", "frontale"]];
const setMode = (page, [id, fam, ap]) => page.evaluate(([id, fam, ap]) => {
  const h = document.documentElement; h.dataset.theme = fam; if (ap) h.dataset.ap = ap; else delete h.dataset.ap;
  window.dispatchEvent(new CustomEvent("tp-theme", { detail: id }));
}, [id, fam, ap]);
const still = (page) => page.addStyleTag({ content: "*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; }" });
const boxes = (page, root) => page.evaluate((root) => {
  const out = [{ sel: "racine", w: innerWidth, h: innerHeight }];
  const scope = document.querySelector(root);
  const nav = !document.querySelector(".panel") && document.querySelector(".bnav-pill")?.getBoundingClientRect();
  for (const e of scope ? scope.querySelectorAll("h2, b, small, p, li span, .eyebrow, .btn, .link, .prod-kind, .prod-carbs, label") : []) {
    const r = e.getBoundingClientRect(), st = getComputedStyle(e);
    if (r.width < 4 || r.height < 4 || +st.opacity < 0.5 || r.top < 0 || r.bottom > innerHeight - 2 || r.left < 0 || r.right > innerWidth) continue;
    if (e.closest("button:disabled")) continue; // commande inactive : pas d’exigence de contraste (WCAG 1.4.3)
    if (!e.textContent.trim() || e.closest("svg") || (nav && r.bottom > nav.top - 4)) continue;
    out.push({ sel: e.className || e.tagName.toLowerCase(), text: e.textContent.trim().slice(0, 30), x: r.left, y: r.top, w: r.width, h: r.height, color: st.color, size: parseFloat(st.fontSize), weight: Number(st.fontWeight) });
  }
  return out;
}, root);

scenario("Carburant : assiette, récupération, produits et prises", async () => {
  const { page, errors, api, email } = await newUser("phone", { theme: "dark", profile: { hrMax: 188, hrRest: 48, daysPerWeek: 5, longDay: 6, maxWeeklyMinutes: 480, level: "confirme" } });
  await page.setViewportSize({ width: 390, height: 844 });
  await api.post("/api/onboarding", {});
  await api.put("/api/goal", { today: iso(0), name: "Ultra des Cimes", date: iso(70), distanceKm: 60, gainM: 3500 });
  for (let i = 1; i <= 24; i++) await api.activity({ date: iso(-i * 2), sport: i % 3 ? "trail" : "course", durationMin: 50 + (i % 4) * 20, distanceKm: 9 + (i % 4) * 3, gainM: 250 + i * 20, rpe: 4 + (i % 3) });
  await api.post("/api/plan", { today: iso(0) });
  // Sortie longue du jour avec une cible d'alimentation, faite (155 min), et une séance de qualité demain.
  const uid = await userId(email);
  await db().execute({ sql: "DELETE FROM plan_sessions WHERE user_id = ? AND date IN (?, ?)", args: [uid, iso(0), iso(1)] });
  const now = Date.now();
  await db().execute({ sql: "INSERT INTO plan_sessions(user_id, date, template, title, sport, duration_min, gain_m, rpe_target, description, phase, status, created_at, updated_at) VALUES (?, ?, 'long', 'Sortie longue', 'trail', 150, 900, 4, ?, 'Développement', 'planned', ?, ?)",
    args: [uid, iso(0), "Endurance en terrain vallonné. Alimentation à entraîner : 50 g de glucides par heure dès la 30e minute, soit environ 100 g (4 gels ou l’équivalent), et 1,4 L d’eau.", now, now] });
  await db().execute({ sql: "INSERT INTO plan_sessions(user_id, date, template, title, sport, duration_min, gain_m, rpe_target, description, phase, status, created_at, updated_at) VALUES (?, ?, 'tempo', 'Tempo', 'course', 55, 0, 6, 'Échauffement puis tempo.', 'Développement', 'planned', ?, ?)", args: [uid, iso(1), now, now] });
  await api.activity({ date: iso(0), sport: "trail", durationMin: 155, distanceKm: 24, gainM: 950, rpe: 6 });

  // ---------- Accueil : carte Carburant du jour ----------
  await openApp(page);
  await page.waitForSelector(".fuel-card", { timeout: 8000 });
  const card = await page.evaluate(() => {
    const c = document.querySelector(".fuel-card");
    return { title: c.querySelector("h2")?.textContent, rec: c.querySelector(".fuel-rec b")?.textContent ?? null, next: c.querySelector(".fuel-rec p")?.textContent ?? null, first: c.querySelector(".plate-legend li b")?.textContent, arcs: c.querySelectorAll(".plate-ring .pl-arc").length };
  });
  check(card.title === "Grosse journée", "sortie longue faite : grosse journée", card.title);
  check(/Récupère : repas complet/.test(card.rec ?? ""), "récupération proposée après 155 min", card.rec);
  check(/demain/.test(card.next ?? ""), "rappel de la séance importante de demain", card.next);
  check(card.first === "50 %" && card.arcs === 3, "assiette : moitié féculents, anneau en trois parts", card);
  await page.locator(".fuel-card").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/fuel-carte.png` });

  // Photo d'assiette : lue (service simulé), comparée à l'assiette du jour, jamais conservée.
  await page.setInputFiles(".fuel-photo input[type=file]", PHOTO);
  await page.waitForSelector(".plate-res", { timeout: 10000 });
  const pr = await page.evaluate(() => ({ cls: document.querySelector(".plate-res").className, text: document.querySelector(".plate-res b").textContent, small: document.querySelector(".plate-res small").textContent }));
  check(/is-add/.test(pr.cls) && /manque des féculents/.test(pr.text), "assiette trop légère en féculents pour une grosse journée", pr);
  check(/salade verte/.test(pr.small) && !/calorie|kcal/i.test(pr.text + pr.small), "aliments reconnus, aucune calorie", pr.small);
  const kept = await db().execute({ sql: "SELECT COUNT(*) AS n FROM app_kv WHERE value LIKE 'data:image%'", args: [] });
  check(Number(kept.rows[0].n) === 0, "la photo n’est enregistrée nulle part");

  // ---------- Mes produits ----------
  await page.locator(".fuel-card .card-head .btn").click();
  await page.waitForSelector(".panel-fuel .prod-manager", { timeout: 6000 });
  await page.locator(".panel-fuel .btn", { hasText: "Ajouter un produit" }).click();
  await page.locator(".panel-fuel .btn", { hasText: "Code-barres" }).click();
  await page.fill(".panel-fuel .prod-code input", "1234567890128");
  await page.locator(".panel-fuel .prod-code .btn").click();
  await page.waitForSelector(".panel-fuel .prod-add .err", { timeout: 6000 });
  check(/absent/.test(await page.locator(".panel-fuel .prod-add .err").textContent()), "code-barres inconnu : message clair");
  await page.fill(".panel-fuel .prod-code input", "3760000000017");
  await page.locator(".panel-fuel .prod-code .btn").click();
  await page.waitForSelector(".panel-fuel .prod-form", { timeout: 6000 });
  const draft = await page.evaluate(() => [...document.querySelectorAll(".panel-fuel .prod-form input, .panel-fuel .prod-form select")].map((i) => i.value));
  check(draft[0] === "Gel énergétique citron" && draft.includes("25") && draft.includes("gel"), "fiche Open Food Facts : nom, type et 25 g par gel", draft);
  await page.locator(".panel-fuel .prod-form .btn", { hasText: "Enregistrer" }).click();
  await page.waitForSelector(".panel-fuel .prod-row", { timeout: 6000 });
  // Photo d'étiquette (pas de lecture de code-barres dans ce navigateur) : lue par le service simulé.
  await page.locator(".panel-fuel .btn", { hasText: "Ajouter un produit" }).click();
  await page.setInputFiles(".panel-fuel .prod-add input[type=file]", PHOTO);
  await page.waitForSelector(".panel-fuel .prod-form", { timeout: 10000 });
  check(/Lu sur la photo/.test(await page.locator(".panel-fuel .prod-form").textContent()), "étiquette lue sur la photo, à vérifier");
  await page.locator(".panel-fuel .prod-form .btn", { hasText: "Enregistrer" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".panel-fuel .prod-row").length === 2, null, { timeout: 6000 });
  await page.locator(".panel-fuel .btn", { hasText: "Ajouter un produit" }).click();
  await page.locator(".panel-fuel .btn", { hasText: "À la main" }).click();
  const inputs = page.locator(".panel-fuel .prod-form input");
  await inputs.nth(0).fill("Compote pomme");
  await page.locator(".panel-fuel .prod-form select").selectOption("compote");
  await inputs.nth(2).fill("22,5");
  await page.locator(".panel-fuel .prod-form .btn", { hasText: "Enregistrer" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".panel-fuel .prod-row").length === 3, null, { timeout: 6000 });
  const names = await page.$$eval(".panel-fuel .prod-row b", (b) => b.map((x) => x.textContent));
  check(names.includes("Barre amande miel") && names.includes("Compote pomme"), "trois produits : code-barres, photo, saisie", names);
  await page.screenshot({ path: `${OUT}/fuel-produits.png` });
  await page.keyboard.press("Escape"); await page.waitForTimeout(700);

  // ---------- Prises pendant la sortie (depuis « Ta journée ») ----------
  await page.locator(".dc-intake").click();
  await page.waitForSelector(".panel-day .intake .stepper", { timeout: 8000 });
  const plus = (name) => page.locator(".panel-day .intake-list li", { hasText: name }).locator("button", { hasText: "+" });
  for (let k = 0; k < 3; k++) await plus("Gel énergétique citron").click();
  await plus("Barre amande miel").click();
  const live = await page.locator(".panel-day .intake-sum").textContent();
  check(/109 g/.test(live) && /52 g\/h/.test(live) && /50 g\/h/.test(live), "total et glucides par heure calculés en direct", live);
  await page.locator(".panel-day .intake .btn", { hasText: "Enregistrer mes prises" }).click();
  await page.waitForFunction(() => /dans la cible/.test(document.querySelector(".panel-day .intake")?.textContent ?? ""), null, { timeout: 6000 });
  const saved = await api.get(`/api/fuel/intake?date=${iso(0)}`);
  check(saved.carbs === 109 && saved.gPerHour === 52 && saved.target === 50 && saved.compare?.verdict === "dans-cible", "prises enregistrées : 109 g, 52 g/h pour 50 visés", saved);
  await page.locator(".panel-day .fuel-feel .db-tag", { hasText: "Passé sans souci" }).click();
  await page.waitForTimeout(1200);
  const sum = await api.get("/api/fuel/summary");
  check(sum.best?.gPerHour === 52 && sum.products.includes("Gel énergétique citron"), "repère pour la course : 52 g/h passés sans souci, avec les produits", sum);
  const log = await db().execute({ sql: "SELECT target FROM fuel_logs WHERE user_id = ? AND date = ?", args: [uid, iso(0)] });
  check(Number(log.rows[0]?.target) === 52, "la progression part de ce qui a vraiment été pris", log.rows[0]);
  await page.screenshot({ path: `${OUT}/fuel-prises.png` });
  await page.keyboard.press("Escape"); await page.waitForTimeout(700);

  // Données du compte : export complet.
  const exp = await api.get("/api/account");
  check(exp.fuelProducts?.length === 3 && exp.fuelIntakes?.length === 1 && exp.fuelLogs?.length === 1, "export du compte : produits, prises et ressentis");

  // ---------- Contraste, cinq apparences ----------
  const all = {};
  for (const m of MODES) {
    await setMode(page, m); await page.waitForTimeout(300);
    await page.locator(".fuel-card").scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    let css = await still(page); await page.waitForTimeout(150);
    all[`${m[0]}-carte`] = await boxes(page, ".fuel-card");
    let hide = await page.addStyleTag({ content: ".fuel-card * { color: transparent !important; -webkit-text-fill-color: transparent !important; }" });
    await page.screenshot({ path: `${OUT}/fuel-${m[0]}-carte-fond.png` });
    await hide.evaluate((e) => e.remove()); await css.evaluate((e) => e.remove());
    await page.locator(".fuel-card .card-head .btn").click();
    await page.waitForSelector(".panel-fuel .prod-row", { timeout: 6000 }); await page.waitForTimeout(900);
    css = await still(page); await page.waitForTimeout(150);
    all[`${m[0]}-produits`] = await boxes(page, ".panel");
    hide = await page.addStyleTag({ content: ".panel * { color: transparent !important; -webkit-text-fill-color: transparent !important; }" });
    await page.screenshot({ path: `${OUT}/fuel-${m[0]}-produits-fond.png` });
    await hide.evaluate((e) => e.remove()); await css.evaluate((e) => e.remove());
    await page.keyboard.press("Escape"); await page.waitForTimeout(700);
  }
  fs.writeFileSync(`${OUT}/fuel-boxes.json`, JSON.stringify(all));
  check(Object.values(all).every((b) => b.length >= 6), "textes mesurés pour le contraste", Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.length])));
  check(errors.length === 0, "aucune erreur", errors.slice(0, 4));
});
