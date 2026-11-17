// Parcours : bloc « Ma sortie du jour » (style nuit), avec de vraies données puis sans aucune donnée (exemple),
// à 375 px et 1280 px. Enregistre aussi les positions des textes pour la mesure de contraste (contrast.py).
const fs = require("fs");
const { OUT, iso, check, newUser, openApp, overflow, scenario, db, userId } = require("./lib.cjs");

function encode(points) {
  let out = "", pLat = 0, pLon = 0;
  const enc = (v) => { let s = v < 0 ? ~(v << 1) : v << 1, r = ""; while (s >= 0x20) { r += String.fromCharCode((0x20 | (s & 0x1f)) + 63); s >>= 5; } return r + String.fromCharCode(s + 63); };
  for (const [lat, lon] of points) { const a = Math.round(lat * 1e5), b = Math.round(lon * 1e5); out += enc(a - pLat) + enc(b - pLon); pLat = a; pLon = b; }
  return out;
}
const PROFILE = Array.from({ length: 40 }, (_, i) => Math.round(620 + 380 * Math.sin((i / 39) * Math.PI) + 40 * Math.sin(i / 2)));

async function seedReal(api, email) {
  const uid = await userId(email);
  const analysis = { v: 1, hist: new Array(32).fill(0), win: [], gap: null, dec: null, loss: 1050, moving: 2 * 3600 + 10 * 60, alt: PROFILE };
  const track = encode(Array.from({ length: 30 }, (_, i) => [45.9 + i * 0.002, 6.86 + Math.sin(i / 4) * 0.004]));
  await db().execute({ sql: "INSERT INTO activities(user_id, date, sport, name, duration_min, distance_km, gain_m, source, track, analysis, created_at, updated_at) VALUES (?, ?, 'trail', 'Tour du Prarion', 142, 18.3, 1090, 'fichier', ?, ?, 0, 0)", args: [uid, iso(0), track, JSON.stringify(analysis)] });
  // Trois sorties la semaine dernière (mardi, jeudi, samedi), quel que soit le jour où le test tourne : D+ moyen 800 m.
  const dow = (new Date().getDay() + 6) % 7, lastMonday = -dow - 7;
  for (let i = 0; i < 3; i++) await api.activity({ date: iso(lastMonday + 1 + i * 2), sport: "trail", durationMin: 80, distanceKm: 11, gainM: 700 + i * 100 });
  for (const [d, m] of [[0, 140], [1, 50], [3, 60], [5, 150]]) await db().execute({ sql: "INSERT INTO plan_sessions(user_id, date, template, title, sport, duration_min, rpe_target, description, phase, status, created_at, updated_at) VALUES (?, date(?, 'weekday 1', '-7 days', '+' || ? || ' days'), 'easy', 'Séance', 'course', ?, 4, '', 'Fondation', 'planned', 0, 0)", args: [uid, iso(1), d, m] });
  await db().execute({ sql: "INSERT INTO terrains(user_id, kind, name, lat, lon, data, created_at) VALUES (?, 'start', 'Parking des Houches', 45.89, 6.80, '{}', 0), (?, 'start', 'Col de Voza', 45.86, 6.75, '{}', 0)", args: [uid, uid] });
}

/** Positions des textes du bloc et couleur de leur texte, pour mesurer le contraste sur la capture. */
const textBoxes = (page) => page.evaluate(() => {
  const root = document.querySelector(".night").getBoundingClientRect();
  return [{ sel: "racine", w: root.width, h: root.height }, ...[...document.querySelectorAll(".night .g-top, .night .g-num, .night .g-cap, .night .g-sub, .night .dp-axis span, .night .g-when, .night .night-title, .night .g-example")].filter((e) => e.offsetParent && e.textContent.trim()).map((e) => {
    const r = e.getBoundingClientRect();
    return { sel: e.className.baseVal ?? e.className, text: e.textContent.trim().slice(0, 30), x: r.left - root.left, y: r.top - root.top, w: r.width, h: r.height, color: getComputedStyle(e).color, size: parseFloat(getComputedStyle(e).fontSize), weight: Number(getComputedStyle(e).fontWeight) };
  })];
});

