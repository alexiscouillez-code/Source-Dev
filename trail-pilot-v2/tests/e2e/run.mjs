#!/usr/bin/env node
/**
 * Lance les parcours navigateur contre une version de production construite en local.
 *
 *   npm run test:e2e            (construit si besoin, puis lance tous les parcours)
 *   npm run test:e2e -- charts  (un seul parcours)
 *   npm run test:e2e -- --build (force une nouvelle construction)
 *
 * Base de données neuve à chaque lancement, carte et altitude simulées (aucun appel réseau),
 * synchro Strava simulée. Rien n'est envoyé aux vrais services.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const tmp = join(here, ".tmp");
const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith("--"));
const SCENARIOS = ["engines", "planning", "suspects", "account", "charts", "night", "tour", "appearance", "charter", "bottomnav", "extras", "logo", "fuel", "season"].filter((s) => !only.length || only.includes(s));
const PORT = 3100, MOCK = 3200;

const env = {
  ...process.env,
  NEXT_PUBLIC_VECTOR_TILEJSON: `http://localhost:${MOCK}/planet`,
  NEXT_PUBLIC_DEM_URL: `http://localhost:${MOCK}/terrarium/{z}/{x}/{y}.png`,
  NEXT_PUBLIC_ELEVATION_URL: `http://localhost:${MOCK}/v1/elevation`,
};

rmSync(join(tmp, "e2e.db"), { force: true }); rmSync(join(tmp, "e2e.db-wal"), { force: true }); rmSync(join(tmp, "e2e.db-shm"), { force: true });
mkdirSync(tmp, { recursive: true });
// Base en mode WAL : le serveur et les parcours (qui préparent certains cas directement en base) peuvent lire
// et écrire en même temps sans se bloquer.
{
  const { createClient } = await import("@libsql/client");
  const c = createClient({ url: `file:${join(tmp, "e2e.db")}` });
  await c.execute("PRAGMA journal_mode = WAL");
  c.close();
}

if (args.includes("--build") || !existsSync(join(root, ".next/BUILD_ID"))) {
  console.log("Construction de l’application (adresses de carte simulées)…");
  const b = spawnSync(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "build"], { cwd: root, env, stdio: "inherit" });
  if (b.status !== 0) process.exit(b.status ?? 1);
}

// Un serveur déjà présent sur ces ports fausserait tout (autre base de données) : on s'arrête net.
for (const port of [PORT, MOCK]) {
  const busy = await fetch(`http://localhost:${port}/`).then(() => true, () => false);
  if (busy) { console.error(`Le port ${port} est déjà occupé : arrête le serveur qui l’utilise, puis relance.`); process.exit(1); }
}

// Chaque serveur est lancé dans son propre groupe de processus, pour pouvoir l'arrêter avec tous ses enfants.
const procs = [];
const stop = () => { for (const p of procs) try { process.kill(-p.pid, "SIGTERM"); } catch {} };
process.on("exit", stop);
process.on("SIGINT", () => { stop(); process.exit(130); });

procs.push(spawn(process.execPath, [join(here, "mock-tiles.cjs")], { stdio: "ignore", detached: true }));
procs.push(spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)], {
  cwd: root, stdio: ["ignore", "ignore", "inherit"], detached: true,
  env: { ...env, PORT: String(PORT), TURSO_DATABASE_URL: `file:${join(tmp, "e2e.db")}`, AUTH_SECRET: "cle-de-test-locale-uniquement-0123456789abcdef", STRAVA_CLIENT_ID: "", GROQ_API_KEY: "", RESEND_API_KEY: "",
    // Base de produits et lecture de photo simulées.
    OFF_BASE: `http://localhost:${MOCK}`, VISION_BASE_URL: `http://localhost:${MOCK}/v1`, VISION_API_KEY: "test" },
}));

// Attente du serveur.
const t0 = Date.now();
for (;;) {
  try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch {}
  if (Date.now() - t0 > 60000) { console.error("Le serveur ne répond pas après 60 s."); process.exit(1); }
  await new Promise((r) => setTimeout(r, 500));
}

const results = [];
for (const s of SCENARIOS) {
  const r = spawnSync(process.execPath, ["--import", "tsx", join(here, `${s}.cjs`)], { cwd: root, stdio: "inherit", env: { ...process.env, E2E_BASE: `http://localhost:${PORT}`, E2E_OUT: tmp, E2E_DB: `file:${join(tmp, "e2e.db")}` } });
  results.push([s, r.status === 0]);
}
console.log("\nBilan des parcours :");
for (const [s, ok] of results) console.log(`  ${ok ? "✓" : "✗"} ${s}`);
stop();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
