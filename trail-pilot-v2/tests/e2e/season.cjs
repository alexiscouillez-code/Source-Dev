// Saison à plusieurs courses principales : ajout, écart trop court (enchaîner ou passer en B), course plus proche qui devient
// la course visée, préparation d'une course suivante (tracé, matériel), passage à la suivante après la course avec
// récupération dans le plan. Contraste de la saison dans les cinq apparences.
const fs = require("fs");
const path = require("path");
const { BASE, OUT, iso, check, newUser, openApp, scenario, db, userId } = require("./lib.cjs");

const MODES = [["light", "light", null], ["dark", "dark", null], ["glass", "glass", null], ["topo", "light", "topo"], ["frontale", "dark", "frontale"]];
const setMode = (page, [id, fam, ap]) => page.evaluate(([id, fam, ap]) => {
  const h = document.documentElement; h.dataset.theme = fam; if (ap) h.dataset.ap = ap; else delete h.dataset.ap;
  window.dispatchEvent(new CustomEvent("tp-theme", { detail: id }));
}, [id, fam, ap]);
const still = (page) => page.addStyleTag({ content: "*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; }" });
const boxes = (page, root) => page.evaluate((root) => {
  const out = [{ sel: "racine", w: innerWidth, h: innerHeight }];
  const nav = !document.querySelector(".panel") && document.querySelector(".bnav-pill")?.getBoundingClientRect();
  for (const scope of document.querySelectorAll(root)) for (const e of scope.querySelectorAll("h2, b, small, p, li, .eyebrow, .btn, .link, .chip, .ss-month, .ss-num")) {
    const r = e.getBoundingClientRect(), st = getComputedStyle(e);
    if (r.width < 4 || r.height < 4 || +st.opacity < 0.5 || r.top < 0 || r.bottom > innerHeight - 2 || r.left < 0 || r.right > innerWidth) continue;
    if (e.closest("button:disabled")) continue;
    if (!e.textContent.trim() || (e.closest("svg") && !e.classList.contains("ss-month") && !e.classList.contains("ss-num")) || (nav && r.bottom > nav.top - 4)) continue;
    out.push({ sel: (e.getAttribute("class") || e.tagName.toLowerCase()), text: e.textContent.trim().slice(0, 30), x: r.left, y: r.top, w: r.width, h: r.height, color: e.closest("svg") ? st.fill : st.color, size: parseFloat(st.fontSize), weight: Number(st.fontWeight) });
  }
  return out;
}, root);

