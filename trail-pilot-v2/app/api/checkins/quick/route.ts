import { body, HttpError, json, withUser } from "@/lib/api";
import { all, one } from "@/db/client";
import { resolveToday, saveCheckin } from "@/lib/service";

/**
 * Check-in express, depuis les boutons de la notification du matin : un seul geste, sans ouvrir l’appli.
 * « En forme », « Moyen » ou « Fatigué » remplissent sommeil, jambes et motivation ; la douleur reste à 0
 * (en cas de douleur, le check-in complet est à faire dans l’appli). Un check-in déjà fait n’est jamais écrasé.
 */
const LEVELS = { forme: 4, moyen: 3, fatigue: 2 } as const;
const LABEL = { ok: "OK", lite: "Allège", rest: "Récup" } as const;

export const POST = withUser(async (user, req) => {
  const b = await body(req);
  const today = resolveToday(typeof b.today === "string" ? b.today : null);
  const level = typeof b.level === "string" && b.level in LEVELS ? LEVELS[b.level as keyof typeof LEVELS] : null;
  if (level == null) throw new HttpError(400, "Réponse inconnue.");
  const done = await one("SELECT 1 FROM checkins WHERE user_id = ? AND date = ?", [user.id, today]);
  if (done) return json({ already: true, title: "Check-in déjà fait aujourd’hui", body: "Ouvre Trail Pilot pour voir ta décision du jour." });
  const d = await saveCheckin(user.id, today, { sleep: level, legs: level, motivation: level, pain: 0, note: null });
  const s = await all<{ title: string; duration_min: number }>("SELECT title, duration_min FROM plan_sessions WHERE user_id = ? AND date = ? AND template != 'race' AND status IN ('planned', 'adapted') ORDER BY id", [user.id, today]);
  const session = s[0] ? `${s[0].title} · ${s[0].duration_min} min` : "Pas de séance prévue aujourd’hui.";
  return json({ title: `Décision du jour : ${LABEL[d.verdict]}`, body: `${session}\n${d.reasons[0] ?? ""}`.trim(), verdict: d.verdict });
});
