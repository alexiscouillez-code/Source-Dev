import "server-only";
import { all } from "@/db/client";
import { decodePolyline } from "@/lib/polyline";
import { dist } from "./graph";
import { KINDS, type Kind, type Terrain } from "./finders";
import { HttpError, num, text } from "@/lib/api";
import { cleanPolyline } from "@/lib/polyline";

/** Tes propres boucles : sorties dont l’arrivée revient près du départ, regroupées quand elles se ressemblent. */
export async function ownLoops(userId: number): Promise<Terrain[]> {
  const rows = await all<{ id: number; date: string; name: string | null; sport: string; distance_km: number | null; gain_m: number | null; track: string }>(
    "SELECT id, date, name, sport, distance_km, gain_m, track FROM activities WHERE user_id = ? AND track IS NOT NULL AND sport IN ('trail', 'course', 'rando') ORDER BY date DESC LIMIT 300", [userId]);
  type G = { row: (typeof rows)[number]; s: [number, number]; count: number; last: string };
  const groups: G[] = [];
  for (const r of rows) {
    let pts: [number, number][];
    try { pts = decodePolyline(r.track); } catch { continue; }
    if (pts.length < 10 || !r.distance_km || r.distance_km < 2) continue;
    const s = pts[0], e = pts[pts.length - 1];
    if (dist(s[0], s[1], e[0], e[1]) > 400) continue;
    const g = groups.find((o) => dist(o.s[0], o.s[1], s[0], s[1]) < 350 && Math.abs((o.row.distance_km ?? 0) - r.distance_km!) / r.distance_km! < 0.08 && Math.abs((o.row.gain_m ?? 0) - (r.gain_m ?? 0)) <= Math.max(40, (r.gain_m ?? 0) * 0.15));
    if (g) g.count++; else groups.push({ row: r, s, count: 1, last: r.date });
  }
  return groups.slice(0, 40).map(({ row: r, s, count, last }) => ({
    id: `mine-${r.id}`, kind: "loop" as const, source: "mine" as const,
    name: r.name?.trim() || `Ta boucle de ${String(Math.round(r.distance_km! * 10) / 10).replace(".", ",")} km`,
    detail: `${count > 1 ? `Faite ${count} fois, la dernière` : "Faite"} le ${new Date(`${last}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`,
    tags: ["Ta sortie"], lat: s[0], lon: s[1], fromStartKm: 0, poly: r.track, distanceKm: r.distance_km, gainM: r.gain_m, lossM: null,
    grade: null, maxGrade: null, trailShare: null, profile: null, osm: null,
  }));
}

export interface Saved extends Terrain { savedId: number; note: string | null; savedAt: number }

export async function savedTerrains(userId: number): Promise<Saved[]> {
  const rows = await all<{ id: number; name: string; note: string | null; data: string; created_at: number }>("SELECT id, name, note, data, created_at FROM terrains WHERE user_id = ? ORDER BY created_at DESC", [userId]);
  return rows.flatMap((r) => { try { return [{ ...(JSON.parse(r.data) as Terrain), name: r.name, savedId: r.id, note: r.note, savedAt: r.created_at }]; } catch { return []; } });
}

/** Validation d’un terrain envoyé par le navigateur avant enregistrement. */
export function cleanTerrain(b: Record<string, unknown>): Terrain {
  const kind = b.kind as Kind;
  if (!KINDS.includes(kind)) throw new HttpError(400, "Type de terrain inconnu.");
  const name = text(b.name, 100);
  if (!name) throw new HttpError(400, "Donne un nom à ce terrain.");
  const lat = num(b.lat, -90, 90, "Latitude")!, lon = num(b.lon, -180, 180, "Longitude")!;
  const poly = b.poly == null ? null : cleanPolyline(b.poly, 30000);
  if (b.poly != null && !poly) throw new HttpError(400, "Tracé invalide.");
  const prof = Array.isArray(b.profile) ? (b.profile as unknown[]).slice(0, 60).filter((x): x is [number, number] => Array.isArray(x) && x.length === 2 && x.every((v) => typeof v === "number" && Number.isFinite(v))) : null;
  const tags = Array.isArray(b.tags) ? (b.tags as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 5).map((t) => t.slice(0, 40)) : [];
  const osm = typeof b.osm === "string" && /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/.test(b.osm) ? b.osm : null;
  const n = (v: unknown, lo: number, hi: number) => (v == null ? null : num(v, lo, hi, "Valeur"));
  return {
    id: typeof b.id === "string" ? b.id.slice(0, 60) : `saved-${Date.now()}`, kind, source: b.source === "mine" ? "mine" : "osm",
    name, detail: text(b.detail, 200) ?? "", tags, lat, lon, fromStartKm: 0, poly,
    distanceKm: n(b.distanceKm, 0, 400), gainM: n(b.gainM, 0, 20000), lossM: n(b.lossM, 0, 20000), grade: n(b.grade, -100, 100), maxGrade: n(b.maxGrade, -100, 100),
    trailShare: n(b.trailShare, 0, 1), profile: prof?.length ? prof : null, osm,
  };
}
