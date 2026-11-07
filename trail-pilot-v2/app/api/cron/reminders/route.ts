import { timingSafeEqual } from "node:crypto";
import { all, dbConfigured } from "@/db/client";
import { todayIn, addDays } from "@/lib/engine/dates";
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
 * le rappel et ne l’ont pas encore fait, en citant la séance prévue demain.
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
  let sent = 0;
  for (const u of users) {
    const first = u.name?.split(" ")[0];
    try {
      sent += await pushToUser(u.user_id, {
        title: `${first ? `${first}, ton` : "Ton"} check-in du soir`,
        body: u.title ? `Demain : ${u.title}. 10 secondes pour savoir si c’est OK, allège ou récup.` : "10 secondes pour savoir quoi faire demain.",
        url: "/espace#today", tag: `checkin-${today}`,
      });
    } catch (e) { await logError("cron", e, { url: "/api/cron/reminders", userId: u.user_id }); }
  }
  return Response.json({ users: users.length, sent });
}
