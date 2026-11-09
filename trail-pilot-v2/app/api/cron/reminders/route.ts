import { timingSafeEqual } from "node:crypto";
import { all, dbConfigured } from "@/db/client";
import { todayIn, addDays, weekday, mondayOf } from "@/lib/engine/dates";
import { pushConfigured, pushToUser } from "@/lib/push";
import { logError } from "@/lib/errors";

export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const got = request.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return !!secret && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/**
 * Lancé chaque soir par Vercel Cron (vercel.json). Rappelle le check-in à ceux qui ont activé
 * le rappel et ne l’ont pas encore fait, en citant la séance prévue demain. Le dimanche, la notification
 * annonce aussi le bilan de la semaine.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Non autorisé", { status: 401 });
  if (!dbConfigured() || !pushConfigured()) return Response.json({ skipped: true });
  const today = todayIn("Europe/Paris");
  const users = await all<{ user_id: number; name: string | null; title: string | null }>(
    `SELECT p.user_id, u.name,
       (SELECT s.title FROM plan_sessions s WHERE s.user_id = p.user_id AND s.date = ? AND s.status IN ('planned', 'adapted') LIMIT 1) AS title
     FROM profiles p JOIN app_users u ON u.id = p.user_id
     WHERE p.reminder = 1
       AND EXISTS (SELECT 1 FROM push_subs s WHERE s.user_id = p.user_id)
       AND NOT EXISTS (SELECT 1 FROM checkins c WHERE c.user_id = p.user_id AND c.date = ?)`,
    [addDays(today, 1), today],
  );
  const sunday = weekday(today) === 6;
  const week = sunday
    ? new Map((await all<{ user_id: number; n: number; km: number; gain: number }>(
      "SELECT user_id, COUNT(*) AS n, ROUND(SUM(COALESCE(distance_km, 0)), 1) AS km, ROUND(SUM(COALESCE(gain_m, 0))) AS gain FROM activities WHERE date >= ? AND date <= ? GROUP BY user_id",
      [mondayOf(today), today])).map((r) => [r.user_id, r]))
    : null;
  let sent = 0;
  for (const u of users) {
    const first = u.name?.split(" ")[0];
    const w = week?.get(u.user_id);
    try {
      if (sunday) {
        sent += await pushToUser(u.user_id, {
          title: `${first ? `${first}, ton` : "Ton"} bilan de la semaine`,
          body: `${w ? `${w.n} sortie${w.n > 1 ? "s" : ""} · ${String(w.km).replace(".", ",")} km · ${Math.round(w.gain).toLocaleString("fr-FR")} m D+. ` : ""}Découvre ta semaine et fais ton check-in pour demain.`,
          url: "/espace#today", tag: `bilan-${today}`,
        });
        continue;
      }
      sent += await pushToUser(u.user_id, {
        title: `${first ? `${first}, ton` : "Ton"} check-in du soir`,
        body: u.title ? `Demain : ${u.title}. 10 secondes pour savoir si c’est OK, allège ou récup.` : "10 secondes pour savoir quoi faire demain.",
        url: "/espace#today", tag: `checkin-${today}`,
      });
    } catch (e) { await logError("cron", e, { url: "/api/cron/reminders", userId: u.user_id }); }
  }
  return Response.json({ users: users.length, sent });
}
