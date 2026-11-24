// Annuler, vibrations, mode automatique, fiches (sortie, course), comparaison, Mes courses et débriefs depuis le
// Planning, bilan du mois, recherche rapide. Contraste des nouveaux écrans dans les cinq apparences.
const fs = require("fs");
const { BASE, OUT, iso, check, newUser, openApp, scenario, db, userId } = require("./lib.cjs");

const MODES = [["light", "light", null], ["dark", "dark", null], ["glass", "glass", null], ["topo", "light", "topo"], ["frontale", "dark", "frontale"]];
const setMode = (page, [id, fam, ap]) => page.evaluate(([id, fam, ap]) => {
  const h = document.documentElement; h.dataset.theme = fam; if (ap) h.dataset.ap = ap; else delete h.dataset.ap;
  window.dispatchEvent(new CustomEvent("tp-theme", { detail: id }));
}, [id, fam, ap]);
const still = (page) => page.addStyleTag({ content: "*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; }" });
/** Textes d'un écran (dans `root`), pour la mesure de contraste. */
const boxes = (page, root) => page.evaluate((root) => {
  const out = [{ sel: "racine", w: innerWidth, h: innerHeight }];
  const scope = document.querySelector(root);
  // Textes passant sous la barre du bas (fixe) : mesurés ailleurs, on les ignore ici.
  const nav = !document.querySelector(".panel") && document.querySelector(".bnav-pill")?.getBoundingClientRect();
  const under = (r) => nav && r.bottom > nav.top - 4;
  for (const e of scope ? scope.querySelectorAll("h1, h2, b, small, .eyebrow, .chip, .duel-k, .duel-v, .rr-meta, .rr-name, .fiche-h, .pal-txt b, .pal-txt small, .pal-g, .rc-sub, .rc-kicker, .cmp-cap span, .btn, .link") : []) {
    const r = e.getBoundingClientRect(), st = getComputedStyle(e);
    if (r.width < 4 || r.height < 4 || +st.opacity < 0.5 || r.top < 0 || r.bottom > innerHeight - 2 || r.left < 0 || r.right > innerWidth) continue;
    if (!e.textContent.trim() || e.closest("svg") || under(r)) continue;
    out.push({ sel: e.className || e.tagName.toLowerCase(), text: e.textContent.trim().slice(0, 30), x: r.left, y: r.top, w: r.width, h: r.height, color: st.color, size: parseFloat(st.fontSize), weight: Number(st.fontWeight) });
  }
  return out;
}, root);
/** Résumé d'analyse d'un fichier de montre : profil d'altitude et temps de passage au kilomètre. */
const analysis = (n, base, pace, wobble) => ({
  v: 1, hist: Array(32).fill(0), win: [], gap: 165, dec: 4.2, moving: n * pace, loss: 900, best: { k1: pace - 30, k5: null, k10: null, vam: 950 },
  km: Array.from({ length: n }, (_, i) => Math.round((i + 1) * pace + Math.sin(i * wobble) * 25 + i * 2)),
  alt: Array.from({ length: 40 }, (_, i) => base + Math.round(320 * Math.sin(i / 6.5))),
});

