// Fond d'herbes : présent, animé en continu, réagit au pointeur, suit l'apparence, ne bloque pas la page.
const { chromium } = require("playwright");
const { BASE, OUT, check, scenario } = require("./lib.cjs");

scenario("Fond d'herbes hautes et logo animé", async () => {
  // Navigateur « normal » (navigator.webdriver faux) : le champ tourne comme chez un visiteur.
  const b = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"], ignoreDefaultArgs: ["--enable-automation"] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/insights|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.addInitScript(() => { try { localStorage.setItem("trail-pilot-theme", "dark"); } catch {} });
  await page.goto(BASE + "/connexion");
  await page.waitForSelector(".grass canvas.is-on", { timeout: 45000 });
  check(await page.evaluate(() => !navigator.webdriver), "visite comme un vrai navigateur");
  const cv = page.locator(".grass canvas");
  const box = { x: 0, y: 400, width: 1280, height: 400 };
  const shot = (p) => page.screenshot({ path: p, clip: box });
  await page.waitForTimeout(2500);
  const a = await shot(`${OUT}/grass-a.png`);
  await page.waitForTimeout(900);
  const b2 = await shot(`${OUT}/grass-b.png`);
  check(Buffer.compare(a, b2) !== 0, "le champ bouge tout seul (vent)");
  // Le pointeur écarte les brins.
  for (let i = 0; i <= 12; i++) { await page.mouse.move(400 + i * 40, 640 + Math.sin(i) * 20); await page.waitForTimeout(40); }
  await page.screenshot({ path: `${OUT}/grass-pointer.png` });
  const logo = await page.evaluate(() => { const n = document.querySelector(".logo .cap-needle"); return n ? getComputedStyle(n).animationName : null; });
  check(logo === "cap-seek", "le logo « Le cap » est animé", logo);
  for (const t of ["dark", "light", "glass", "topo", "frontale"]) {
    await page.evaluate((t) => { const h = document.documentElement, f = { topo: "light", frontale: "dark" }[t]; h.dataset.theme = f || t; if (f) h.dataset.ap = t; else delete h.dataset.ap; }, t);
    await page.mouse.move(640, 620);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}/grass-${t}.png` });
  }
  const st = await page.evaluate(() => ({ z: getComputedStyle(document.querySelector(".grass")).zIndex, pe: getComputedStyle(document.querySelector(".grass")).pointerEvents }));
  check(st.z === "-1" && st.pe === "none", "le fond reste derrière le contenu et ne capte pas les clics", st);
  check(errors.length === 0, "aucune erreur", errors.slice(0, 3));
  await b.close();
});