scenario("Saison : plusieurs courses principales", async () => {
  const { page, errors, api, email } = await newUser("phone", { theme: "dark", profile: { hrMax: 188, hrRest: 48, daysPerWeek: 5, longDay: 6, maxWeeklyMinutes: 480, level: "confirme" } });
  await page.setViewportSize({ width: 390, height: 844 });
  await api.post("/api/onboarding", {});
  for (let i = 1; i <= 24; i++) await api.activity({ date: iso(-i * 2), sport: i % 3 ? "trail" : "course", durationMin: 50 + (i % 4) * 20, distanceKm: 9 + (i % 4) * 3, gainM: 250 + i * 20, rpe: 4 + (i % 3) });
  await api.put("/api/goal", { today: iso(0), name: "Ultra des Cimes", date: iso(50), distanceKm: 50, gainM: 2500 });
  const uid = await userId(email);

  // ---------- Ajouter une deuxième course principale, 5 semaines après ----------
  await openApp(page);
  await page.goto(BASE + "/espace#races"); await page.waitForTimeout(1500);
  await page.locator(".view .head .btn", { hasText: "Ajouter" }).click();
  await page.waitForSelector(".panel .picks.p3", { timeout: 6000 });
  check(await page.locator(".panel .picks.p3 label.on").textContent() === "Principale", "ajout : « Principale » proposée d’office");
  const f = page.locator(".panel form .field input");
  await f.nth(0).fill("Trail d’automne");
  await f.nth(1).fill(iso(85));
  await f.nth(2).fill("30"); await f.nth(3).fill("1600");
  await page.locator(".panel form .btn", { hasText: "Ajouter à ma saison" }).click();
  await page.waitForSelector(".season-card .ss-main", { timeout: 8000 });
  await page.waitForTimeout(800);
  const s1 = await page.evaluate(() => ({ mains: document.querySelectorAll(".season-card .ss-main").length, warn: document.querySelector(".warn-gap p")?.textContent ?? null, names: [...document.querySelectorAll(".season-names li")].map((l) => l.textContent), card: document.querySelector(".next-race h2")?.textContent }));
  check(s1.mains === 2 && s1.names[0].includes("Ultra des Cimes") && /le plan la vise/.test(s1.names[0]), "frise : deux courses principales, le plan vise la plus proche", s1.names);
  check(/5 semaines après Ultra des Cimes/.test(s1.warn ?? "") && /8 semaines/.test(s1.warn ?? ""), "écart trop court signalé (5 semaines au lieu de 8 après un ultra)", s1.warn);
  check(s1.card === "Trail d’automne", "préparation de la course suivante affichée", s1.card);
  await page.screenshot({ path: `${OUT}/season-frise.png` });
  await page.locator(".warn-gap .btn", { hasText: "Enchaîner" }).click();
  await page.waitForFunction(() => !document.querySelector(".warn-gap"), null, { timeout: 6000 });
  const ch = await db().execute({ sql: "SELECT chained FROM next_goals WHERE user_id = ?", args: [uid] });
  check(Number(ch.rows[0]?.chained) === 1, "enchaînement accepté : l’alerte disparaît");

  // ---------- Une course plus proche devient la course visée ----------
  const add = await (await api.post("/api/season", { today: iso(0), name: "Trail de printemps", date: iso(20), distanceKm: 21, gainM: 900 })).json();
  check(add.active === true, "course plus proche : elle devient la course visée");
  const pv = await api.get(`/api/plan?today=${iso(0)}`);
  check(pv.goal?.name === "Trail de printemps" && pv.nextMains?.map((n) => n.name).join() === "Ultra des Cimes,Trail d’automne", "le planning vise le printemps, puis l’ultra et l’automne", { goal: pv.goal?.name, next: pv.nextMains });
  const race = await db().execute({ sql: "SELECT date FROM plan_sessions WHERE user_id = ? AND template = 'race' ORDER BY date", args: [uid] });
  check(race.rows.some((r) => r.date === iso(20)), "la course du printemps est au planning");

  // ---------- Préparer une course suivante : tracé et matériel ----------
  await page.goto(BASE + "/espace#races"); await page.reload(); await page.waitForSelector(".next-race", { timeout: 8000 }); await page.waitForTimeout(800);
  await page.locator(".races-list .race-row", { hasText: "Ultra des Cimes" }).click();
  await page.waitForTimeout(600);
  check(await page.locator(".next-race h2").textContent() === "Ultra des Cimes", "toucher une course suivante ouvre sa préparation");
  await page.locator(".next-race [data-fold=plan-strat] .fold-btn").click();
  await page.waitForSelector(".panel [data-fold-fiche=plan-strat]", { timeout: 6000 });
  await page.locator(".panel .strat input[type=file]").setInputFiles(path.join(__dirname, "fixtures/course.gpx"));
  await page.waitForSelector(".panel .strat-table", { timeout: 20000 });
  check(true, "tracé importé pour une course suivante : stratégie par section");
  await page.keyboard.press("Escape"); await page.waitForTimeout(700);
  const nextId = Number((await db().execute({ sql: "SELECT id FROM next_goals WHERE user_id = ? AND name = 'Ultra des Cimes'", args: [uid] })).rows[0].id);
  await api.put(`/api/goal/gear?race=${nextId}`, { items: [{ label: "Lampe frontale", checked: false }, { label: "Veste imperméable", checked: false }] });
  const det = await api.get(`/api/season/race?id=${nextId}`);
  check(det.route?.points?.length > 10 && det.gear.length === 2, "tracé et matériel gardés avec la course suivante", { pts: det.route?.points?.length, gear: det.gear.length });
  const goalRoute = await db().execute({ sql: "SELECT route FROM goals WHERE user_id = ?", args: [uid] });
  check(!goalRoute.rows[0].route, "la course visée n’a pas reçu ce tracé");

  // ---------- Passer une course principale en objectif secondaire ----------
  const autumn = (await api.get(`/api/season?today=${iso(0)}`)).races.find((r) => r.name === "Trail d’automne");
  await api.post("/api/season", { action: "toB", key: autumn.key, today: iso(0) });
  const side = await db().execute({ sql: "SELECT priority FROM side_races WHERE user_id = ? AND name = 'Trail d’automne'", args: [uid] });
  check(side.rows[0]?.priority === "B", "course passée en objectif secondaire");

  // ---------- Après la course : la suivante prend le relais, avec récupération ----------
  await db().execute({ sql: "UPDATE goals SET date = ? WHERE user_id = ?", args: [iso(-1), uid] });
  await api.activity({ date: iso(-1), sport: "trail", durationMin: 150, distanceKm: 21, gainM: 900, rpe: 8 });
  const after = await api.get(`/api/season?today=${iso(0)}`);
  check(after.races[0]?.name === "Ultra des Cimes" && after.races[0]?.active && after.last?.name === "Trail de printemps", "le lendemain de la course, l’ultra devient la course visée", { races: after.races.map((r) => r.name), last: after.last });
  const arch = await db().execute({ sql: "SELECT name FROM race_archive WHERE user_id = ?", args: [uid] });
  check(arch.rows.some((r) => r.name === "Trail de printemps"), "la course courue rejoint « Courues » (débrief)");
  const goalNow = await db().execute({ sql: "SELECT name, route, gear FROM goals WHERE user_id = ?", args: [uid] });
  check(goalNow.rows[0].name === "Ultra des Cimes" && !!goalNow.rows[0].route && /Lampe frontale/.test(String(goalNow.rows[0].gear)), "l’ultra arrive avec son tracé et son matériel");
  const sess = await db().execute({ sql: "SELECT date, template, duration_min FROM plan_sessions WHERE user_id = ? AND date > ? AND date <= ? AND status = 'planned' ORDER BY date", args: [uid, iso(0), iso(6)] }); // 21 km et 900 m D+ : une semaine de récupération
  const hard = sess.rows.filter((r) => !["easy", "strength", "race"].includes(String(r.template)));
  check(sess.rows.length > 0 && hard.length === 0 && !sess.rows.some((r) => r.date <= iso(1) && r.template !== "strength"), "récupération d’une semaine : repos puis footings faciles, aucune séance dure", sess.rows.map((r) => `${r.date}:${r.template}:${r.duration_min}`));
  const pv2 = await api.get(`/api/plan?today=${iso(0)}`);
  check((pv2.plan?.notes ?? []).some((n) => /Récupération après Trail de printemps/.test(n)), "le plan explique la récupération", pv2.plan?.notes?.slice(0, 2));

  // ---------- Contraste ----------
  // Une course suivante pour afficher sa préparation, et un écart court pour l'alerte.
  await api.post("/api/season", { today: iso(0), name: "Ultra d’été", date: iso(80), distanceKm: 70, gainM: 4000 });
  await page.reload(); await page.waitForSelector(".season-card .warn-gap", { timeout: 8000 });
  const all = {};
  for (const m of MODES) {
    await setMode(page, m); await page.waitForTimeout(300);
    for (const [name, sel] of [["saison", ".season-card"], ["suivante", ".next-race"]]) {
      await page.locator(sel).first().scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
      const css = await still(page); await page.waitForTimeout(150);
      all[`${m[0]}-${name}`] = await boxes(page, sel);
      const hide = await page.addStyleTag({ content: `${sel} * { color: transparent !important; -webkit-text-fill-color: transparent !important; } ${sel} :is(.ss-month, .ss-num) { fill: transparent !important; }` });
      await page.screenshot({ path: `${OUT}/season-${m[0]}-${name}-fond.png` });
      await hide.evaluate((e) => e.remove()); await css.evaluate((e) => e.remove());
    }
  }
  fs.writeFileSync(`${OUT}/season-boxes.json`, JSON.stringify(all));
  check(Object.values(all).every((b) => b.length >= 5), "textes mesurés pour le contraste", Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.length])));
  await page.screenshot({ path: `${OUT}/season-fin.png` });
  check(errors.length === 0, "aucune erreur", errors.slice(0, 4));
});
