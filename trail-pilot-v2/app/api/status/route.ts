import { json, withUser } from "@/lib/api";
import { one } from "@/db/client";
import { statesFor, type Service } from "@/lib/status";
import { stravaStatus } from "@/lib/strava";
import { pushConfigured } from "@/lib/push";
import { mailConfigured } from "@/lib/mail";
import { aiConfigured } from "@/lib/ai";

/**
 * État des connexions du coureur : pour chaque service, s'il est activé sur le site, s'il est relié pour ce coureur,
 * et quand il a marché ou échoué pour la dernière fois. Aucune clé ni valeur secrète n'est renvoyée, seulement leur présence.
 */
export const GET = withUser(async (user) => {
  const [states, strava, subs] = await Promise.all([
    statesFor(user.id),
    stravaStatus(user.id),
    one<{ n: number }>("SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?", [user.id]),
  ]);
  const st = (s: Service) => states.find((x) => x.service === s);
  const entry = (key: Service, label: string, configured: boolean, linked: boolean | null, use: string) => {
    const s = st(key);
    return { key, label, use, configured, linked, lastOk: s?.lastOk ?? null, lastFail: s?.lastFail ?? null, error: s?.error ?? null };
  };
  const services = [
    entry("strava", "Strava", strava.configured, strava.connected, "Importe tes sorties automatiquement."),
    entry("push", "Notifications", pushConfigured(), (subs?.n ?? 0) > 0, "Rappel du check-in et des séances."),
    entry("ia", "Intelligence artificielle", aiConfigured(), null, "Lit tes commentaires, fait le bilan des sorties importées, répond dans le coach."),
    entry("meteo", "Météo", true, null, "Prévisions pour tes séances et tes courses."),
    entry("mail", "E-mail", mailConfigured(), null, "Vérification du compte et envoi de tes retours."),
  ];
  // Strava garde aussi sa propre trace de synchro : on prend l'information la plus récente des deux.
  const s0 = services[0];
  if (strava.lastSyncAt && (!s0.lastOk || strava.lastSyncAt > s0.lastOk)) s0.lastOk = strava.lastSyncAt;
  if (strava.lastError && !s0.lastFail) { s0.error = "Erreur lors de la dernière synchro"; s0.lastFail = strava.lastSyncAt ?? null; }
  return json({ services, now: Date.now() });
});
