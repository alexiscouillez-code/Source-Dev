import { NextResponse } from "next/server";
import { dbConfigured, run } from "@/db/client";
import { getUser } from "@/lib/auth";
import { unavailable } from "@/lib/auth-guard";
import { mailConfigured } from "@/lib/mail";
import { consumeToken, lastTokenAt } from "@/lib/tokens";
import { sendVerification } from "@/lib/verify-mail";

/** Lien de confirmation reçu par e-mail. */
export async function GET(request: Request) {
  if (!dbConfigured()) return unavailable();
  const url = new URL(request.url);
  const userId = await consumeToken(url.searchParams.get("token") ?? "", "verify");
  if (userId) await run("UPDATE app_users SET email_verified_at = ? WHERE id = ? AND email_verified_at IS NULL", [Date.now(), userId]);
  return NextResponse.redirect(new URL(`/espace?verif=${userId ? "ok" : "expire"}#account`, url.origin), 303);
}

/** Renvoyer le lien de confirmation (une fois toutes les 2 minutes au plus). */
export async function POST() {
  if (!dbConfigured()) return unavailable();
  const user = await getUser();
  if (!user) return Response.json({ error: "Connecte-toi pour continuer." }, { status: 401 });
  if (!mailConfigured()) return Response.json({ error: "L’envoi d’e-mails n’est pas encore activé sur le site." }, { status: 503 });
  if (Date.now() - (await lastTokenAt(user.id, "verify")) < 120000) return Response.json({ error: "Un e-mail vient de partir. Attends 2 minutes avant d’en demander un autre." }, { status: 429 });
  const ok = await sendVerification(user.id, user.email);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "L’e-mail n’a pas pu partir. Réessaie plus tard." }, { status: 502 });
}
