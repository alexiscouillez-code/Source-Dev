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
  for (const e of document.querySelectorAll(".bnav-label, .bnav-act-txt b, .bnav-act-txt small, .bnav-msg-txt, .ctop-title")) {
    // Bulle (grand écran) : on mesure le texte lui-même, pas la bulle et ses coins arrondis.
    const st = getComputedStyle(e), rg = document.createRange();
    if (e.firstChild) rg.selectNodeContents(e.firstChild.nodeType === 3 ? e : e.firstChild);
    const r = st.position === "absolute" && e.firstChild ? rg.getBoundingClientRect() : e.getBoundingClientRect();
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

  // ---------- Changement d'onglet sans saut ----------
  // Page défilée, on change d'onglet : la vue ne doit pas « voler » de son ancienne place à la nouvelle,
  // et la barre du bas reste en place (pas de fondu avec la page).
  await tab(page, "today"); await page.waitForTimeout(800);
  const top0 = await page.evaluate(() => { window.scrollTo(0, 0); return document.querySelector(".view").getBoundingClientRect().top; });
  await page.evaluate(() => window.scrollTo(0, 500)); await page.waitForTimeout(500);
  const during = page.evaluate(() => new Promise((res) => {
    const look = () => {
      const anims = document.getAnimations().filter((a) => (a.effect?.pseudoElement ?? "").includes("view-transition"));
      if (!anims.length) return void requestAnimationFrame(look);
      res({
        anims: anims.map((a) => ({ pe: a.effect.pseudoElement, tr: a.effect.getKeyframes().map((k) => k.transform ?? "").join(" → ") })),
        dy: getComputedStyle(document.documentElement).getPropertyValue("--vt-dy").trim(),
      });
    };
    requestAnimationFrame(look);
  }));
  await page.click("[data-tab=plan] >> visible=true");
  const vt = await during;
  const group = vt.anims.filter((a) => a.pe === "::view-transition-group(tp-view)");
  check(group.every((a) => !/translate|matrix/.test(a.tr)), "changement d'onglet : la page ne saute pas d'une place à l'autre", vt.anims.map((a) => `${a.pe} ${a.tr.slice(0, 60)}`));
  // Décalage attendu : l'ancienne vue était 500 px plus haut ; la nouvelle (Planning, avec son sélecteur) commence plus bas.
  await page.waitForTimeout(900);
  const top1 = await page.evaluate(() => document.querySelector(".view").getBoundingClientRect().top + window.scrollY);
  check(Math.abs(parseInt(vt.dy) - (top0 - 500 - top1)) < 40, "l'ancienne page reste là où on la voyait (décalage du défilement compensé)", { dy: vt.dy, attendu: top0 - 500 - top1 });
  check(!vt.anims.some((a) => a.pe.includes("tp-bnav")), "la barre du bas reste en place pendant le changement d'onglet", vt.anims.map((a) => a.pe));
  await page.waitForTimeout(900);
  check((await bar(page)).on === "plan", "puis Planning est actif");
  const after = await page.evaluate(() => { const v = document.querySelector(".view"), st = getComputedStyle(v); return { anim: st.animationName, tr: st.transform, f: st.filter }; });
  check(after.anim === "none" && after.tr === "none" && after.f === "none", "l'animation d'entrée ne se rejoue pas après le glissé et ne laisse rien sur la page", after);

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
  check((await page.evaluate(() => location.hash)) === "#today" && (await page.locator(".panel-checkin .ci-card").count()) === 1, "« Check-in du jour » ouvre la fiche du check-in sur Aujourd'hui");
  await page.keyboard.press("Escape"); await page.waitForTimeout(700);

  // ---------- Gestes au doigt (événements tactiles réels via le protocole du navigateur) ----------
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: 1 }] });
  const drag = async (x0, y0, x1, y1, steps = 14, hold = 0) => {
    await touch("touchStart", x0, y0);
    if (hold) await page.waitForTimeout(hold);
    for (let k = 1; k <= steps; k++) { await touch("touchMove", x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps); await page.waitForTimeout(16); }
  };
  const lift = () => touch("touchEnd", 0, 0);
  const hash = () => page.evaluate(() => location.hash);
  const indX = () => page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector(".bnav-ind")).transform).m41);

  // Balayage entre onglets : vers la gauche → section suivante ; le fond actif suit le doigt.
  await tab(page, "today"); await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1600);
  const x0 = await indX();
  await drag(330, 300, 150, 306, 10);
  const xMid = await indX();
  check(xMid > x0 + 10, "balayage : le fond actif de la barre suit le doigt", { x0, xMid });
  await drag(150, 306, 90, 308, 3); await lift(); await page.waitForTimeout(1200);
  check((await hash()) === "#plan" && (await bar(page)).on === "plan", "balayage vers la gauche : Aujourd'hui → Planning", await hash());
  await page.waitForTimeout(900);
  await drag(60, 320, 300, 324, 10); await lift(); await page.waitForTimeout(1200);
  check((await hash()) === "#today", "balayage vers la droite : Planning → Aujourd'hui", await hash());
  await page.waitForTimeout(900);
  await drag(330, 300, 300, 302, 6); await lift(); await page.waitForTimeout(700);
  check((await hash()) === "#today" && !(await page.evaluate(() => document.querySelector(".view").style.transform)), "geste trop court : rien ne change, la page revient en place");
  await drag(120, 260, 140, 520, 12); await lift(); await page.waitForTimeout(700);
  check((await hash()) === "#today", "un défilement vertical ne change pas d'onglet");

  // Tirer pour actualiser (en haut de page) : témoin, seuil, puis message dans la barre.
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  await drag(190, 150, 190, 420, 18);
  const ptr = await page.evaluate(() => ({ cls: document.querySelector(".ptr").className, label: document.querySelector(".ptr-label").textContent }));
  check(/is-on/.test(ptr.cls) && /is-ready/.test(ptr.cls) && /Relâche/.test(ptr.label), "tirer : le témoin descend et annonce le relâché", ptr);
  await lift();
  const busy = await page.waitForFunction(() => document.querySelector(".ptr").classList.contains("is-busy") || document.querySelector(".bnav-msg"), null, { timeout: 3000 }).then(() => true, () => false);
  check(busy, "relâcher : l'actualisation se lance");
  await page.waitForSelector(".bnav-pill.is-msg", { timeout: 8000 }).catch(() => {});
  const msg = await page.evaluate(() => ({ pill: document.querySelector(".bnav-pill").className, text: document.querySelector(".bnav-msg-txt")?.textContent, items: getComputedStyle(document.querySelector(".bnav-bar")).opacity }));
  check(/is-msg/.test(msg.pill) && /à jour/.test(msg.text ?? ""), "île dynamique : le message s'affiche dans la barre", msg);
  await page.screenshot({ path: `${OUT}/bnav-ile.png` });
  await page.locator(".bnav-msg").click(); await page.waitForTimeout(400);
  check((await page.locator(".bnav-msg").count()) === 0, "toucher le message le ferme et la barre revient");

  // Pastilles : nouvelle sortie → nombre sur Analyse ; disparaît après visite. Check-in à faire → point sur Aujourd'hui.
  await api.activity({ date: iso(0), sport: "trail", durationMin: 61, distanceKm: 10.2, gainM: 410, rpe: 4, avgHr: 145 });
  await page.reload(); await page.waitForTimeout(1800);
  await tab(page, "plan"); await page.waitForTimeout(600);
  const bd = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".bnav-item")].map((b) => [b.dataset.tab, b.querySelector(".bnav-badge")?.textContent ?? null])));
  check(bd.analysis === "1", "pastille : 1 nouvelle sortie sur Analyse", bd);
  const ci = (await api.get("/api/me")).checkin;
  check(ci ? bd.today === null : bd.today === "", "pastille : check-in à faire sur Aujourd'hui (s'il n'est pas fait)", { checkin: !!ci, today: bd.today });
  check(/nouvelle sortie/.test(await page.locator(".bnav-item[data-tab=analysis]").innerText()), "la pastille est annoncée aux lecteurs d'écran");
  await page.screenshot({ path: `${OUT}/bnav-pastilles.png` });
  await tab(page, "analysis"); await tab(page, "plan");
  check((await page.locator(".bnav-item[data-tab=analysis] .bnav-badge").count()) === 0, "après la visite d'Analyse, la pastille disparaît");

  // Appui long : raccourcis de Planning ; « Ma course » amène la carte de la course à l'écran.
  await tab(page, "today"); await page.waitForTimeout(800);
  const pb = await page.locator(".bnav-item[data-tab=plan]").boundingBox();
  await touch("touchStart", pb.x + pb.width / 2, pb.y + pb.height / 2); await page.waitForTimeout(700);
  const ctxm = await page.evaluate(() => ({ title: document.querySelector(".bnav-ctx-title")?.textContent, items: [...document.querySelectorAll(".bnav-ctx .bnav-act b")].map((e) => e.textContent) }));
  await lift(); await page.waitForTimeout(300);
  check(ctxm.title === "Planning" && ctxm.items.join() === "Séance du jour,Ma course,Je ne peux pas courir,Mes courses", "appui long sur Planning : ses raccourcis s'ouvrent", ctxm);
  check((await hash()) === "#today" && (await page.locator(".bnav-ctx").count()) === 1, "l'appui long n'ouvre pas la page (le menu reste ouvert)");
  await page.screenshot({ path: `${OUT}/bnav-raccourcis.png` });
  await page.locator(".bnav-ctx .bnav-act", { hasText: "Ma course" }).click();
  const flashed = await page.waitForFunction(() => document.querySelector(".race.is-flash"), null, { timeout: 6000 }).then(() => true, () => false);
  check((await hash()) === "#plan" && flashed, "« Ma course » : Planning s'ouvre sur la carte de la course", await hash());
  // Clic droit (souris) sur Compte : « Apparence » déplie et montre le réglage.
  await page.locator(".bnav-item[data-tab=account]").click({ button: "right" }); await page.waitForTimeout(400);
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowUp");
  check((await page.evaluate(() => document.activeElement?.textContent)).includes("Apparence"), "clic droit : menu au clavier");
  await page.keyboard.press("Enter");
  const ap = await page.waitForFunction(() => document.querySelector("[data-fold=acc-appearance].is-open.is-flash"), null, { timeout: 6000 }).then(() => true, () => false);
  check((await hash()) === "#account" && ap, "« Apparence » : Compte s'ouvre sur le réglage, déplié");

  // Fenêtre du bas : la faire glisser par sa poignée la ferme ; un petit glissé la laisse en place.
  await page.locator(".bnav-plus").click(); await page.waitForTimeout(400);
  await page.locator(".bnav-act", { hasText: "Ajouter une sortie" }).click();
  await page.waitForSelector(".sheet .sheet-grab", { timeout: 5000 }); await page.waitForTimeout(700);
  let gb = await page.locator(".sheet-grab").boundingBox();
  check(gb && gb.height > 20, "fenêtre du bas : une poignée en haut", gb);
  await drag(gb.x + gb.width / 2, gb.y + 12, gb.x + gb.width / 2, gb.y + 52, 6); await lift(); await page.waitForTimeout(600);
  check((await page.locator(".sheet").count()) === 1, "petit glissé : la fenêtre revient en place");
  gb = await page.locator(".sheet-grab").boundingBox();
  await drag(gb.x + gb.width / 2, gb.y + 12, gb.x + gb.width / 2, gb.y + 320, 12);
  const dragSt = await page.evaluate(() => document.querySelector(".sheet")?.style.transform ?? "");
  check(/translateY\(\d{3}/.test(dragSt), "la fenêtre suit le doigt pendant le glissé", dragSt);
  await lift(); await page.waitForTimeout(700);
  check((await page.locator(".sheet").count()) === 0, "glisser la poignée vers le bas ferme la fenêtre");

  // En-tête compact : le titre passe dans une petite barre en haut ; la toucher remonte.
  await tab(page, "plan"); await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 420)); await page.waitForTimeout(600);
  const top = await page.evaluate(() => ({ on: document.querySelector(".ctop").classList.contains("is-on"), title: document.querySelector(".ctop-title").textContent }));
  check(top.on && top.title === "Planning", "en-tête compact : « Planning » apparaît en haut en défilant", top);
  await page.screenshot({ path: `${OUT}/bnav-entete.png` });
  await page.locator(".ctop").click(); await page.waitForTimeout(1200);
  check((await page.evaluate(() => window.scrollY)) < 5 && !(await page.evaluate(() => document.querySelector(".ctop").classList.contains("is-on"))), "toucher l'en-tête compact remonte en haut");

  // ---------- Les cinq apparences : couleurs propres, contraste ----------
  const looks = {}, all = {};
  for (const m of MODES) {
    await setMode(page, m); await page.waitForTimeout(500);
    looks[m[0]] = (await bar(page)).bg;
    // Île dynamique dans chaque apparence (mesurée avec le reste).
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("tp-toast", { detail: "Séance enregistrée." })));
    await page.waitForTimeout(700);
    const isl = await still(page);
    all[`${m[0]}-ile`] = await boxes(page);
    await page.screenshot({ path: `${OUT}/bnav-${m[0]}-ile.png` });
    const h0 = await page.addStyleTag({ content: ".bnav * { color: transparent !important; -webkit-text-fill-color: transparent !important; }" });
    await page.screenshot({ path: `${OUT}/bnav-${m[0]}-ile-fond.png` });
    await h0.evaluate((e) => e.remove()); await isl.evaluate((e) => e.remove());
    await page.locator(".bnav-msg").click({ timeout: 1500 }).catch(() => {});
    await page.waitForSelector(".bnav-msg", { state: "detached", timeout: 6000 }).catch(() => {});
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
  check(Object.entries(all).every(([k, bx]) => bx.length >= (k.endsWith("-ile") ? 2 : 1 + 1 + want.length * 2)), "nom actif et textes du menu mesurés dans chaque apparence", Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.length])));

  // ---------- Grand écran : la même barre flotte à gauche, à la verticale ----------
  await setMode(page, MODES[1]);
  await page.setViewportSize({ width: 1280, height: 860 }); await page.waitForTimeout(900);
  await page.mouse.move(900, 400);
  b = await bar(page);
  check(b.shown && b.pill.left >= 12 && b.pill.left <= 24 && b.pill.height > b.pill.width * 4 && Math.abs((b.pill.top + b.pill.bottom) / 2 - 430) < 4, "grand écran : pilule verticale à gauche, centrée en hauteur", b.pill);
  check(Math.abs(b.ind.top - b.onRect.top) < 2 && Math.abs(b.ind.height - b.onRect.height) < 2 && Math.abs(b.ind.width - b.onRect.width) < 2, "le fond de la section active est sous l'icône", { ind: b.ind, on: b.onRect });
  const lay = await page.evaluate(() => ({ side: document.querySelectorAll(".side").length, main: document.querySelector(".main").getBoundingClientRect().left + parseFloat(getComputedStyle(document.querySelector(".main")).paddingLeft), pill: document.querySelector(".bnav-pill").getBoundingClientRect().right, head: getComputedStyle(document.querySelector(".mobile-top")).display, goal: !!document.querySelector(".top-goal .flap") }));
  check(lay.side === 0 && lay.main > lay.pill + 24 && lay.head === "flex" && lay.goal, "plus de colonne latérale : le contenu commence après la barre, en-tête avec la course visée", lay);
  // Bulle au survol.
  await page.hover(".bnav-item[data-tab=plan]"); await page.waitForTimeout(450);
  const tip = await page.evaluate(() => { const l = document.querySelector(".bnav-item[data-tab=plan] .bnav-label"), r = l.getBoundingClientRect(), i = l.parentElement.getBoundingClientRect(); return { op: +getComputedStyle(l).opacity, left: r.left - i.right, mid: Math.abs((r.top + r.bottom) / 2 - (i.top + i.bottom) / 2), text: l.textContent }; });
  check(tip.op > 0.95 && tip.left > 8 && tip.mid < 2 && tip.text === "Planning", "au survol, le nom de la section apparaît en bulle à droite", tip);
  await page.screenshot({ path: `${OUT}/bnav-desktop.png` });
  // Changement de section : le fond glisse vers le bas.
  await page.click(".bnav-item[data-tab=plan]"); await page.waitForTimeout(1200);
  b = await bar(page);
  check(b.on === "plan" && Math.abs(b.ind.top - b.onRect.top) < 2 && (await page.evaluate(() => location.hash)) === "#plan", "un clic change de section, le fond suit", b.on);
  check(await page.locator(".subnav-plan").isVisible(), "Planning / Mes courses : le sélecteur apparaît en haut de page");
  // Défilement : la barre reste.
  await page.mouse.wheel(0, 1400); await page.waitForTimeout(700);
  check(!(await page.evaluate(() => document.querySelector(".bnav").classList.contains("is-hidden"))), "grand écran : la barre ne se range pas au défilement");
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  // Bouton + : le menu s'ouvre à droite de la barre, en entier à l'écran.
  await page.click(".bnav-plus"); await page.waitForTimeout(700);
  const dm = await page.evaluate(() => { const m = document.querySelector(".bnav-menu:not([hidden])").getBoundingClientRect(), p = document.querySelector(".bnav-pill").getBoundingClientRect(); return { left: m.left - p.right, top: m.top, bottom: m.bottom, vh: innerHeight }; });
  check(dm.left > 8 && dm.top >= 0 && dm.bottom <= dm.vh, "grand écran : le menu + s'ouvre à droite de la barre", dm);
  await page.screenshot({ path: `${OUT}/bnav-desktop-menu.png` });
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  // Clic droit : raccourcis à hauteur de l'icône.
  await page.locator(".bnav-item[data-tab=analysis]").click({ button: "right" }); await page.waitForTimeout(600);
  const dc = await page.evaluate(() => { const m = document.querySelector(".bnav-ctx").getBoundingClientRect(), i = document.querySelector(".bnav-item[data-tab=analysis]").getBoundingClientRect(); return { dx: m.left - i.right, top: m.top, bottom: m.bottom, icon: i.top, vh: innerHeight, n: document.querySelectorAll(".bnav-ctx .bnav-act").length }; });
  check(dc.n >= 3 && dc.dx > 8 && dc.top < dc.icon + 10 && dc.bottom <= dc.vh, "grand écran : les raccourcis s'ouvrent à droite, à hauteur de l'icône", dc);
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  // Recherche depuis la barre.
  await page.click(".bnav-tool"); await page.waitForTimeout(500);
  check(await page.locator(".pal").isVisible(), "le bouton loupe ouvre la recherche rapide");
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  // Contraste des bulles dans chaque apparence.
  for (const m of MODES) {
    await setMode(page, m); await page.waitForTimeout(250);
    await page.hover(".bnav-item[data-tab=terrains]"); await page.waitForTimeout(450);
    const css = await still(page);
    all[`${m[0]}-bureau`] = (await boxes(page)).filter((x) => x.sel === "racine" || x.text === "Terrains");
    await page.screenshot({ path: `${OUT}/bnav-${m[0]}-bureau.png` });
    const hide = await page.addStyleTag({ content: ".bnav * { color: transparent !important; -webkit-text-fill-color: transparent !important; }" });
    await page.screenshot({ path: `${OUT}/bnav-${m[0]}-bureau-fond.png` });
    await hide.evaluate((e) => e.remove()); await css.evaluate((e) => e.remove());
  }
  fs.writeFileSync(`${OUT}/bnav-boxes.json`, JSON.stringify(all));
  check(Object.entries(all).filter(([k]) => k.endsWith("-bureau")).every(([, v]) => v.length === 2), "bulle mesurée dans chaque apparence");
  await page.mouse.move(900, 400);
  check((await overflow(page)) <= 0 && errors.length === 0, "grand écran : pas de débordement, aucune erreur", errors.slice(0, 3));
  await setMode(page, MODES[1]);
  await page.goto(page.url().replace(/#.*$/, "") + "#today"); await page.waitForTimeout(800);
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
