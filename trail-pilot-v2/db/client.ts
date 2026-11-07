import { createClient, type Client, type InArgs } from "@libsql/client";

let client: Client | null = null;

/** Turso en production, fichier SQLite local en développement. */
export const dbConfigured = () => !!process.env.TURSO_DATABASE_URL || process.env.NODE_ENV !== "production";

export function libsql(): Client {
  if (!client) {
    if (!dbConfigured()) throw new Error("DB_NOT_CONFIGURED");
    client = createClient({
      url: process.env.TURSO_DATABASE_URL ?? "file:./local.db",
      authToken: process.env.TURSO_AUTH_TOKEN,
      intMode: "number",
    });
  }
  return client;
}

type Row = Record<string, unknown>;

/** Petites aides typées au-dessus du client libsql. */
export async function all<T = Row>(sql: string, args: InArgs = []): Promise<T[]> {
  const rs = await libsql().execute({ sql, args });
  return rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])) as T);
}
export async function one<T = Row>(sql: string, args: InArgs = []): Promise<T | null> {
  return (await all<T>(sql, args))[0] ?? null;
}
export async function run(sql: string, args: InArgs = []) {
  const rs = await libsql().execute({ sql, args });
  return { changes: rs.rowsAffected, id: Number(rs.lastInsertRowid ?? 0) };
}
