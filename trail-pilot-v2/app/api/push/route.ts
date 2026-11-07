import { body, HttpError, json, withUser } from "@/lib/api";
import { all, run } from "@/db/client";
import { pushConfigured, pushToUser } from "@/lib/push";

/** Clé publique et appareils abonnés. */
export const GET = withUser(async (user) => {
  const subs = await all<{ n: number }>("SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?", [user.id]);
  return json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null, devices: subs[0]?.n ?? 0 });
});

/** Active le rappel sur cet appareil (et envoie une notification de test). */
export const POST = withUser(async (user, req) => {
  if (!pushConfigured()) throw new HttpError(503, "Les notifications ne sont pas encore activées sur le site.");
  const b = await body<{ subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } }>(req);
  const s = b.subscription;
  if (!s?.endpoint || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000 || !s.keys?.p256dh || !s.keys?.auth) throw new HttpError(400, "Abonnement invalide.");
  await run(
    `INSERT INTO push_subs(endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    [s.endpoint, user.id, s.keys.p256dh.slice(0, 200), s.keys.auth.slice(0, 100), Date.now()],
  );
  await run("UPDATE profiles SET reminder = 1 WHERE user_id = ?", [user.id]);
  await pushToUser(user.id, { title: "Rappel activé", body: "Chaque soir vers 20 h, Trail Pilot te rappellera ton check-in s’il n’est pas encore fait.", tag: "test" });
  return json({ ok: true });
});

/** Coupe le rappel (tous les appareils, ou un seul). */
export const DELETE = withUser(async (user, req) => {
  const b = await body<{ endpoint?: string }>(req).catch(() => ({} as { endpoint?: string }));
  if (b.endpoint) await run("DELETE FROM push_subs WHERE user_id = ? AND endpoint = ?", [user.id, b.endpoint]);
  else await run("DELETE FROM push_subs WHERE user_id = ?", [user.id]);
  await run("UPDATE profiles SET reminder = 0 WHERE user_id = ?", [user.id]);
  return json({ ok: true });
});