scenario("Annuler, vibrations, mode automatique, fiches, comparaison, Mes courses, bilan, recherche rapide", async () => {
  const { page, errors, api, email } = await newUser("phone", { theme: "dark", profile: { hrMax: 188, hrRest: 48, daysPerWeek: 5, longDay: 6, maxWeeklyMinutes: 480, level: "confirme" } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { window.__vib = []; navigator.vibrate = (p) => { window.__vib.push(p); return true; }; });
  await api.post("/api/onboarding", {});
  await api.put("/api/goal", { today: iso(0), name: "Ultra des Cimes", date: iso(80), distanceKm: 60, gainM: 3500 });
  const post = (d) => api.post("/api/activities", { today: iso(0), sport: "trail", rpe: 5, avgHr: 148, ...d });
  await post({ date: iso(-10), name: "Trail du Salève", durationMin: 140, distanceKm: 21, gainM: 1100, source: "fichier", analysis: analysis(21, 820, 400, 0.9) });
  await post({ date: iso(-3), name: "Trail du Salève", durationMin: 131, distanceKm: 21.2, gainM: 1120, source: "fichier", analysis: analysis(21, 830, 374, 1.3), avgHr: 145 });
  await post({ date: iso(-1), name: "Footing à supprimer", durationMin: 35, distanceKm: 6, gainM: 40, source: "manual" });
  // Deux courses passées : une course de préparation et l'édition suivante, archivée comme course principale.
  const uid = await userId(email);
  await db().execute({ sql: "INSERT INTO side_races(user_id, name, date, distance_km, gain_m, priority, created_at) VALUES (?, ?, ?, ?, ?, 'B', ?)", args: [uid, "Trail du Salève", iso(-10), 21, 1100, Date.now()] });
  await db().execute({ sql: "INSERT INTO race_archive(user_id, date, name, distance_km, gain_m, archived_at) VALUES (?, ?, ?, ?, ?, ?)", args: [uid, iso(-3), "Trail du Salève 2026", 21, 1100, Date.now()] });

  // ---------- Annuler (île dynamique) ----------
  await page.goto(BASE + "/espace#runs"); await page.waitForTimeout(1500);
  const row = () => page.locator("li.item.run", { hasText: "Footing à supprimer" });
  await row().locator("[aria-label='Supprimer la séance']").click();
  await page.waitForTimeout(500);
  check(await row().count() === 0, "suppression : la séance quitte la liste tout de suite");
  const act = page.locator(".bnav-msg-act");
  check(await act.isVisible() && (await act.textContent()).includes("Annuler"), "l'île affiche « Annuler »");
  check(await page.locator(".bnav-msg-time").count() === 1, "un trait montre le temps laissé pour annuler");
  await act.click(); await page.waitForTimeout(700);
  check(await row().count() === 1, "Annuler : la séance revient");
  await row().locator("[aria-label='Supprimer la séance']").click();
  await page.waitForTimeout(6200);
  const left = (await api.get("/api/activities")).activities.map((a) => a.name);
  check(!left.includes("Footing à supprimer") && left.length === 2, "sans Annuler, la suppression part après 5 s", left);

  // ---------- Fiche de sortie ----------
  await page.locator(".run-open", { hasText: "Trail du Salève" }).first().click();
  await page.waitForSelector(".panel-run .fiche-kpis", { timeout: 5000 });
  await page.waitForTimeout(1600);
  const fiche = await page.evaluate(() => ({
    title: document.querySelector(".panel-title")?.textContent, kpis: document.querySelectorAll(".panel .fk").length,
    dots: document.querySelectorAll(".panel .dotprofile").length, lit: document.querySelectorAll(".panel .dotprofile.is-in").length,
    best: document.querySelectorAll(".fiche-best div").length, back: !!history.state?.tpPanel,
    rect: (() => { const r = document.querySelector(".panel").getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.bottom)]; })(),
  }));
  check(fiche.title === "Trail du Salève" && fiche.kpis >= 5, "fiche : nom et chiffres clés", fiche);
  check(fiche.dots === 2 && fiche.lit === 2, "fiche : profil d'altitude et allure au kilomètre en points, animés", fiche);
  check(fiche.best >= 2 && fiche.back, "fiche : meilleurs passages ; le retour du téléphone la fermera", fiche);
  check(fiche.rect[0] === 0 && fiche.rect[1] === 390 && fiche.rect[2] === 844, "fiche : plein écran au téléphone", fiche.rect);
  await page.screenshot({ path: `${OUT}/extras-fiche.png` });
  // Profil du doigt : l'étiquette donne l'altitude.
  const prof = page.locator(".panel .dotprofile svg").first(), pb = await prof.boundingBox();
  await page.mouse.move(pb.x + pb.width * 0.5, pb.y + pb.height * 0.6); await page.waitForTimeout(250);
  check(/\d+ m/.test(await page.locator(".panel .dp-tip").first().textContent().catch(() => "")), "fiche : le profil se lit du doigt (altitude, kilomètre)");
  // Story
  await page.locator(".panel").getByRole("button", { name: "Partager en story" }).click();
  await page.waitForSelector(".story-prev img", { timeout: 6000 });
  const img = await page.evaluate(() => new Promise((ok) => { const i = document.querySelector(".story-prev img"); if (i.complete) ok([i.naturalWidth, i.naturalHeight]); else i.onload = () => ok([i.naturalWidth, i.naturalHeight]); }));
  check(img[0] === 1080 && img[1] === 1920, "story : image 1080 × 1920 prête à partager", img);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/extras-story.png` });
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  check(await page.locator(".story-prev").count() === 0 && await page.locator(".panel").count() === 1, "Échap ferme l'aperçu, pas la fiche");
  // Retour du téléphone
  await page.goBack(); await page.waitForTimeout(800);
  check(await page.locator(".panel").count() === 0 && page.url().endsWith("#runs"), "le retour du téléphone ferme la fiche et reste sur Séances", page.url());

  // ---------- Comparer deux sorties ----------
  await page.getByRole("button", { name: "Comparer" }).first().click();
  check(await page.locator(".pick-bar").isVisible(), "mode comparer : la barre de sélection apparaît");
  const runs = page.locator(".run-open", { hasText: "Trail du Salève" });
  await runs.nth(0).click(); await page.waitForTimeout(200);
  check((await page.locator(".pick-txt").textContent()).includes("deuxième"), "une première sortie choisie");
  await runs.nth(1).click();
  await page.waitForSelector(".panel-compare .duel-row", { timeout: 6000 });
  await page.waitForTimeout(2000);
  const cmp = await page.evaluate(() => ({
    rows: document.querySelectorAll(".duel-row").length, lines: document.querySelectorAll(".cmp-lines").length, gap: document.querySelectorAll(".cmp-gap span").length,
    facts: [...document.querySelectorAll(".cmp-facts li")].map((l) => l.textContent), tags: [...document.querySelectorAll(".cmp-tag b")].map((b) => b.textContent),
    win: document.querySelectorAll(".duel-v.win").length, pick: !!document.querySelector(".pick-bar"),
  }));
  check(cmp.rows >= 6 && cmp.win >= 1, "comparaison : duel chiffre par chiffre, meilleur côté marqué", cmp);
  check(cmp.lines === 2 && cmp.gap === 21, "comparaison : profils superposés, allures et écart cumulé sur 21 km", cmp);
  check(cmp.facts.some((f) => /plus rapide de/.test(f)), "comparaison : résumé (parcours comparable, plus rapide)", cmp.facts);
  check(!cmp.pick, "la barre de sélection disparaît une fois la comparaison ouverte");
  await page.screenshot({ path: `${OUT}/extras-compare.png` });
  await page.locator(".panel-x").click(); await page.waitForTimeout(700);

  // ---------- Mes courses et débrief ----------
  await page.goto(BASE + "/espace#races"); await page.waitForTimeout(1600);
  const races = await page.evaluate(() => ({ h1: document.querySelector(".view h1")?.textContent, sub: [...document.querySelectorAll(".subnav-plan button")].map((b) => b.textContent),
    rows: [...document.querySelectorAll(".race-row")].map((r) => r.querySelector(".rr-name").textContent), edition: !!document.querySelector(".rr-meta")?.closest("ul") && [...document.querySelectorAll(".rr-meta")].some((m) => /déjà courue/.test(m.textContent)),
    nav: document.querySelector(".bnav-item[aria-current=page]")?.dataset.tab }));
  check(races.h1 === "Mes courses" && races.sub.join() === "Planning,Mes courses" && races.nav === "plan", "Mes courses : sous Planning (sélecteur en haut, barre du bas sur Planning)", races);
  check(races.rows.length === 3 && races.rows[0].includes("Ultra des Cimes"), "à venir puis courues : la course principale et les deux courses passées", races.rows);
  check(races.edition, "la course reconnue d'une année sur l'autre (« déjà courue en … »)");
  await page.screenshot({ path: `${OUT}/extras-races.png` });
  await page.locator(".race-row", { hasText: "Trail du Salève 2026" }).click();
  await page.waitForSelector(".panel-race .race-hero", { timeout: 8000 });
  await page.waitForTimeout(800);
  const rf = await page.evaluate(() => ({ time: document.querySelector(".race-hero b")?.textContent, ed: document.querySelector(".race-edition")?.textContent, form: !!document.querySelector(".panel .db-form") }));
  check(/2 h 1\d/.test(rf.time ?? "") && /Édition/.test(rf.ed ?? "") && rf.form, "fiche course : temps, édition précédente, débrief à remplir", rf);
  await page.locator(".panel .db-tag").first().click();
  await page.locator(".panel .db-form select").selectOption("7");
  await page.locator(".panel .db-form .btn").click(); await page.waitForTimeout(900);
  check((await page.locator(".bnav-msg-txt").textContent().catch(() => "")).includes("Débrief enregistré"), "débrief enregistré depuis la fiche");
  await page.locator(".race-edition").click();
  await page.waitForSelector(".panel-compare .duel-row", { timeout: 6000 });
  check(true, "« Édition 20.. » ouvre la comparaison des deux sorties");
  await page.locator(".panel-x").click(); await page.waitForTimeout(800);
  const after = await page.evaluate(() => [...document.querySelectorAll(".race-row")].map((r) => r.textContent));
  check(after.some((t) => /Trail du Salève 2026/.test(t) && !/Débrief à faire/.test(t)), "Mes courses : le débrief fait n'est plus signalé « à faire »", after);

  // ---------- Planning : jour de course → débrief ; séance faite → Annuler ----------
  await page.goto(BASE + "/espace#plan"); await page.waitForTimeout(1600);
  const sw = page.locator(".view-switch button, .seg button", { hasText: "Calendrier" }).first();
  if (await sw.count()) await sw.click();
  await page.waitForTimeout(800);
  for (let k = 0; k < 2 && !(await page.locator(".cal-day:has(.cal-flag)", { hasText: "" }).count()); k++) { await page.getByRole("button", { name: "Mois précédent" }).click(); await page.waitForTimeout(700); }
  const flagged = page.locator(".cal-day.past:has(.cal-flag)").first();
  check(await flagged.count() === 1, "calendrier : le jour d'une course passée est marqué");
  await flagged.click();
  await page.waitForSelector(".panel-race .race-hero", { timeout: 8000 }).catch(() => {});
  check(await page.locator(".panel-race .race-hero").count() === 1, "toucher le jour de la course ouvre son débrief");
  await page.locator(".panel-x").click(); await page.waitForTimeout(800);
  await page.goto(BASE + "/espace#plan"); await page.waitForTimeout(1600);
  const lsw = page.locator(".view-switch button, .seg button", { hasText: "Liste" }).first();
  if (await lsw.count()) await lsw.click();
  await page.waitForTimeout(600);
  const done = page.locator("li.item [aria-label='Marquer comme faite']").first();
  const sid = await done.evaluate((b) => b.closest("li").dataset.sid);
  await done.click(); await page.waitForTimeout(1600);
  check((await page.locator(".bnav-msg-txt").textContent().catch(() => "")).includes("faite"), "séance marquée faite : message avec Annuler");
  await page.locator(".bnav-msg-act").click(); await page.waitForTimeout(1800);
  check(await page.locator(`li.item[data-sid="${sid}"] [aria-label='Marquer comme faite']`).count() === 1, "Annuler : la séance redevient à faire");

  // ---------- Vibrations ----------
  await page.waitForSelector(".bnav-msg", { state: "detached", timeout: 8000 }).catch(() => {});
  await page.evaluate(() => { window.__vib = []; });
  const planBtn = page.locator(".bnav-item[data-tab=plan]"), bb = await planBtn.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
  await page.waitForTimeout(200);
  check((await page.evaluate(() => window.__vib)).length >= 1, "appui long : petite vibration", await page.evaluate(() => window.__vib));
  await page.keyboard.press("Escape");

  // ---------- Mode automatique ----------
  await page.goto(BASE + "/espace#account"); await page.waitForTimeout(1500);
  await page.emulateMedia({ colorScheme: "light" });
  const autoSw = page.getByRole("switch", { name: "Apparence automatique" });
  await autoSw.scrollIntoViewIfNeeded(); await autoSw.click(); await page.waitForTimeout(2300);
  let st = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, auto: localStorage.getItem("trail-pilot-auto") }));
  check(st.theme === "light" && /"day":"light"/.test(st.auto ?? ""), "mode automatique : téléphone en clair → Jour", st);
  await page.emulateMedia({ colorScheme: "dark" }); await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/extras-vt-horizon.png` });
  await page.waitForTimeout(1700);
  st = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme }));
  check(st.theme === "dark", "le téléphone passe en sombre : bascule en direct vers Nuit (effet d'horizon)", st);
  await page.locator(".auto-row [role=radio]", { hasText: "Frontale" }).click(); await page.waitForTimeout(2300);
  st = await page.evaluate(() => ({ ap: document.documentElement.dataset.ap, auto: JSON.parse(localStorage.getItem("trail-pilot-auto")) }));
  check(st.ap === "frontale" && st.auto?.night === "frontale", "la nuit : Frontale choisie", st);
  await page.screenshot({ path: `${OUT}/extras-auto.png` });
  // Transition des points figée à mi-course (trame en demi-teinte et vague de points couleur d'accent).
  const freeze = await page.addStyleTag({ content: "html.vt-dots::view-transition-new(root), .vt-dots-ring { animation-delay: -.42s !important; animation-play-state: paused !important; }" });
  await page.locator(".ap-tile", { hasText: "Verre" }).click(); await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/extras-vt-dots.png` });
  await freeze.evaluate((e) => e.remove());
  await page.waitForTimeout(1500);
  st = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, auto: localStorage.getItem("trail-pilot-auto"), sw: document.querySelector("[aria-label='Apparence automatique']")?.getAttribute("aria-checked") }));
  check(st.theme === "glass" && st.auto === null && st.sw === "false", "un choix à la main coupe le mode automatique", st);
  // Démarrage : le soleil à la position enregistrée décide avant l'affichage (nuit à l'opposé du soleil).
  const sunLon = ((12 - (new Date().getUTCHours() + new Date().getUTCMinutes() / 60)) * 15 + 540) % 360 - 180;
  const night = ((sunLon + 360) % 360) - 180;
  await page.evaluate(([lon]) => localStorage.setItem("trail-pilot-auto", JSON.stringify({ day: "topo", night: "glass", lat: 0, lon })), [night]);
  await page.reload(); await page.waitForLoadState("domcontentloaded");
  st = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, ap: document.documentElement.dataset.ap ?? null }));
  check(st.theme === "glass", "au démarrage, de nuit à la position enregistrée : Verre posé avant l'affichage", st);
  await page.evaluate(([lon]) => localStorage.setItem("trail-pilot-auto", JSON.stringify({ day: "topo", night: "glass", lat: 0, lon })), [sunLon]);
  await page.reload(); await page.waitForLoadState("domcontentloaded");
  st = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, ap: document.documentElement.dataset.ap ?? null }));
  check(st.theme === "light" && st.ap === "topo", "de jour : Topo", st);
  await page.waitForTimeout(1200);
  await page.evaluate(() => localStorage.removeItem("trail-pilot-auto"));

  // ---------- Vibrations coupées ----------
  const hs = page.getByRole("switch", { name: "Vibrations" });
  await hs.scrollIntoViewIfNeeded(); await hs.click(); await page.waitForTimeout(200);
  await page.waitForSelector(".bnav-msg", { state: "detached", timeout: 8000 }).catch(() => {});
  await page.evaluate(() => { window.__vib = []; });
  const bb2 = await page.locator(".bnav-item[data-tab=plan]").boundingBox();
  await page.mouse.move(bb2.x + bb2.width / 2, bb2.y + bb2.height / 2); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
  check((await page.evaluate(() => window.__vib)).length === 0 && (await page.evaluate(() => localStorage.getItem("tp-haptics"))) === "off", "vibrations coupées dans Compte : plus aucune");
  await page.keyboard.press("Escape");
  check(errors.length === 0, "aucune erreur pendant le parcours téléphone", errors.slice(0, 4));

  // ---------- Contraste des nouveaux écrans, dans les cinq apparences ----------
  const all = {};
  await page.goto(BASE + "/espace#runs"); await page.waitForTimeout(1500);
  for (const m of MODES) {
    await setMode(page, m); await page.waitForTimeout(300);
    for (const [name, open, root] of [
      ["fiche", async () => { await page.locator(".run-open", { hasText: "Trail du Salève" }).first().click(); await page.waitForSelector(".panel-run .fiche-best", { timeout: 6000 }); }, ".panel"],
      ["cmp", async () => { await page.evaluate(() => { const ids = [...document.querySelectorAll("li.item.run")].slice(0, 2).map((l) => Number(l.dataset.vtId.slice(4))); window.dispatchEvent(new CustomEvent("tp-panel", { detail: { panel: { kind: "compare", a: ids[0], b: ids[1] } } })); }); await page.waitForSelector(".panel-compare .duel-row", { timeout: 6000 }); }, ".panel"],
    ]) {
      await open(); await page.waitForTimeout(1600);
      const css = await still(page); await page.waitForTimeout(150);
      all[`${m[0]}-${name}`] = await boxes(page, root);
      await page.screenshot({ path: `${OUT}/extras-${m[0]}-${name}.png` });
      const hide = await page.addStyleTag({ content: ".panel * { color: transparent !important; -webkit-text-fill-color: transparent !important; }" });
      await page.screenshot({ path: `${OUT}/extras-${m[0]}-${name}-fond.png` });
      await hide.evaluate((e) => e.remove()); await css.evaluate((e) => e.remove());
      await page.locator(".panel-x").click(); await page.waitForTimeout(700);
    }
  }
  await page.goto(BASE + "/espace#races"); await page.waitForTimeout(1500);
  for (const m of MODES) {
    await setMode(page, m); await page.waitForTimeout(400);
    const css = await still(page); await page.waitForTimeout(150);
    all[`${m[0]}-courses`] = await boxes(page, ".view");
    await page.screenshot({ path: `${OUT}/extras-${m[0]}-courses.png` });
    const hide = await page.addStyleTag({ content: ".view * { color: transparent !important; -webkit-text-fill-color: transparent !important; }" });
    await page.screenshot({ path: `${OUT}/extras-${m[0]}-courses-fond.png` });
    await hide.evaluate((e) => e.remove()); await css.evaluate((e) => e.remove());
  }
  fs.writeFileSync(`${OUT}/extras-boxes.json`, JSON.stringify(all));
  check(Object.values(all).every((b) => b.length >= 6), "textes mesurés pour le contraste", Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.length])));

  // ---------- Ordinateur : recherche rapide et bilan du mois ----------
  const d = await newUser("desktop", { theme: "dark" });
  await d.api.post("/api/onboarding", {});
  for (let i = 0; i < 8; i++) await d.api.activity({ date: iso(-1 - i * 2), sport: "trail", durationMin: 50 + i * 4, distanceKm: 9 + (i % 3), gainM: 300 + i * 40, rpe: 4, name: `Sortie ${i + 1}` });
  await openApp(d.page); await d.page.waitForTimeout(1200);
  await d.page.keyboard.press("Control+k");
  await d.page.waitForSelector(".pal", { timeout: 3000 });
  await d.page.waitForFunction(() => document.activeElement?.matches(".pal-field input"));
  await d.page.keyboard.type("courses");
  await d.page.waitForTimeout(200);
  const first = await d.page.locator(".pal-item").first().textContent();
  check(/Mes courses/.test(first), "Ctrl+K : « courses » trouve Mes courses en premier", first);
  await d.page.keyboard.press("Enter"); await d.page.waitForTimeout(1200);
  check(d.page.url().endsWith("#races") && (await d.page.locator(".view h1").textContent()) === "Mes courses", "Entrée ouvre la page choisie");
  await d.page.keyboard.press("Control+k"); await d.page.waitForSelector(".pal");
  await d.page.waitForFunction(() => document.activeElement?.matches(".pal-field input"));
  await d.page.keyboard.type("sortie 3"); await d.page.waitForTimeout(300);
  const found = await d.page.evaluate(() => ({ on: document.querySelector(".pal-item.on")?.textContent, all: [...document.querySelectorAll(".pal-item")].slice(0, 5).map((e) => e.textContent), q: document.querySelector(".pal-field input")?.value }));
  check(/Sortie 3/.test(found.on ?? ""), "la recherche trouve aussi les sorties récentes", found);
  await d.page.keyboard.press("ArrowDown"); await d.page.keyboard.press("ArrowUp");
  await d.page.keyboard.press("Enter");
  await d.page.waitForSelector(".panel-run", { timeout: 5000 }).catch(() => {});
  check(await d.page.locator(".panel-run").count() === 1, "… et ouvre sa fiche");
  await d.page.keyboard.press("Escape"); await d.page.waitForTimeout(700);
  check(await d.page.locator(".panel").count() === 0, "Échap ferme la fiche");
  await d.page.keyboard.press("Control+k"); await d.page.waitForSelector(".pal");
  await d.page.waitForFunction(() => document.activeElement?.matches(".pal-field input"));
  await d.page.keyboard.type("bilan"); await d.page.keyboard.press("Enter");
  await d.page.waitForSelector(".panel-recap .rc-slide", { timeout: 6000 });
  await d.page.waitForTimeout(1300);
  const rc = await d.page.evaluate(() => ({ bars: document.querySelectorAll(".rc-bars i").length, kicker: document.querySelector(".rc-kicker")?.textContent, dots: document.querySelectorAll(".rc-month span.on").length }));
  check(rc.bars >= 4 && /Ton mois/.test(rc.kicker ?? "") && rc.dots >= 1, "bilan du mois : écrans façon story, mois en points", rc);
  await d.page.screenshot({ path: `${OUT}/extras-recap-1.png` });
  await d.page.keyboard.press("ArrowRight"); await d.page.waitForTimeout(1500);
  check(/Volume/.test(await d.page.locator(".rc-kicker").textContent()), "flèche droite : écran suivant (volume)");
  await d.page.screenshot({ path: `${OUT}/extras-recap-2.png` });
  for (let k = 0; k < 8; k++) await d.page.keyboard.press("ArrowRight");
  await d.page.waitForTimeout(900);
  const shareRecap = d.page.locator(".panel").getByRole("button", { name: "Partager en story" });
  check(await shareRecap.isVisible(), "dernier écran : partager le bilan en story");
  await shareRecap.click();
  await d.page.waitForSelector(".story-prev img", { timeout: 6000 }).catch(() => {});
  await d.page.waitForTimeout(800);
  await d.page.screenshot({ path: `${OUT}/extras-recap-story.png` });
  check(await d.page.locator(".story-prev img").count() === 1, "image du bilan prête");
  check(d.errors.length === 0, "aucune erreur sur ordinateur", d.errors.slice(0, 4));
});
