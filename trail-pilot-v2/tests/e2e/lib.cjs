// Outils communs des parcours navigateur : compte de test, collecte des erreurs, vérifications.
const { chromium, devices } = require("playwright");

const BASE = process.env.E2E_BASE || "http://localhost:3100";
const OUT = process.env.E2E_OUT || __dirname + "/.tmp";
const p2 = (n) => String(n).padStart(2, "0");
/** Date locale décalée de n jours, au format AAAA-MM-JJ. */
const iso = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };

const DEVICES = { phone: devices["iPhone 13"], desktop: { viewport: { width: 1366, height: 900 } } };

/** Base de données du serveur de test (fournie par run.mjs), pour préparer des cas que l'interface ne permet pas. */
let dbClient;
function db() {
  if (!process.env.E2E_DB) throw new Error("E2E_DB absent : lance les parcours avec npm run test:e2e");
  if (!dbClient) {
    const c = require("@libsql/client").createClient({ url: process.env.E2E_DB });
    // Le serveur écrit dans la même base : on patiente puis on réessaie au lieu d'échouer sur un verrou.
    const ready = c.execute("PRAGMA busy_timeout = 5000").catch(() => {});
    dbClient = {
      async execute(q) {
        await ready;
        for (let k = 0; ; k++) {
          try { return await c.execute(q); }
          catch (e) { if (k >= 8 || !/SQLITE_BUSY|locked/.test(e.message)) throw e; await new Promise((r) => setTimeout(r, 250 * (k + 1))); }
        }
      },
    };
  }
  return dbClient;
}
const userId = async (email) => (await db().execute({ sql: "SELECT id FROM app_users WHERE email = ?", args: [email] })).rows[0].id;

const failures = [];
/** Vérification : enregistre l'échec avec son message, sans arrêter le parcours. */
function check(cond, msg, detail) {
  if (cond) { console.log("  ✓", msg); return true; }
  failures.push(detail !== undefined ? `${msg} (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : msg);
  console.log("  ✗", msg, detail !== undefined ? "→ " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : "");
  return false;
}

let browser;
async function launch() { browser ??= await chromium.launch(); return browser; }

/**
 * Crée un compte neuf et une page connectée. La synchro Strava est simulée (aucun appel réel),
 * la visite guidée est passée, et toute erreur de page ou réponse 5xx est collectée.
 */
async function newUser(device = "phone", { theme = "dark", profile } = {}) {
  const b = await launch();
  const ctx = await b.newContext({ ...DEVICES[device] });
  await ctx.addInitScript((t) => { try { localStorage.setItem("tp-tour-v1", "1"); localStorage.setItem("trail-pilot-theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/insights|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  page.on("response", (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url().replace(BASE, "")}`); });
  await page.route("**/api/strava/sync**", (r) => r.fulfill({ json: { imported: 0, added: 0, analyzed: 0, skipped: true } }));
  const email = `e2e${Date.now()}${Math.floor(Math.random() * 1e4)}@example.test`;
  const res = await page.request.post(BASE + "/api/auth/signup", { data: { name: "Camille", email, password: "motdepasse-test-123" } });
  if (!res.ok()) throw new Error(`Inscription impossible : ${res.status()}`);
  if (profile) await page.request.put(BASE + "/api/profile", { data: profile });
  const api = {
    get: async (path) => (await page.request.get(BASE + path)).json(),
    post: (path, data) => page.request.post(BASE + path, { data }),
    put: (path, data) => page.request.put(BASE + path, { data }),
    activity: (d) => page.request.post(BASE + "/api/activities", { data: { today: iso(0), ...d } }),
  };
  return { ctx, page, errors, email, api, device };
}

/** Ouvre l'espace et ferme l'accueil s'il s'affiche. */
async function openApp(page) {
  await page.goto(BASE + "/espace");
  await page.waitForTimeout(1200);
  for (const t of ["Passer", "Plus tard"]) await page.click(`.onb >> text=${t}`, { timeout: 800 }).catch(() => {});
}

/** Va sur un onglet de la barre de navigation. */
async function tab(page, name) { await page.click(`[data-tab=${name}] >> visible=true`); await page.waitForTimeout(900); }

/** Ouvre toutes les cartes repliées de l'écran courant. */
async function unfoldAll(page) {
  for (let k = 0; k < 20 && (await page.locator(".fold.is-closed .fold-btn").count()); k++) await page.locator(".fold.is-closed .fold-btn").first().click().catch(() => {});
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** Fin du parcours : ferme le navigateur, affiche le bilan et renvoie le code de sortie. */
async function finish(name) {
  if (browser) await browser.close();
  console.log(failures.length ? `\n${name} : ${failures.length} échec(s)\n - ${failures.join("\n - ")}` : `\n${name} : tout est bon`);
  process.exit(failures.length ? 1 : 0);
}

/** Lance un parcours et transforme une exception en échec propre. */
function scenario(name, fn) {
  console.log(`\n▶ ${name}`);
  fn().then(() => finish(name), (e) => { failures.push("exception : " + e.message); finish(name); });
}

module.exports = { BASE, OUT, iso, check, newUser, openApp, tab, unfoldAll, overflow, scenario, db, userId };
