import "server-only";
import { SITE_NAME, SITE_URL } from "./site";

/**
 * Envoi d’e-mails par l’API Resend. Sans clé RESEND_API_KEY, rien n’est envoyé et les écrans
 * concernés l’indiquent. MAIL_FROM doit être une adresse d’un domaine vérifié chez Resend.
 */
export const mailConfigured = () => !!process.env.RESEND_API_KEY;

export async function sendMail(to: string, subject: string, intro: string, cta: { label: string; url: string }, outro: string) {
  if (!mailConfigured()) throw new Error("MAIL_NOT_CONFIGURED");
  const from = process.env.MAIL_FROM ?? `${SITE_NAME} <onboarding@resend.dev>`;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f4efe6;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0b0f14">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:18px;padding:32px" cellpadding="0" cellspacing="0">
<tr><td style="font-weight:800;letter-spacing:.08em;font-size:13px;color:#e8541c">TRAIL PILOT</td></tr>
<tr><td style="padding:18px 0 8px;font-size:22px;font-weight:700">${esc(subject)}</td></tr>
<tr><td style="font-size:15px;line-height:1.55;color:#3a4552">${esc(intro)}</td></tr>
<tr><td style="padding:24px 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#e8541c;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:999px">${esc(cta.label)}</a></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#6b7684">${esc(outro)}<br><br>Si le bouton ne marche pas, copie ce lien : <br><span style="word-break:break-all">${esc(cta.url)}</span></td></tr>
</table><p style="font-size:12px;color:#8a93a0">${esc(SITE_NAME)} · ${esc(SITE_URL.replace(/^https?:\/\//, ""))}</p></td></tr></table></body></html>`;
  const text = `${subject}\n\n${intro}\n\n${cta.label} : ${cta.url}\n\n${outro}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!res.ok) throw new Error(`Envoi d’e-mail refusé (${res.status})`);
}
