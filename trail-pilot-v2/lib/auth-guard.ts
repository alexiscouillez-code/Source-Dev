import { libsql } from "@/db/client";

const WINDOW = 15 * 60000;
const MAX_FAILURES = 8;

export async function tooManyFailures(email: string) {
  const c = libsql();
  await c.execute({ sql: "DELETE FROM app_auth_failures WHERE at < ?", args: [Date.now() - WINDOW] });
  const rs = await c.execute({ sql: "SELECT COUNT(*) FROM app_auth_failures WHERE email = ?", args: [email] });
  return Number(rs.rows[0]?.[0] ?? 0) >= MAX_FAILURES;
}

export async function recordFailure(email: string) {
  await libsql().execute({ sql: "INSERT INTO app_auth_failures(email, at) VALUES (?, ?)", args: [email, Date.now()] });
}

export async function readBody(request: Request) {
  try {
    const b = (await request.json()) as Record<string, unknown>;
    return { email: String(b.email ?? ""), password: String(b.password ?? ""), name: String(b.name ?? "").trim() };
  } catch {
    return { email: "", password: "", name: "" };
  }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function unavailable() {
  return Response.json({ error: "Les comptes ouvrent très bientôt : la base de données est en cours de configuration." }, { status: 503 });
}
