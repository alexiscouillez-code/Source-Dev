import { dbConfigured, one } from "@/db/client";
import { normalizeEmail } from "@/lib/auth";
import { EMAIL_RE, recordFailure, tooManyFailures, unavailable } from "@/lib/auth-guard";
import { mailConfigured, sendMail } from "@/lib/mail";
import { createToken } from "@/lib/tokens";
import { logError } from "@/lib/errors";
import { SITE_URL } from "@/lib/site";

const DONE = { ok: true, message: "Si un compte existe avec cette adresse, un lien pour choisir un nouveau mot de passe vient d’être envoyé. Il est valable 1 heure." };

/** Demande de réinitialisation : même réponse que le compte existe ou non. */
export async function POST(request: Request) {
  if (!dbConfigured()) return unavailable();
  if (!mailConfigured()) return Response.json({ error: "L’envoi d’e-mails n’est pas encore activé sur le site. Écris-nous pour récupérer ton compte." }, { status: 503 });
  const b = await request.json().catch(() => ({})) as { email?: unknown };
  const email = normalizeEmail(String(b.email ?? ""));
  if (!EMAIL_RE.test(email)) return Response.json({ error: "Adresse e-mail invalide." }, { status: 400 });
  const key = `reset:${email}`;
  if (await tooManyFailures(key)) return Response.json({ error: "Trop de demandes. Réessaie dans 15 minutes." }, { status: 429 });
  await recordFailure(key); // compte chaque demande pour limiter les envois
  const user = await one<{ id: number }>("SELECT id FROM app_users WHERE email = ?", [email]);
  if (user) {
    try {
      const token = await createToken(user.id, "reset", 60);
      await sendMail(email, "Choisis un nouveau mot de passe",
        "Tu as demandé à réinitialiser ton mot de passe Trail Pilot. Ce lien est valable 1 heure et ne sert qu’une fois.",
        { label: "Choisir un nouveau mot de passe", url: `${SITE_URL}/reinitialiser?token=${token}` },
        "Si tu n’es pas à l’origine de cette demande, ignore cet e-mail : ton mot de passe actuel reste valable.");
    } catch (e) { await logError("mail", e, { url: "/api/auth/forgot" }); }
  }
  return Response.json(DONE);
}
