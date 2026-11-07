import { dbConfigured, libsql } from "@/db/client";
import { createSession, hashPassword, normalizeEmail } from "@/lib/auth";
import { EMAIL_RE, readBody } from "@/lib/auth-guard";
import { unavailable } from "@/lib/auth-guard";
import { sendVerification } from "@/lib/verify-mail";

export async function POST(request: Request) {
  if (!dbConfigured()) return unavailable();
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  if (!EMAIL_RE.test(email)) return Response.json({ error: "Adresse e-mail invalide." }, { status: 400 });
  if (body.password.length < 10) return Response.json({ error: "Le mot de passe doit faire au moins 10 caractères." }, { status: 400 });
  const c = libsql();
  const exists = await c.execute({ sql: "SELECT id FROM app_users WHERE email = ?", args: [email] });
  if (exists.rows.length) return Response.json({ error: "Un compte existe déjà avec cette adresse. Connecte-toi." }, { status: 409 });
  const rs = await c.execute({
    sql: "INSERT INTO app_users(email, name, pass_hash, created_at) VALUES (?, ?, ?, ?) RETURNING id",
    args: [email, body.name.slice(0, 80) || null, await hashPassword(body.password), Date.now()],
  });
  const userId = Number(rs.rows[0][0]);
  await c.execute({ sql: "INSERT INTO profiles(user_id, updated_at) VALUES (?, ?)", args: [userId, Date.now()] });
  await createSession(userId);
  await sendVerification(userId, email);
  return Response.json({ ok: true });
}
