import { body, HttpError, json, text, withUser } from "@/lib/api";
import { one, run } from "@/db/client";
import { mailConfigured, sendMail } from "@/lib/mail";
import { SITE_URL } from "@/lib/site";

/**
 * Bouton « Un retour ? » : bug, idée ou remarque. Le retour est enregistré, et envoyé par e-mail à
 * l’adresse FEEDBACK_TO si elle est configurée. 10 retours par jour au plus par compte.
 */
const KINDS = { bug: "Un bug", idee: "Une idée", autre: "Une remarque" } as const;

export const POST = withUser(async (user, req) => {
  const b = await body(req);
  const kind = typeof b.kind === "string" && b.kind in KINDS ? (b.kind as keyof typeof KINDS) : "autre";
  const msg = text(b.text, 2000);
  if (!msg || msg.length < 3) throw new HttpError(400, "Écris quelques mots.");
  const page = text(b.page, 40);
  const n = await one<{ n: number }>("SELECT COUNT(*) AS n FROM feedback WHERE user_id = ? AND created_at > ?", [user.id, Date.now() - 86400000]);
  if ((n?.n ?? 0) >= 10) throw new HttpError(429, "Merci ! Tu as déjà envoyé beaucoup de retours aujourd’hui, réessaie demain.");
  await run("INSERT INTO feedback(user_id, kind, page, text, created_at) VALUES (?, ?, ?, ?, ?)", [user.id, kind, page, msg, Date.now()]);
  const to = process.env.FEEDBACK_TO;
  if (to && mailConfigured()) {
    try { await sendMail(to, `${KINDS[kind]} sur Trail Pilot`, `${msg}\n\nÉcran : ${page ?? "non précisé"} · compte n° ${user.id}`, { label: "Ouvrir Trail Pilot", url: `${SITE_URL}/espace` }, "Envoyé depuis le bouton « Un retour ? » de l’appli."); }
    catch (e) { console.error("Retour : e-mail non envoyé", e instanceof Error ? e.message : e); }
  }
  return json({ ok: true }, 201);
});
