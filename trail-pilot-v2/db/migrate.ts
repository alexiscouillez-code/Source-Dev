import { libsql } from "./client";
import { MIGRATIONS } from "./migrations";

let done: Promise<void> | null = null;

/** Applique une seule fois par instance les migrations manquantes. */
export function ensureSchema() {
  return (done ??= (async () => {
    const c = libsql();
    await c.execute("PRAGMA foreign_keys = ON");
    await c.execute("CREATE TABLE IF NOT EXISTS __migrations (tag TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
    const applied = new Set((await c.execute("SELECT tag FROM __migrations")).rows.map((r) => String(r[0])));
    for (const m of MIGRATIONS) {
      if (applied.has(m.tag)) continue;
      try {
        await c.batch([...m.statements, { sql: "INSERT INTO __migrations(tag, applied_at) VALUES (?, ?)", args: [m.tag, Date.now()] }], "write");
      } catch (err) {
        const again = await c.execute({ sql: "SELECT 1 FROM __migrations WHERE tag = ?", args: [m.tag] });
        if (!again.rows.length) throw err;
      }
    }
  })().catch((e) => { done = null; throw e; }));
}
