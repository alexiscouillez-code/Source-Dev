import { json, withUser } from "@/lib/api";
import { StravaError, syncUser } from "@/lib/strava";
import { reconcile, resolveToday } from "@/lib/service";

/**
 * Importe les nouvelles activités Strava puis valide les séances du planning correspondantes.
 * ?auto=1 : synchro lancée toute seule par l’appli (ouverture, retour sur l’onglet), limitée en fréquence.
 */
export const POST = withUser(async (user, req) => {
  const q = new URL(req.url).searchParams;
  try {
    const r = await syncUser(user.id, { auto: q.get("auto") === "1" });
    if (!r.skipped) await reconcile(user.id, resolveToday(q.get("today")));
    return json(r);
  } catch (e) {
    if (e instanceof StravaError) return json({ error: e.message }, e.status === 404 ? 404 : 502);
    throw e;
  }
});
