import type { LatLon } from "@/lib/polyline";
import { buildGraph, dist, type Graph, type OsmWay } from "./graph";
import { demElevation } from "./dem";
import { findLoops, findSlopes, placesFrom, stairsFrom, TerrainError, type Elev, type Kind, type OsmEl, type Surface, type Terrain } from "./finders";

/**
 * Recherche de terrains : réseau de chemins et lieux par OpenStreetMap (API Overpass),
 * altitude par les tuiles de terrain ouvertes Terrarium (Mapzen, AWS Open Data).
 * Exécutée sur l’appareil (dans un worker) : les serveurs Overpass publics refusent ou ralentissent
 * les requêtes venant des hébergeurs cloud, et chaque appareil dispose ainsi de son propre quota.
 */
export interface SearchInput {
  kind: Kind; lat: number; lon: number; radiusKm: number;
  distanceKm?: number; gainM?: number | null; surface?: Surface;
  minLen?: number; maxLen?: number; minGrade?: number; maxGrade?: number;
}
// Serveurs Overpass publics ; NEXT_PUBLIC_OVERPASS_URL permet d’utiliser un serveur dédié (usage commercial important).
export const OVERPASS = process.env.NEXT_PUBLIC_OVERPASS_URL ? process.env.NEXT_PUBLIC_OVERPASS_URL.split(",") : [
  "https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
// Altitude : Open-Meteo par défaut ; NEXT_PUBLIC_ELEVATION_URL pour un serveur dédié (même format de réponse).
const ELEVATION = process.env.NEXT_PUBLIC_ELEVATION_URL || "https://api.open-meteo.com/v1/elevation";

async function overpassOne<T>(url: string, query: string, signal: AbortSignal): Promise<T[]> {
  const res = await fetch(url, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }), signal,
  });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  const j = (await res.json()) as { elements?: T[]; remark?: string };
  if (j.remark && /runtime error|out of memory|timed out|too many/i.test(j.remark)) throw new Error(`${new URL(url).host} ${j.remark.slice(0, 80)}`);
  return j.elements ?? [];
}

/**
 * Interroge les serveurs Overpass en « requêtes couvertes » : si le premier tarde, le suivant est lancé
 * sans annuler le premier, et la première réponse valable l’emporte. Une panne fait passer au suivant aussitôt.
 */
export async function overpass<T>(query: string, deadline: number, hedgeMs = 6000): Promise<T[]> {
  const ctrls: AbortController[] = [];
  const errors: string[] = [];
  return new Promise<T[]>((resolve, reject) => {
    let next = 0, pending = 0, done = false;
    const finish = (err: boolean, els?: T[]) => {
      if (done) return;
      done = true; clearTimeout(killer); ctrls.forEach((c) => c.abort());
      if (err) { console.warn("Overpass indisponible", errors.join(" | ")); reject(new TerrainError(typeof navigator !== "undefined" && !navigator.onLine ? "Pas de connexion : la recherche de terrains a besoin du réseau." : "La base de cartes OpenStreetMap est surchargée en ce moment. Réessaie dans quelques minutes.", 503)); }
      else resolve(els!);
    };
    const launch = () => {
      if (done || next >= OVERPASS.length) return;
      const url = OVERPASS[next++], c = new AbortController();
      ctrls.push(c); pending++;
      const hedge = setTimeout(launch, hedgeMs);
      overpassOne<T>(url, query, c.signal).then((els) => finish(false, els)).catch((e) => {
        clearTimeout(hedge); pending--;
        if (!c.signal.aborted) errors.push(e instanceof Error ? e.message : String(e));
        if (next < OVERPASS.length) launch(); else if (pending === 0) finish(true);
      });
    };
    const killer = setTimeout(() => { errors.push("délai dépassé"); finish(true); }, Math.max(3000, deadline - Date.now()));
    launch();
  });
}

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

const HIGHWAYS = "^(path|track|footway|bridleway|steps|pedestrian|cycleway|living_street|residential|unclassified|service)$";
const around = (r: number, lat: number, lon: number) => `(around:${Math.round(r)},${lat.toFixed(5)},${lon.toFixed(5)})`;
const networkQuery = (r: number, lat: number, lon: number) =>
  `[out:json][timeout:25][maxsize:268435456];way${around(r, lat, lon)}[highway~"${HIGHWAYS}"][access!~"^(private|no)$"][foot!~"^(private|no)$"][service!~"^(driveway|parking_aisle|drive-through)$"][area!=yes];out body geom qt;`;

/** Rayon de réseau nécessaire pour une boucle : le tracé s’éloigne d’environ un quart de sa longueur. */
export const loopRadiusKm = (km: number) => Math.min(9, Math.max(1.5, km / 3.4));

export async function searchTerrains(p: SearchInput, deadline = Date.now() + 75000): Promise<Terrain[]> {
  const start = { lat: p.lat, lon: p.lon };
  const R = p.radiusKm * 1000;
  switch (p.kind) {
    case "loop": {
      const ways = await overpass<OsmWay>(networkQuery(loopRadiusKm(p.distanceKm!) * 1000, p.lat, p.lon), deadline);
      if (!ways.length) throw new TerrainError("Aucun chemin trouvé autour de ce point de départ.");
      return findLoops(buildGraph(ways), start, { distanceKm: p.distanceKm!, gainM: p.gainM ?? null, surface: p.surface ?? "trail" }, elevation);
    }
    case "climb": case "descent": {
      const ways = await overpass<OsmWay>(networkQuery(R + 400, p.lat, p.lon), deadline);
      if (!ways.length) throw new TerrainError("Aucun chemin trouvé dans ce rayon.");
      const g = buildGraph(ways);
      await nodeAltitudes(g, start, R + 300);
      return findSlopes(g, start, { minLen: p.minLen!, maxLen: p.maxLen!, minGrade: p.minGrade!, maxGrade: p.maxGrade!, radiusKm: p.radiusKm }, p.kind === "climb" ? 1 : -1);
    }
    case "stairs": {
      const els = await overpass<OsmEl>(`[out:json][timeout:25];way${around(R, p.lat, p.lon)}[highway=steps][access!~"^(private|no)$"];out body geom qt;`, deadline);
      return stairsFrom(els, start, elevation);
    }
    case "track": {
      const a = around(R, p.lat, p.lon);
      return placesFrom("track", await overpass<OsmEl>(`[out:json][timeout:25];(nwr${a}[leisure=track][sport~"athletics|running"];nwr${a}[leisure~"^(sports_centre|stadium)$"][sport~"athletics"];);out center tags qt;`, deadline), start);
    }
    case "fitness": {
      const a = around(R, p.lat, p.lon);
      return placesFrom("fitness", await overpass<OsmEl>(`[out:json][timeout:25];(nwr${a}[leisure=fitness_station];relation${a}[route=fitness_trail];way${a}[route=fitness_trail];);out center tags qt;`, deadline), start);
    }
    case "water": {
      const a = around(R, p.lat, p.lon);
      return placesFrom("water", await overpass<OsmEl>(`[out:json][timeout:25];(node${a}[amenity=drinking_water][access!~"^(private|no)$"];node${a}[amenity=fountain][drinking_water=yes];node${a}[natural=spring][drinking_water=yes];node${a}[amenity=water_point][drinking_water!=no];);out tags qt;`, deadline), start);
    }
  }
}
