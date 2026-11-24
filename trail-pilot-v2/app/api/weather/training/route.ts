import { body, HttpError, json, text, withUser } from "@/lib/api";
import { run } from "@/db/client";
import { homeOf } from "@/lib/place";
import { resolveToday } from "@/lib/service";
import { trainingForecast } from "@/lib/weather";

export const GET = withUser(async (user, req) => {
  const today = resolveToday(new URL(req.url).searchParams.get("today"));
  const h = await homeOf(user.id);
  if (!h) return json({ status: "noplace" });
  const days = await trainingForecast(h.place.lat, h.place.lon, today);
  return json(days ? { status: "ok", place: h.place, chosen: h.chosen, days } : { status: "error", place: h.place, chosen: h.chosen });
});

/** Enregistre le lieu d’entraînement (ou l’efface avec { clear: true }). */
export const PUT = withUser(async (user, req) => {
  const b = await body(req);
  if (b.clear === true) { await run("UPDATE profiles SET home = NULL WHERE user_id = ?", [user.id]); return json({ ok: true }); }
  const lat = Number(b.lat), lon = Number(b.lon), name = text(b.name, 120);
  if (!name || !(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) throw new HttpError(400, "Lieu invalide.");
  await run("UPDATE profiles SET home = ? WHERE user_id = ?", [JSON.stringify({ name, lat, lon }), user.id]);
  return json({ ok: true });
});
