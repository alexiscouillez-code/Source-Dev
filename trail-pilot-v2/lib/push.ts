import "server-only";
import webpush from "web-push";
import { all, run } from "@/db/client";
import { SITE_URL } from "./site";

export const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let ready = false;
function setup() {
  if (ready) return;
  webpush.setVapidDetails(SITE_URL, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  ready = true;
}

/** Envoie une notification à tous les appareils de l’utilisateur ; retire les abonnements expirés. */
export async function pushToUser(userId: number, payload: { title: string; body: string; url?: string; tag?: string; checkin?: boolean }) {
  if (!pushConfigured()) return 0;
  setup();
  const subs = await all<{ endpoint: string; p256dh: string; auth: string }>("SELECT endpoint, p256dh, auth FROM push_subs WHERE user_id = ?", [userId]);
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: "normal" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await run("DELETE FROM push_subs WHERE endpoint = ?", [s.endpoint]);
      else throw e;
    }
  }
  return sent;
}
