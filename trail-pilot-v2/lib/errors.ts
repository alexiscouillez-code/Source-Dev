import "server-only";
import { dbConfigured, run } from "@/db/client";

/** Garde une trace des erreurs en base (table app_errors), sans jamais faire échouer l’appelant. */
export async function logError(source: string, err: unknown, extra: { url?: string | null; userId?: number | null } = {}) {
  try {
    if (!dbConfigured()) return;
    const e = err instanceof Error ? err : new Error(String(err));
    await run("INSERT INTO app_errors(at, source, message, stack, url, user_id) VALUES (?, ?, ?, ?, ?, ?)", [
      Date.now(), source.slice(0, 40), e.message.slice(0, 500), (e.stack ?? "").slice(0, 4000) || null, extra.url?.slice(0, 300) ?? null, extra.userId ?? null,
    ]);
    // On ne garde que les 30 derniers jours.
    if (Math.random() < 0.05) await run("DELETE FROM app_errors WHERE at < ?", [Date.now() - 30 * 86400000]);
  } catch { /* le suivi des erreurs ne doit jamais casser l’application */ }
}
