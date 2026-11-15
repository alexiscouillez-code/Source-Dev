// Parcours : graphiques et animations. Chaque élément animé doit finir entièrement visible et bien placé.
const path = require("path");
const { iso, check, newUser, openApp, tab, unfoldAll, overflow, scenario, db, userId } = require("./lib.cjs");

/** Glisse la souris sur un graphique et renvoie l'état du repère et des courbes. */
async function scrub(page, chart) {
  await chart.scrollIntoViewIfNeeded();
  await page.waitForTimeout(3200);
  const bb = await chart.boundingBox();
  await page.mouse.move(bb.x + bb.width * 0.3, bb.y + bb.height / 2);
  await page.waitForTimeout(250);
  await page.mouse.move(bb.x + bb.width * 0.62, bb.y + bb.height / 2);
  await page.waitForTimeout(350);
  const r = await chart.evaluate((e) => ({ mark: !!e.querySelector(".sc-mark, .wk-tip"), undrawn: [...e.querySelectorAll(".ch-line")].filter((l) => parseFloat(getComputedStyle(l).strokeDashoffset) > 0.01).length }));
  await page.mouse.move(2, 2);
  return r;
}

scenario("Graphiques et animations", async () => {
  for (const device of ["phone", "desktop"]) {
    console.log(`— ${device}`);
    const { page, errors, api, email } = await newUser(device, { profile: { hrMax: 188, hrRest: 48, daysPerWeek: 5, longDay: 6, maxWeeklyMinutes: 480, level: "confirme" } });
    await api.put("/api/goal", { today: iso(0), name: "Trail des Crêtes", date: iso(120), distanceKm: 32, gainM: 1800 });
    for (let i = 0; i < 30; i++) await api.activity({ date: iso(-2 - i * 3), sport: i % 2 ? "course" : "trail", durationMin: 45 + (i % 5) * 15, distanceKm: 8 + (i % 5) * 2, gainM: 200 + i * 10, rpe: 3 + (i % 4), avgHr: 140 + (i % 4) * 6 });
    await api.activity({ date: iso(0), sport: "course", durationMin: 48, distanceKm: 9, rpe: 6, avgHr: 160 });
    // Quelques check-ins passés : la jauge de fraîcheur en a besoin.
    const uid = await userId(email);
    for (let k = 1; k <= 4; k++) await db().execute({ sql: "INSERT OR IGNORE INTO checkins(user_id, date, sleep, legs, motivation, pain, created_at) VALUES (?, ?, 4, 4, 4, 1, 0)", args: [uid, iso(-k)] });
    await openApp(page);

    // Compte à rebours : il défile puis se pose sur le bon nombre de jours.
    await page.waitForTimeout(3000);
    // Le compteur a une boîte de mise en page vide (ses chiffres sont des tuiles) : on lit son texte.
    const flap = await page.evaluate(() => document.querySelector(".flap")?.textContent.replace(/\s/g, "") ?? "");
    check(flap === "J-120", "le compte à rebours se pose sur le bon jour", flap);

    // Analyse : jauge, curseur VO2max, courbes au doigt, barres par mois.
    await tab(page, "analysis");
    await unfoldAll(page);
    // Anneau d'intensité : segments remplis, total au centre.
    await page.locator(".gc-ring").first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(3000);
    const ring = await page.evaluate(() => {
      const m = document.querySelector(".gc-ring-mid"), c = document.querySelector(".gc-ring svg");
      if (!m || !c) return null;
      const a = m.getBoundingClientRect(), b = c.getBoundingClientRect();
      const segs = [...document.querySelectorAll(".gc-seg")].map((s) => parseFloat(getComputedStyle(s).strokeDasharray) - parseFloat(s.getAttribute("stroke-dasharray")));
      return { dy: Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)), dx: Math.abs(a.left + a.width / 2 - (b.left + b.width / 2)), segs };
    });
    check(ring && ring.dy < 1.5 && ring.dx < 1.5, "le total est centré dans l'anneau", ring && `${ring.dx.toFixed(1)} / ${ring.dy.toFixed(1)} px`);
    check(ring && ring.segs.every((d) => Math.abs(d) < 0.5), "les segments de l'anneau finissent remplis", ring?.segs);

    await page.locator(".gc-gauge").first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(3000);
    const needle = await page.evaluate(() => {
      const n = document.querySelector(".gc-needle"); if (!n) return null;
      const want = parseFloat(getComputedStyle(n).getPropertyValue("--a"));
      const m = new DOMMatrix(getComputedStyle(n).transform);
      return { want, got: (Math.atan2(m.b, m.a) * 180) / Math.PI };
    });
    check(needle && Math.abs(needle.want - needle.got) < 1, "l'aiguille de la jauge se pose sur sa valeur", needle);

    await page.locator(".vo2-scale").scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
    const vo2 = await page.evaluate(() => { const b = document.querySelector(".vo2-scale > b"); return b && { want: b.style.left, got: getComputedStyle(b).left, w: b.parentElement.getBoundingClientRect().width, op: +getComputedStyle(b).opacity }; });
    check(vo2 && vo2.op > 0.99 && Math.abs(parseFloat(vo2.got) - (parseFloat(vo2.want) / 100) * vo2.w) < 2, "le curseur VO2max se pose sur la valeur", vo2);

    for (const [label, sel] of [["VO2max", 'svg.chart[aria-label^="Évolution de ta VO2max"]'], ["forme", 'svg.chart[aria-label^="Évolution de la forme"]']]) {
      const c = page.locator(sel);
      if (!(await c.count())) { check(false, `graphique ${label} présent`); continue; }
      const r = await scrub(page, c);
      check(r.mark, `glisser sur la courbe ${label} affiche le repère`);
      check(r.undrawn === 0, `les courbes ${label} restent tracées pendant le glisser`, r.undrawn);
    }

    const bars = page.locator(".month-bars");
    if (await bars.count()) {
      await bars.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);
      const color = () => bars.evaluate((e) => getComputedStyle(e.querySelector("i")).backgroundColor);
      const c0 = await color();
      await page.locator('.progress .seg button:has-text("D+")').click();
      await page.waitForTimeout(1000);
      check((await color()) !== c0, "chaque mesure de la progression a sa couleur");
      check(await bars.evaluate((e) => [...e.querySelectorAll(".mb-v")].every((v) => +getComputedStyle(v).opacity > 0.95)), "les valeurs des barres sont visibles");
    }

    // Planning : tampons « fait », bulle du graphique des semaines.
    await tab(page, "plan");
    await page.waitForSelector(".cal-grid");
    await page.locator(".cal-grid").scrollIntoViewIfNeeded();
    await page.waitForTimeout(2200);
    const stamps = await page.evaluate(() => [...document.querySelectorAll(".cal-grid .ev.st-done > b")].map((b) => +getComputedStyle(b).opacity));
    check(stamps.length > 0 && stamps.every((o) => o > 0.95), "le tampon « fait » est visible sur les séances validées", stamps);

    await page.locator('.view-switch button:has-text("Liste")').click().catch(() => {});
    await page.waitForTimeout(600);
    await unfoldAll(page);
    const weeks = page.locator('svg.chart[aria-label^="Volume prévu"]');
    if (await weeks.count()) {
      await weeks.scrollIntoViewIfNeeded();
      await page.waitForTimeout(3000);
      const bb = await weeks.boundingBox();
      await page.mouse.move(bb.x + bb.width * 0.15, bb.y + bb.height * 0.7);
      await page.waitForTimeout(350);
      const tip = await weeks.evaluate((e) => { const t = e.querySelector(".wk-tip"); if (!t) return null; const r = t.querySelector("rect"); return { text: t.textContent, fill: getComputedStyle(r).fill, h: r.getBoundingClientRect().height }; });
      check(tip && /prévues/.test(tip.text) && tip.h > 10 && tip.fill !== "none", "la bulle du graphique des semaines s'affiche avec son fond", tip);
      await page.mouse.move(2, 2);
    } else check(false, "graphique des semaines présent");

    // Stratégie de course : profil et coureur sur la carte après import du parcours.
    const file = page.locator(".strat input[type=file]");
    if (await file.count()) {
      const runner = page.waitForSelector(".strat .tmap path.tm-tracer", { timeout: 15000, state: "attached" }).then(() => true, () => false);
      await file.setInputFiles(path.join(__dirname, "fixtures/course.gpx"));
      await page.waitForSelector(".strat-table", { timeout: 20000 }).catch(() => {});
      await page.locator("svg.chart.profile").scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(4000);
      const aids = await page.evaluate(() => ({ all: document.querySelectorAll(".profile-aid").length, wait: document.querySelectorAll(".profile-aid.wait").length, clip: !!document.querySelector(".profile-fill.run") }));
      check(aids.all > 0 && aids.wait === 0 && !aids.clip, "le profil de course finit rempli, aucun ravito en attente", aids);
      check(await runner, "le coureur parcourt le tracé sur la carte");
    } else check(false, "champ d'import du parcours présent");

    check((await overflow(page)) <= 0, "pas de débordement horizontal");
    check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3));
  }
});