scenario("Bloc « Ma sortie du jour »", async () => {
  const boxes = {};
  for (const [kind, device, width] of [["reel", "phone", 375], ["reel", "desktop", 1280], ["exemple", "phone", 375], ["exemple", "desktop", 1280]]) {
    console.log(`— ${kind}, ${width} px`);
    const { page, errors, api, email, ctx } = await newUser(device);
    if (device === "phone") await page.setViewportSize({ width: 375, height: 812 });
    else await page.setViewportSize({ width: 1280, height: 900 });
    if (kind === "reel") await seedReal(api, email);
    await openApp(page);
    const block = page.locator(".night");
    await block.waitFor({ timeout: 15000 });
    await page.waitForSelector(".night .run-card");
    await block.scrollIntoViewIfNeeded();
    // Motion design : on laisse jouer les animations, puis tout doit être visible et à sa place.
    await page.locator(".night .dotgrid").scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await block.scrollIntoViewIfNeeded();
    await page.waitForTimeout(3200);
    const end = await page.evaluate(() => {
      const op = (s) => [...document.querySelectorAll(s)].map((e) => +getComputedStyle(e).opacity);
      const moved = (s) => [...document.querySelectorAll(s)].filter((e) => { const t = getComputedStyle(e).transform; if (t === "none") return false; const m = new DOMMatrix(t); return Math.abs(m.a - 1) > .01 || Math.abs(m.d - 1) > .01 || Math.abs(m.e) > .5 || Math.abs(m.f) > .5; }).length;
      return { mo: document.documentElement.classList.contains("mo"), dots: Math.min(...op(".night .dp-dot")), last: Math.min(...op(".night .dp-last")), grid: Math.min(...op(".night .dg-on")), cards: Math.min(...op(".night .glass")), moved: moved(".night .dp-dot, .night .dg-on, .night .rd-target, .night .rd-ring, .night .glass:not(button)") };
    });
    check(end.mo, "les animations sont actives (appareil sans réglage « moins de mouvement »)");
    check(end.dots > .15 && end.last > .95 && end.grid > .95 && end.cards > .95 && end.moved === 0, "en fin d'animation, profil, grille, radar et cartes sont visibles et à leur place", end);

    const box = await block.boundingBox();
    const inner = await page.locator(".night-inner").boundingBox();
    check(inner.width <= 381, "le contenu ne dépasse pas 380 px de large", Math.round(inner.width));
    check(Math.abs(inner.x + inner.width / 2 - (box.x + box.width / 2)) < 2, "le contenu est centré dans le bloc");
    const cols = await page.evaluate(() => [".run-card .g-pair", ".g-pair-out"].map((s) => getComputedStyle(document.querySelector(s)).gridTemplateColumns.split(" ").length));
    check(cols.every((c) => c === 2), "les deux paires de cartes restent sur deux colonnes", cols);

    const ex = await page.locator(".night .g-example").count();
    if (kind === "reel") {
      check(ex === 0, "avec de vraies données, aucune mention « Exemple »", ex);
      const t = (await page.locator(".night").innerText()).replace(/\s+/g, " ");
      check(t.includes("Tour du Prarion") && t.includes("18,3") && t.includes("1090"), "nom, distance et D+ réels affichés");
      check(t.includes("7'06"), "allure en mouvement réelle (2 h 10 sur 18,3 km = 7'06)", t.match(/\d+'\d\d/)?.[0]);
      check(t.includes("+290 m"), "D+ comparé à la moyenne de la semaine dernière (800 m)", t.match(/[+−]\d+ m/)?.[0]);
      check(t.includes("Parking des Houches"), "départ de sentier réel : le terrain le plus proche");
      const pct = await page.locator(".week-card .g-num").innerText();
      check(/^\d+/.test(pct), "charge de la semaine en pourcentage", pct);
    } else {
      check(ex >= 3, "sans données, chaque partie d'exemple est signalée", ex);
    }

    // Accessibilité : graphiques nommés, valeurs lues, focus visible.
    const labels = await page.evaluate(() => [...document.querySelectorAll(".night svg[role=img]")].map((s) => s.getAttribute("aria-label")));
    check(labels.length === 3 && labels.every((l) => l && l.length > 20), "les trois graphiques de points ont une description", labels.map((l) => l?.slice(0, 50)));
    check(await page.evaluate(() => document.querySelectorAll(".night .sr-only").length >= 3), "les grands chiffres ont un équivalent pour lecteur d'écran");
    await page.locator(".radar-card").focus();
    await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return { cls: e.className, outline: s.outlineStyle, w: s.outlineWidth }; });
    check(/radar-card/.test(focus.cls) && focus.outline !== "none" && parseFloat(focus.w) >= 2, "focus clavier visible sur la carte radar", focus);
    await page.locator(".night-title").click();

    check((await overflow(page)) <= 0, "pas de débordement horizontal");
    // La barre de navigation fixe recouvrirait le bas du bloc sur la capture : on la masque le temps des captures.
    await page.addStyleTag({ content: "nav, .tabbar { visibility: hidden !important; }" });
    // Captures de l'état final : on retire le déclencheur des animations à l'apparition, sinon les cartes
    // hors de l'écran au moment de la capture resteraient dans leur état de départ (invisibles).
    await page.evaluate(() => document.documentElement.classList.remove("mo"));
    await page.waitForTimeout(300);
    await block.screenshot({ path: `${OUT}/night-${kind}-${width}.png` });
    boxes[`${kind}-${width}`] = await textBoxes(page);
    // Version sans texte, pour mesurer le fond derrière chaque texte.
    await page.addStyleTag({ content: ".night *, .night *::before { color: transparent !important; } .night .g-example { border-color: transparent !important; }" });
    await block.screenshot({ path: `${OUT}/night-${kind}-${width}-fond.png` });

    // Mouvement réduit : aucune animation.
    if (kind === "reel" && device === "phone") {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.reload(); await page.waitForSelector(".night .run-card");
      const anims = await page.evaluate(() => [...document.querySelectorAll(".night *")].filter((e) => getComputedStyle(e).animationName !== "none").length);
      check(anims === 0, "aucune animation quand l'appareil demande moins de mouvement", anims);
    }
    check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3));
    await ctx.close();
  }
  fs.writeFileSync(`${OUT}/night-boxes.json`, JSON.stringify(boxes));
});
