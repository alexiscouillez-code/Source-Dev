import { body, HttpError, json, text, withUser } from "@/lib/api";
import { one, run } from "@/db/client";
import { decodePolyline } from "@/lib/polyline";
import { resolveToday } from "@/lib/service";
import { raceWeather, searchPlaces, type Place } from "@/lib/weather";

/** Lieu de départ : le début du tracé GPS s’il existe, sinon le lieu choisi à la main. */
async function startOf(userId: number) {
  const g = await one<{ date: string; route: string | null; place: string | null }>("SELECT date, route, place FROM goals WHERE user_id = ?", [userId]);
  if (!g) return null;
  let start: Place | null = null;
  try { const r = g.route ? JSON.parse(g.route) : null; const p = r?.line ? decodePolyline(r.line)[0] : null; if (p) start = { name: "Départ du tracé", lat: p[0], lon: p[1] }; } catch { /* tracé illisible */ }
  if (!start) { try { start = g.place ? JSON.parse(g.place) : null; } catch { start = null; } }
  return { date: g.date, start, fromTrace: start?.name === "Départ du tracé" };
}

export const GET = withUser(async (user, req) => {
  const today = resolveToday(new URL(req.url).searchParams.get("today"));
  const s = await startOf(user.id);
  if (!s) return json({ status: "nogoal" });
  if (!s.start) return json({ status: "noplace" });
  const r = await raceWeather(s.start.lat, s.start.lon, s.date, today);
  return json({ ...r, place: s.start, fromTrace: s.fromTrace });
});

/** Recherche d’un lieu (ville, station) pour la météo. */
export const POST = withUser(async (user, req) => {
  const b = await body(req);
  const q = text(b.query, 80);
  if (!q || q.length < 2) throw new HttpError(400, "Tape le nom d’une ville ou d’une station.");
  return json({ places: await searchPlaces(q) });
});

/** Enregistre le lieu de départ choisi. */
export const PUT = withUser(async (user, req) => {
  const b = await body(req);
  const lat = Number(b.lat), lon = Number(b.lon), name = text(b.name, 120);
  if (!name || !(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) throw new HttpError(400, "Lieu invalide.");
  const { changes } = await run("UPDATE goals SET place = ? WHERE user_id = ?", [JSON.stringify({ name, lat, lon }), user.id]);
  if (!changes) throw new HttpError(400, "Choisis d’abord ta course.");
  return json({ ok: true });
});
