export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { dbConfigured } = await import("./db/client");
  if (!dbConfigured()) { console.warn("Base de données non configurée : seules les pages publiques fonctionnent."); return; }
  const { ensureSchema } = await import("./db/migrate");
  // Une erreur de migration ne doit pas faire tomber les pages publiques.
  await ensureSchema().catch((e) => console.error("Migration impossible", e));
}

/** Erreurs serveur non gérées (rendu des pages, routes) : gardées en base pour être corrigées. */
export async function onRequestError(err: unknown, request: { path: string }, context: { routerKind: string; routePath: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logError } = await import("./lib/errors");
  await logError(`server:${context.routerKind}`, err, { url: `${request.path} (${context.routePath})` });
}
