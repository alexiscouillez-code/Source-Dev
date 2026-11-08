import { body, HttpError, json, text, withUser } from "@/lib/api";
import { searchPlaces } from "@/lib/weather";

/** Recherche d’un point de départ par nom (ville, village, lieu-dit). */
export const POST = withUser(async (_user, req) => {
  const q = text((await body(req)).query, 80);
  if (!q || q.length < 2) throw new HttpError(400, "Tape le nom d’une ville ou d’un lieu.");
  return json({ places: await searchPlaces(q) });
});
