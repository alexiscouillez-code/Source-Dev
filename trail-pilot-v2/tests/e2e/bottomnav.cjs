// Parcours : barre de navigation inférieure flottante (BottomNav) — sections, bouton + et ses actions rapides,
// rangement au défilement, accessibilité, couleurs et contraste dans les cinq apparences.
const fs = require("fs");
const { OUT, iso, check, newUser, openApp, tab, overflow, scenario } = require("./lib.cjs");

const MODES = [["light", "light", null], ["dark", "dark", null], ["glass", "glass", null], ["topo", "light", "topo"], ["frontale", "dark", "frontale"]];
const setMode = (page, [id, fam, ap]) => page.evaluate(([id, fam, ap]) => {
  const h = document.documentElement; h.dataset.theme = fam; if (ap) h.dataset.ap = ap; else delete h.dataset.ap;
  window.dispatchEvent(new CustomEvent("tp-theme", { detail: id }));
}, [id, fam, ap]);
const bar = (page) => page.evaluate(() => {
  const n = document.querySelector(".bnav"), pill = n.querySelector(".bnav-pill").getBoundingClientRect(), ind = n.querySelector(".bnav-ind").getBoundingClientRect();
  const on = n.querySelector(".bnav-item[aria-current=page]"), r = on.getBoundingClientRect(), le = on.querySelector(".bnav-label"), lab = le.getBoundingClientRect();
  return { shown: getComputedStyle(n).display !== "none", pill, ind, on: on.dataset.tab, onRect: r, label: lab.width, clip: le.scrollWidth - le.clientWidth, items: n.querySelectorAll(".bnav-item").length, plus: !!n.querySelector(".bnav-plus"), vw: innerWidth, bg: getComputedStyle(n.querySelector(".bnav-pill")).backgroundImage + " " + getComputedStyle(n.querySelector(".bnav-pill")).backgroundColor };
});
/** Textes de la barre et du menu, pour la mesure de contraste (contrast.py bnav-boxes.json). */
const boxes = (page) => page.evaluate(() => {
  const out = [{ sel: "racine", w: innerWidth, h: innerHeight }];
  for (const e of document.querySelectorAll(".bnav-label, .bnav-act-txt b, .bnav-act-txt small")) {
    const r = e.getBoundingClientRect(), st = getComputedStyle(e);
    if (r.width < 4 || +st.opacity < 0.5) continue;
    out.push({ sel: e.className || e.tagName.toLowerCase(), text: e.textContent.trim().slice(0, 30), x: r.left, y: r.top, w: r.width, h: r.height, color: st.color, size: parseFloat(st.fontSize), weight: Number(st.fontWeight) });
  }
  return out;
});
const still = (page) => page.addStyleTag({ content: "*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; }" });

