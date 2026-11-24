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
  for (const [kind, device, width, theme = "dark"] of [["reel", "phone", 375], ["reel", "desktop", 1280], ["exemple", "phone", 375], ["exemple", "desktop", 1280], ["reel", "phone", 375, "light"], ["reel", "phone", 375, "glass"]]) {
    console.log(`— ${kind}, ${width} px, ${theme}`);
    const { page, errors, api, email, ctx } = await newUser(device, { theme });
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
    if (width < 900) check(inner.width <= 381, "le contenu ne dépasse pas 380 px de large", Math.round(inner.width));
    else check((await page.evaluate(() => getComputedStyle(document.querySelector(".night-inner")).gridTemplateColumns.split(" ").length)) === 2, "grand écran : la grande carte à gauche, charge et radar à droite");
    // Le bloc suit l'apparence : pas de panneau de nuit à part, cartes au style de l'apparence choisie.
    const look = await page.evaluate(() => { const n = getComputedStyle(document.querySelector(".night")), c = getComputedStyle(document.querySelector(".night .run-card")), ref = document.querySelector(".card"); return { panel: n.backgroundImage, card: c.backgroundColor, blur: c.backdropFilter, ref: ref ? getComputedStyle(ref).backgroundColor : null }; });
    check(look.panel === "none", "le bloc n'a plus de fond de nuit à part", look.panel.slice(0, 60));
    if (theme === "glass") check(/blur/.test(look.blur), "mode Verre : cartes en verre", look);
    else check(look.card === look.ref && !/blur/.test(look.blur), `mode ${theme === "light" ? "Jour" : "Nuit"} : mêmes cartes que le reste du site`, look);
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
    const labels = await page.evaluate(() => [...document.querySelectorAll(".night svg[role=img], .night svg[role=slider]")].map((s) => s.getAttribute("aria-label")));
    check(labels.length === 3 && labels.every((l) => l && l.length > 20), "les trois graphiques de points ont une description", labels.map((l) => l?.slice(0, 50)));
    check(await page.evaluate(() => document.querySelectorAll(".night .sr-only").length + [...document.querySelectorAll(".night .tap")].filter((b) => (b.getAttribute("aria-label") ?? "").length > 20).length >= 3), "les grands chiffres ont un équivalent pour lecteur d'écran");
    await page.locator(".radar-card").focus();
    await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return { cls: e.className, outline: s.outlineStyle, w: s.outlineWidth }; });
    check(/radar-card/.test(focus.cls) && focus.outline !== "none" && parseFloat(focus.w) >= 2, "focus clavier visible sur la carte radar", focus);
    await page.locator(".night-title").click();

    // Interaction : profil parcouru, grille explorée, tuiles retournées, radar qui suit le pointeur.
    if (kind === "reel" && theme === "dark") {
      // Mode Nuit : le bloc d'origine, sans ces interactions.
      const plain = await page.evaluate(() => ({ live: document.querySelectorAll(".night .is-live, .night .tap, .night .rd-dir").length, tiles: document.querySelectorAll(".night .run-card .g-pair .glass-inner").length }));
      check(plain.live === 0 && plain.tiles === 2, "mode Nuit : bloc d'origine, sans les interactions du mode Verre", plain);
      const pb0 = await page.locator(".night .dotprofile svg").boundingBox();
      await page.mouse.move(pb0.x + pb0.width / 2, pb0.y + pb0.height / 2);
      check((await page.locator(".night .dp-tip").count()) === 0, "mode Nuit : pas d'étiquette sur le profil");
      await page.mouse.move(0, 0);
      // Mode Verre : interactions actives.
      await page.evaluate(() => { document.documentElement.dataset.theme = "glass"; window.dispatchEvent(new CustomEvent("tp-theme", { detail: "glass" })); });
      await page.waitForSelector(".night .dotprofile.is-live");
      const prof = page.locator(".night .dotprofile svg");
      await prof.scrollIntoViewIfNeeded();
      const pb = await prof.boundingBox();
      await page.mouse.move(pb.x + pb.width * 0.5, pb.y + pb.height * 0.6);
      const tip = page.locator(".night .dp-tip");
      check(await tip.isVisible() && /\d+ m.*\d+,\d km/.test((await tip.innerText()).replace(/\s+/g, " ")), "profil : le kilomètre et l'altitude s'affichent sous le doigt", await tip.innerText().catch(() => ""));
      check((await page.locator(".night .dp-hi .dp-hi-dot").count()) > 0, "profil : la colonne visée s'allume");
      await page.waitForTimeout(500);
      await page.locator(".night .run-card").screenshot({ path: `${OUT}/night-interaction-profil-${width}.png` });
      await prof.focus(); await page.keyboard.press("Home");
      check(/^0,\d km/.test(await prof.getAttribute("aria-valuetext")), "profil : parcours au clavier (début)", await prof.getAttribute("aria-valuetext"));
      await page.keyboard.press("End");
      check(/18,\d km/.test(await prof.getAttribute("aria-valuetext")), "profil : parcours au clavier (fin)", await prof.getAttribute("aria-valuetext"));
      await page.mouse.move(0, 0);
      const grid = page.locator(".night .dotgrid");
      await grid.scrollIntoViewIfNeeded();
      const gb = await grid.boundingBox();
      await page.mouse.move(gb.x + gb.width * 0.05, gb.y + gb.height * 0.95); // point en bas à gauche : 1 %
      check((await page.locator(".week-card .g-num").innerText()).startsWith("1"), "grille : le pourcentage visé s'affiche", await page.locator(".week-card .g-num").innerText());
      check((await page.locator(".week-card .g-sub").innerText()).includes("de la semaine prévue"), "grille : la durée correspondante s'affiche");
      await page.mouse.move(gb.x + gb.width * 0.55, gb.y + gb.height * 0.35); await page.waitForTimeout(400);
      await page.locator(".night .g-pair-out").screenshot({ path: `${OUT}/night-interaction-grille-${width}.png` });
      // La capture d'élément peut faire défiler la page : on reprend la position de la grille avant de toucher.
      const gb2 = await grid.boundingBox();
      await page.mouse.click(gb2.x + gb2.width * 0.5, gb2.y + gb2.height * 0.5);
      check((await page.locator(".night .dg-wave circle").count()) === 100, "grille : un toucher fait partir une onde de points");
      await page.mouse.move(0, 0);
      const tiles = page.locator(".night .run-card .tap");
      await tiles.nth(1).click();
      check((await tiles.nth(1).getAttribute("aria-pressed")) === "true" && (await tiles.nth(1).innerText()).includes("KM/H"), "tuile allure : se retourne en vitesse", await tiles.nth(1).innerText());
      await tiles.nth(0).click();
      check((await tiles.nth(0).innerText()).includes("D+ / km"), "tuile D+ : se retourne en D+ par km");
      await tiles.nth(0).click(); await tiles.nth(1).click();
      await page.locator(".night .radar-dots").scrollIntoViewIfNeeded();
      const rb = await page.locator(".night .radar-dots").boundingBox();
      await page.mouse.move(rb.x + rb.width * 0.9, rb.y + rb.height * 0.5);
      await page.mouse.move(rb.x + rb.width * 0.8, rb.y + rb.height * 0.3, { steps: 4 });
      const radar = { beam: await page.locator(".night .rd-beam circle").count(), dir: await page.locator(".night .rd-dir").innerText().catch((e) => e.message.slice(0, 80)), rb, vh: page.viewportSize() };
      await page.locator(".night .g-pair-out").screenshot({ path: `${OUT}/night-interaction-radar-${width}.png` });
      check(radar.beam > 0 && /cap /i.test(radar.dir), "radar : le faisceau suit le pointeur et donne le cap", radar);
      await page.mouse.move(0, 0);
      await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; window.dispatchEvent(new CustomEvent("tp-theme", { detail: "dark" })); });
      await page.waitForTimeout(300);
    }

    check((await overflow(page)) <= 0, "pas de débordement horizontal");
    // La barre de navigation fixe recouvrirait le bas du bloc sur la capture : on la masque le temps des captures.
    await page.addStyleTag({ content: "nav, .bnav { visibility: hidden !important; }" });
    // Captures de l'état final : on retire le déclencheur des animations à l'apparition, sinon les cartes
    // hors de l'écran au moment de la capture resteraient dans leur état de départ (invisibles).
    await page.evaluate(() => document.documentElement.classList.remove("mo"));
    await page.waitForTimeout(300);
    await block.screenshot({ path: `${OUT}/night-${kind}-${width}${theme === "dark" ? "" : "-" + theme}.png` });
    boxes[`${kind}-${width}${theme === "dark" ? "" : "-" + theme}`] = await textBoxes(page);
    // Version sans texte, pour mesurer le fond derrière chaque texte.
    await page.addStyleTag({ content: ".night *, .night *::before { color: transparent !important; } .night .g-example { border-color: transparent !important; }" });
    await block.screenshot({ path: `${OUT}/night-${kind}-${width}${theme === "dark" ? "" : "-" + theme}-fond.png` });

    // Mouvement réduit : aucune animation.
    if (kind === "reel" && device === "phone" && theme === "dark") {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.reload(); await page.waitForSelector(".night .run-card");
      const anims = await page.evaluate(() => [...document.querySelectorAll(".night *")].filter((e) => getComputedStyle(e).animationName !== "none").length);
      check(anims === 0, "aucune animation quand l'appareil demande moins de mouvement", anims);
    }
    check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3));
    await ctx.close();
  }
  fs.writeFileSync(`${OUT}/night-boxes.json`, JSON.stringify(boxes));

  // Sortie analysée avant l'ajout du profil d'altitude : le vrai profil est mesuré le long du tracé, jamais inventé.
  for (const withTrack of [true, false]) {
    console.log(`— sortie sans altitude enregistrée, ${withTrack ? "avec" : "sans"} tracé`);
    const { page, errors, email, ctx } = await newUser("phone");
    await page.setViewportSize({ width: 375, height: 812 });
    const uid = await userId(email);
    const analysis = { v: 1, hist: new Array(32).fill(0), win: [], gap: null, dec: null, loss: 500, moving: 97 * 60 };
    const track = withTrack ? encode(Array.from({ length: 30 }, (_, i) => [45.9 + i * 0.002, 6.86 + Math.sin(i / 4) * 0.004])) : null;
    await db().execute({ sql: "INSERT INTO activities(user_id, date, sport, name, duration_min, distance_km, gain_m, source, track, analysis, created_at, updated_at) VALUES (?, ?, 'trail', 'Biot Trail', 100, 12.8, 512, 'fichier', ?, ?, 0, 0)", args: [uid, iso(-2), track, JSON.stringify(analysis)] });
    await openApp(page);
    await page.waitForSelector(".night .run-card");
    const st = await page.evaluate(() => ({
      ex: document.querySelectorAll(".night .run-card .g-example").length,
      prof: document.querySelector(".night .dotprofile svg")?.getAttribute("aria-label") ?? null,
      meta: [...document.querySelectorAll(".night .g-meta")].map((e) => e.textContent.trim()).filter(Boolean),
    }));
    check(st.ex === 0, "aucune mention « exemple » sur la carte de la sortie", st.ex);
    if (withTrack) {
      check(st.prof && /Profil d'altitude sur 12,8 kilomètres/.test(st.prof) && !/exemple/i.test(st.prof), "profil réel mesuré le long du tracé", st.prof);
      const kept = await db().execute({ sql: "SELECT value FROM app_kv WHERE key LIKE ?", args: [`altprof:${uid}:%`] });
      check(kept.rows.length === 1 && JSON.parse(kept.rows[0].value)?.length === 40, "profil gardé (pas de nouvel appel au prochain affichage)");
    } else {
      check(st.prof === null && !st.meta.some((m) => / M$/.test(m)), "sans tracé ni altitude, pas de profil ni d'altitudes affichés", st);
    }
    check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3));
    await ctx.close();
  }
});
