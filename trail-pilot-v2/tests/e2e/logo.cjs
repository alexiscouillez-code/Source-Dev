// Logo « Le cap » animé partout, et plus de fond animé derrière les pages (retiré à la demande).
const { chromium } = require("playwright");
const { BASE, OUT, check, scenario } = require("./lib.cjs");

scenario("Logo animé, pas de fond animé", async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/insights|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  for (const path of ["/", "/connexion"]) {
    await page.goto(BASE + path);
    await page.waitForTimeout(2500);
    const s = await page.evaluate(() => ({
      logo: (() => { const n = document.querySelector(".logo .cap-needle"); return n ? getComputedStyle(n).animationName : null; })(),
      grass: !!document.querySelector(".grass"),
      webgl: [...document.querySelectorAll("canvas")].length,
    }));
    check(s.logo === "cap-seek", `${path} : le logo « Le cap » est animé`, s.logo);
    check(!s.grass && s.webgl === 0, `${path} : pas de fond animé derrière la page`, s);
    await page.screenshot({ path: `${OUT}/logo${path.replace(/\W/g, "-")}.png` });
  }
  check(errors.length === 0, "aucune erreur", errors.slice(0, 3));
  await b.close();
});
