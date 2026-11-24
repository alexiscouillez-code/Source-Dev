import { json, withUser } from "@/lib/api";
import { resolveToday } from "@/lib/service";
import { homeOf, raceStartOf } from "@/lib/place";
import { nowWeather, weatherLabel } from "@/lib/weather";

/**
 * Conditions du moment pour le fond d'herbes : au lieu d'entraînement, et le jour de la course au départ.
 * Le lieu est renvoyé à son seul propriétaire, pour calculer la position du soleil sur l'appareil.
 */
export const GET = withUser(async (user, req) => {
  const today = resolveToday(new URL(req.url).searchParams.get("today"));
  const race = await raceStartOf(user.id);
  const raceDay = !!(race?.start && race.date === today);
  const place = raceDay ? race!.start! : (await homeOf(user.id))?.place ?? null;
  if (!place) return json({ status: "noplace" });
  const now = await nowWeather(place.lat, place.lon);
  if (!now) return json({ status: "error", place, raceDay });
  return json({ status: "ok", place, raceDay, now: { ...now, label: weatherLabel(now.code) } });
});
