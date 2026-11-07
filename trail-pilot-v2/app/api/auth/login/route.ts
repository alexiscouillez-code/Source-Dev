import { dbConfigured, libsql } from "@/db/client";
import { createSession, normalizeEmail, verifyPassword } from "@/lib/auth";
import { readBody, recordFailure, tooManyFailures } from "@/lib/auth-guard";
import { unavailable } from "@/lib/auth-guard";

const DENIED = "E-mail ou mot de passe incorrect.";

export async function POST(request: Request) {
  if (!dbConfigured()) return unavailable();
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  if (!email || !body.password) return Response.json({ error: DENIED }, { status: 400 });
  if (await tooManyFailures(email)) return Response.json({ error: "Trop de tentatives. Réessaie dans 15 minutes." }, { status: 429 });
  const rs = await libsql().execute({ sql: "SELECT id, pass_hash FROM app_users WHERE email = ?", args: [email] });
  const row = rs.rows[0];
  if (!row || !(await verifyPassword(body.password, String(row[1])))) {
    await recordFailure(email);
    return Response.json({ error: DENIED }, { status: 401 });
  }
  await createSession(Number(row[0]));
  return Response.json({ ok: true });
}