scenario("Barre de navigation inférieure (BottomNav)", async () => {
  const { page, errors, api } = await newUser("phone", { theme: "dark", profile: { hrMax: 188, hrRest: 48, daysPerWeek: 5, longDay: 6, maxWeeklyMinutes: 480, level: "confirme" } });
  await page.setViewportSize({ width: 375, height: 812 });
  await api.put("/api/goal", { today: iso(0), name: "Trail des Crêtes", date: iso(90), distanceKm: 42, gainM: 2500 });
  for (let i = 0; i < 12; i++) await api.activity({ date: iso(-1 - i * 2), sport: "trail", durationMin: 50 + i * 3, distanceKm: 9 + (i % 4), gainM: 300 + i * 20, rpe: 4, avgHr: 142 });
  await openApp(page);
  await page.waitForTimeout(1200);

  // ---------- Forme et sections ----------
  let b = await bar(page);
  check(b.shown && b.items === 5 && b.plus, "barre visible au téléphone : cinq sections et le bouton +", b);
  check(Math.abs((b.pill.left + b.pill.right) / 2 - b.vw / 2) < 2 && b.pill.left >= 11 && b.pill.bottom <= 812 - 11, "pilule centrée en bas, avec une marge", b.pill);
  check(b.on === "today" && b.label > 30 && b.clip <= 1, "la section active affiche son nom en entier (« Aujourd'hui » à 375 px)", { label: b.label, clip: b.clip });
  check(Math.abs(b.ind.left - b.onRect.left) < 2 && Math.abs(b.ind.width - b.onRect.width) < 2, "le fond actif est sous la section active", { ind: b.ind, on: b.onRect });
  const others = await page.evaluate(() => [...document.querySelectorAll(".bnav-item:not([aria-current]) .bnav-label")].map((e) => e.getBoundingClientRect().width));
  check(others.every((w) => w < 1), "les autres sections n'affichent que leur icône", others);
  check(await page.evaluate(() => [...document.querySelectorAll(".bnav-item")].every((e) => e.textContent.trim().length > 3)), "chaque section garde un nom lisible par les lecteurs d'écran");
  await page.screenshot({ path: `${OUT}/bnav-nuit.png` });

  await tab(page, "plan");
  b = await bar(page);
  check(b.on === "plan" && b.label > 30, "toucher Planning : la section devient active et s'ouvre", b.on);
  check(Math.abs(b.ind.left - b.onRect.left) < 2 && Math.abs(b.ind.width - b.onRect.width) < 2, "le fond actif a glissé jusqu'à Planning");
  // X-Ray et Séances restent rangés sous Analyse.
  await tab(page, "analysis");
  await page.locator(".subnav.seg button", { hasText: "Séances" }).click(); await page.waitForTimeout(700);
  check((await bar(page)).on === "analysis", "Séances garde Analyse active dans la barre");

  // ---------- Rangement au défilement ----------
  await tab(page, "today");
  // Défilement progressif, comme au doigt (un saut d'un coup ne range pas la barre).
  const wheel = async (dy, n) => { for (let k = 0; k < n; k++) { await page.evaluate((d) => window.scrollBy(0, d), dy); await page.waitForTimeout(60); } };
  await page.mouse.move(180, 300); await page.waitForTimeout(900);
  await wheel(90, 8); await page.waitForTimeout(600);
  check(await page.evaluate(() => document.querySelector(".bnav").classList.contains("is-hidden")), "en descendant, la barre se range");
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500);
  await wheel(90, 8); await wheel(-90, 2); await page.waitForTimeout(700);
  check(!(await page.evaluate(() => document.querySelector(".bnav").classList.contains("is-hidden"))), "en remontant, elle revient");
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);

  // ---------- Bouton + : menu d'actions rapides ----------
  const plus = page.locator(".bnav-plus");
  await plus.click(); await page.waitForTimeout(500);
  const menu = await page.evaluate(() => ({ exp: document.querySelector(".bnav-plus").getAttribute("aria-expanded"), items: [...document.querySelectorAll(".bnav-act b")].map((e) => e.textContent), focus: document.activeElement?.textContent, scrim: !!document.querySelector(".bnav-scrim") }));
  const strava = (await api.get("/api/me")).strava;
  const want = ["Ajouter une sortie", "Importer un fichier", "Check-in du jour", ...(strava.connected ? ["Synchro Strava"] : strava.configured ? ["Connecter Strava"] : [])];
  check(menu.exp === "true" && menu.scrim && menu.items.join() === want.join(), "le + ouvre le menu (sortie, fichier, check-in, Strava s'il est configuré), voile derrière", { menu, want });
  check((menu.focus ?? "").includes("Ajouter une sortie"), "le focus va sur la première action", menu.focus);
  await page.keyboard.press("ArrowDown");
  check((await page.evaluate(() => document.activeElement?.textContent)).includes("Importer un fichier"), "flèches : on passe d'une action à l'autre");
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  check(await page.evaluate(() => document.querySelector(".bnav-plus").getAttribute("aria-expanded") === "false" && document.activeElement?.classList.contains("bnav-plus")), "Échap referme le menu et rend le focus au +");
  await plus.click(); await page.waitForTimeout(400);
  await page.mouse.click(40, 200); await page.waitForTimeout(300);
  check((await page.locator(".bnav-menu:not([hidden])").count()) === 0, "un toucher à côté referme le menu");

  // Ajouter une sortie : ouvre Séances avec la saisie.
  await plus.click(); await page.waitForTimeout(400);
  await page.locator(".bnav-act", { hasText: "Ajouter une sortie" }).click();
  await page.waitForTimeout(1500);
  check((await page.evaluate(() => location.hash)) === "#runs" && (await page.locator(".sheet").count()) > 0, "« Ajouter une sortie » ouvre la saisie dans Séances", await page.evaluate(() => location.hash));
  await page.locator(".sheet .link", { hasText: "Fermer" }).click({ timeout: 5000 });
  await page.waitForTimeout(500);

  // Importer un fichier : le sélecteur s'ouvre depuis le toucher, la sortie est préremplie.
  const t0 = Date.parse(`${iso(-1)}T07:00:00Z`);
  const pts = Array.from({ length: 60 }, (_, i) => `<trkpt lat="${(45.9 + i * 0.0009).toFixed(5)}" lon="${(6.86 + i * 0.0004).toFixed(5)}"><ele>${1000 + i * 6}</ele><time>${new Date(t0 + i * 60000).toISOString()}</time></trkpt>`).join("");
  const gpx = `${OUT}/bnav-sortie.gpx`;
  fs.writeFileSync(gpx, `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Montée test</name><trkseg>${pts}</trkseg></trk></gpx>`);
  await plus.click(); await page.waitForTimeout(400);
  const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 5000 }), page.locator(".bnav-act", { hasText: "Importer un fichier" }).click()]);
  await chooser.setFiles(gpx);
  await page.waitForTimeout(1800);
  const sheet = await page.evaluate(() => ({ open: !!document.querySelector(".sheet"), text: document.querySelector(".sheet")?.textContent.slice(0, 200) ?? "" }));
  check(sheet.open && /Montée test|fichier|GPX/i.test(sheet.text), "« Importer un fichier » : la sortie du fichier s'ouvre, préremplie", sheet.text.slice(0, 80));
  await page.locator(".sheet .link", { hasText: "Fermer" }).click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);

  // Check-in du jour : retour sur Aujourd'hui, check-in ouvert.
  await plus.click(); await page.waitForTimeout(400);
  await page.locator(".bnav-act", { hasText: "Check-in du jour" }).click();
  await page.waitForTimeout(1600);
  check((await page.evaluate(() => location.hash)) === "#today" && (await page.locator(".ci-card").count()) === 1, "« Check-in du jour » ouvre le check-in sur Aujourd'hui");

  // ---------- Les cinq apparences : couleurs propres, contraste ----------
  const looks = {}, all = {};
  for (const m of MODES) {
    await setMode(page, m); await page.waitForTimeout(500);
    looks[m[0]] = (await bar(page)).bg;
    await plus.click(); await page.waitForTimeout(700);
    const css = await still(page); await page.waitForTimeout(150);
    await page.screenshot({ path: `${OUT}/bnav-${m[0]}.png` });
    all[m[0]] = await boxes(page);
    const hide = await page.addStyleTag({ content: ".bnav * { color: transparent !important; -webkit-text-fill-color: transparent !important; }" });
    await page.screenshot({ path: `${OUT}/bnav-${m[0]}-fond.png` });
    await hide.evaluate((e) => e.remove()); await css.evaluate((e) => e.remove());
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  }
  fs.writeFileSync(`${OUT}/bnav-boxes.json`, JSON.stringify(all));
  check(new Set(Object.values(looks)).size === 5, "la barre change d'aspect dans chacune des cinq apparences", looks);
  check(Object.values(all).every((bx) => bx.length >= 1 + 1 + want.length * 2), "nom actif et textes du menu mesurés dans chaque apparence", Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.length])));

  // ---------- Grand écran : la barre latérale reste, la barre du bas disparaît ----------
  await setMode(page, MODES[1]);
  await page.setViewportSize({ width: 1280, height: 860 }); await page.waitForTimeout(500);
  check(!(await bar(page)).shown, "grand écran : barre latérale, pas de barre du bas");
  await page.setViewportSize({ width: 320, height: 640 }); await page.waitForTimeout(600);
  b = await bar(page);
  check(b.pill.left >= 8 && b.pill.right <= 312 && (await overflow(page)) <= 0, "petit téléphone (320 px) : la barre tient sans déborder", b.pill);

  // Moins d'animations : la barre reste utilisable.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(400);
  await tab(page, "terrains");
  check((await bar(page)).on === "terrains", "mouvement réduit : la navigation fonctionne");
  check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3));
});
