import { dbConfigured, run } from "@/db/client";
import { createSession, hashPassword } from "@/lib/auth";
import { unavailable } from "@/lib/auth-guard";
import { consumeToken } from "@/lib/tokens";

/** Nouveau mot de passe à partir du lien reçu par e-mail. Ferme toutes les autres sessions. */
export async function POST(request: Request) {
  if (!dbConfigured()) return unavailable();
  const b = await request.json().catch(() => ({})) as { token?: unknown; password?: unknown };
  const password = String(b.password ?? "");
  if (password.length < 10) return Response.json({ error: "Le mot de passe doit faire au moins 10 caractères." }, { status: 400 });
  const userId = await consumeToken(String(b.token ?? ""), "reset");
  if (!userId) return Response.json({ error: "Ce lien n’est plus valable. Fais une nouvelle demande depuis la page de connexion." }, { status: 400 });
  const now = Date.now();
  await run("UPDATE app_users SET pass_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?", [await hashPassword(password), now, userId]);
  await run("DELETE FROM app_sessions WHERE user_id = ?", [userId]);
  await run("DELETE FROM app_auth_failures WHERE email = (SELECT email FROM app_users WHERE id = ?)", [userId]);
  await createSession(userId);
  return Response.json({ ok: true });
}
