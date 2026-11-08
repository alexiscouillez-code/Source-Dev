import type { LatLon } from "@/lib/polyline";
import { buildGraph, dist, type Graph, type OsmWay } from "./graph";
import { loadTiles, MAX_TILES, poisFromTiles, tilesFor, waysFromTiles } from "./tiles";
import { demElevation } from "./dem";
import { findLoops, findSlopes, placesFrom, stairsFrom, TerrainError, type Elev, type Kind, type Surface, type Terrain } from "./finders";

/**
 * Recherche de terrains : chemins et lieux OpenStreetMap lus dans les tuiles vectorielles d’OpenFreeMap,
 * altitude par les tuiles de terrain ouvertes Terrarium (Mapzen, AWS Open Data).
 * Exécutée sur l’appareil, dans un worker : les serveurs Overpass publics bloquent désormais les navigateurs
 * et les hébergeurs cloud, alors que les tuiles sont faites pour être lues directement par les applis.
 */
export interface SearchInput {
  kind: Kind; lat: number; lon: number; radiusKm: number;
  distanceKm?: number; gainM?: number | null; surface?: Surface;
  minLen?: number; maxLen?: number; minGrade?: number; maxGrade?: number;
}
// Altitude : Open-Meteo par défaut ; NEXT_PUBLIC_ELEVATION_URL pour un serveur dédié (même format de réponse).
const ELEVATION = process.env.NEXT_PUBLIC_ELEVATION_URL || "https://api.open-meteo.com/v1/elevation";

/** Altitudes (m) par lots de 100 points via Open-Meteo : seulement en secours (chaque point compte dans le quota). */
async function openMeteo(pts: LatLon[]): Promise<number[]> {
  const out: number[] = new Array(pts.length);
  for (let i = 0; i < pts.length; i += 100) {
    const part = pts.slice(i, i + 100);
    const q = `latitude=${part.map((p) => p[0].toFixed(5)).join(",")}&longitude=${part.map((p) => p[1].toFixed(5)).join(",")}`;
    const res = await fetch(`${ELEVATION}?${q}`, { signal: AbortSignal.timeout(10000) });
    const j = res.ok ? ((await res.json()) as { elevation?: number[] }) : null;
    if (!j?.elevation || j.elevation.length !== part.length) throw new Error("Open-Meteo");
    j.elevation.forEach((v, n) => { out[i + n] = v; });
  }
  return out;
}

/** Altitudes : tuiles de terrain d’abord, Open-Meteo en secours pour de petits lots. */
export const elevation: Elev = async (pts: LatLon[]) => {
  try { return await demElevation(pts); }
  catch (e) {
    console.warn("Tuiles d’altitude indisponibles", e);
    if (pts.length <= 400) { try { return await openMeteo(pts); } catch { /* rien */ } }
    throw new TerrainError("Le service d’altitude ne répond pas pour le moment. Réessaie dans un instant.", 503);
  }
};

/** Altitude de chaque nœud du réseau dans le rayon de recherche. */
async function nodeAltitudes(g: Graph, center: { lat: number; lon: number }, radiusM: number) {
  const idx: number[] = [];
  for (let i = 0; i < g.n; i++) if (g.adj[i].length && dist(center.lat, center.lon, g.lat[i], g.lon[i]) <= radiusM) idx.push(i);
  const zs = await elevation(idx.map((i) => [g.lat[i], g.lon[i]] as LatLon));
  const z = new Float64Array(g.n).fill(NaN);
  idx.forEach((i, k) => { z[i] = zs[k]; });
  g.z = z;
}

/** Rayon de réseau nécessaire pour une boucle : le tracé s’éloigne d’environ un quart de sa longueur. */
export const loopRadiusKm = (km: number) => Math.min(6, Math.max(1.5, km / 3.4));

/** Chemins et lieux du secteur, lus dans les tuiles vectorielles. */
async function area(lat: number, lon: number, radiusM: number) {
  const list = tilesFor(lat, lon, radiusM);
  if (list.length > MAX_TILES) throw new TerrainError("Zone trop grande : réduis la distance ou le rayon de recherche.");
  try { return await loadTiles(list); }
  catch (e) {
    console.warn("Tuiles de carte indisponibles", e);
    throw new TerrainError(typeof navigator !== "undefined" && !navigator.onLine ? "Pas de connexion : la recherche de terrains a besoin du réseau." : "Les données de carte ne répondent pas pour le moment. Réessaie dans un instant.", 503);
  }
}
const within = (ways: OsmWay[], lat: number, lon: number, r: number) => ways.filter((w) => w.geometry.some((g) => dist(lat, lon, g.lat, g.lon) <= r));

type Tags = Record<string, string>;
const POI: Record<"track" | "fitness" | "water", (cls: string, sub: string) => Tags | null> = {
  water: (c, s) => (s === "drinking_water" || c === "drinking_water" || s === "water_point" ? { amenity: "drinking_water" } as Tags : s === "spring" ? { natural: "spring", drinking_water: "yes" } : null),
  fitness: (c, s) => (s === "fitness_station" || c === "fitness_station" ? { leisure: "fitness_station" } : null),
  track: (c, s) => (s === "athletics" || s === "running" || c === "athletics" ? { leisure: "track", sport: "athletics" } as Tags : s === "stadium" || c === "stadium" ? { leisure: "stadium" } : null),
};

export async function searchTerrains(p: SearchInput): Promise<Terrain[]> {
  const start = { lat: p.lat, lon: p.lon };
  const R = p.radiusKm * 1000;
  switch (p.kind) {
    case "loop": {
      const ways = waysFromTiles(await area(p.lat, p.lon, loopRadiusKm(p.distanceKm!) * 1000));
      if (!ways.length) throw new TerrainError("Aucun chemin trouvé autour de ce point de départ.");
      return findLoops(buildGraph(ways), start, { distanceKm: p.distanceKm!, gainM: p.gainM ?? null, surface: p.surface ?? "trail" }, elevation);
    }
    case "climb": case "descent": {
      const ways = waysFromTiles(await area(p.lat, p.lon, R + 300));
      if (!ways.length) throw new TerrainError("Aucun chemin trouvé dans ce rayon.");
      const g = buildGraph(ways);
      await nodeAltitudes(g, start, R + 200);
      return findSlopes(g, start, { minLen: p.minLen!, maxLen: p.maxLen!, minGrade: p.minGrade!, maxGrade: p.maxGrade!, radiusKm: p.radiusKm }, p.kind === "climb" ? 1 : -1);
    }
    case "stairs": {
      const steps = within(waysFromTiles(await area(p.lat, p.lon, R)).filter((w) => w.tags?.highway === "steps"), p.lat, p.lon, R);
      return stairsFrom(steps.map((w) => ({ type: "way" as const, id: -w.id, tags: w.tags, geometry: w.geometry })), start, elevation);
    }
    case "track": case "fitness": case "water": {
      const els = poisFromTiles(await area(p.lat, p.lon, R), POI[p.kind]).filter((e) => dist(p.lat, p.lon, e.lat!, e.lon!) <= R).map((e) => ({ ...e, id: -e.id }));
      return placesFrom(p.kind, els, start);
    }
  }
}
