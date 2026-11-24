import { json, withUser } from "@/lib/api";
import { importHistory, StravaError } from "@/lib/strava";

/**
 * Importe un lot de sorties Strava plus anciennes (jusqu'à 300 par appel). L'appli rappelle tant que `done`
 * est faux, en affichant la progression. Sert au comparateur et à Mes courses.
 */
export const POST = withUser(async (user) => {
  try { return json(await importHistory(user.id, 3)); }
  catch (e) {
    if (e instanceof StravaError) return json({ error: e.message }, e.status === 404 ? 404 : 502);
    throw e;
  }
});
