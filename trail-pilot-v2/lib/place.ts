import "server-only";
import { one } from "@/db/client";
import { decodePolyline } from "./polyline";
import type { Place } from "./weather";

/** Départ de la course : le début du tracé GPS s'il existe, sinon le lieu choisi à la main. */
export async function raceStartOf(userId: number): Promise<{ date: string; start: Place | null; fromTrace: boolean } | null> {
  const g = await one<{ date: string; route: string | null; place: string | null }>("SELECT date, route, place FROM goals WHERE user_id = ?", [userId]);
  if (!g) return null;
  let start: Place | null = null;
  try { const r = g.route ? JSON.parse(g.route) : null; const p = r?.line ? decodePolyline(r.line)[0] : null; if (p) start = { name: "Départ du tracé", lat: p[0], lon: p[1] }; } catch { /* tracé illisible */ }
  if (!start) { try { start = g.place ? JSON.parse(g.place) : null; } catch { start = null; } }
  return { date: g.date, start, fromTrace: start?.name === "Départ du tracé" };
}

/** Lieu d'entraînement : celui choisi dans l'appli, sinon le départ de la course (tracé, puis lieu choisi). */
export async function homeOf(userId: number): Promise<{ place: Place; chosen: boolean } | null> {
  const p = await one<{ home: string | null }>("SELECT home FROM profiles WHERE user_id = ?", [userId]);
  try { const h = p?.home ? JSON.parse(p.home) : null; if (h) return { place: h, chosen: true }; } catch { /* lieu illisible */ }
  const s = await raceStartOf(userId);
  if (s?.start) return { place: s.fromTrace ? { ...s.start, name: "Départ de ta course" } : s.start, chosen: false };
  return null;
}
