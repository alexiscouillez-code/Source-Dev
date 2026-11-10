import { body, HttpError, json, text, withUser } from "@/lib/api";
import { one, run } from "@/db/client";
import { decodePolyline } from "@/lib/polyline";
import { resolveToday } from "@/lib/service";
import { trainingForecast, type Place } from "@/lib/weather";

/** Lieu d’entraînement : celui choisi dans Compte, sinon le départ de la course (tracé, puis lieu choisi). */
async function homeOf(userId: number): Promise<{ place: Place; chosen: boolean } | null> {
  const p = await one<{ home: string | null }>("SELECT home FROM profiles WHERE user_id = ?", [userId]);
  try { const h = p?.home ? JSON.parse(p.home) : null; if (h) return { place: h, chosen: true }; } catch { /* lieu illisible */ }
  const g = await one<{ route: string | null; place: string | null }>("SELECT route, place FROM goals WHERE user_id = ?", [userId]);
  try { const r = g?.route ? JSON.parse(g.route) : null; const pt = r?.line ? decodePolyline(r.line)[0] : null; if (pt) return { place: { name: "Départ de ta course", lat: pt[0], lon: pt[1] }, chosen: false }; } catch { /* tracé illisible */ }
  try { const pl = g?.place ? JSON.parse(g.place) : null; if (pl) return { place: pl, chosen: false }; } catch { /* lieu illisible */ }
  return null;
}

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
