/**
 * Chemins et lieux OpenStreetMap lus dans les tuiles vectorielles d’OpenFreeMap (schéma OpenMapTiles, zoom 14).
 * Les tronçons sont découpés aux bords des tuiles puis raccordés, pour former un réseau continu.
 */
import type { OsmWay } from "./graph";
import type { OsmEl } from "./finders";
import { decodeTile, type MvtLayer } from "./mvt";

const TILEJSON = process.env.NEXT_PUBLIC_VECTOR_TILEJSON || "https://tiles.openfreemap.org/planet";
export const Z = 14;
const PARALLEL = 4; // conditions d’utilisation d’OpenFreeMap : 4 requêtes simultanées au plus
export const MAX_TILES = 100;

let template: Promise<string> | null = null;
function tileUrl(): Promise<string> {
  return (template ??= fetch(TILEJSON, { signal: AbortSignal.timeout(12000) })
    .then((r) => { if (!r.ok) throw new Error(`TileJSON ${r.status}`); return r.json(); })
    .then((j: { tiles?: string[] }) => { if (!j.tiles?.[0]) throw new Error("TileJSON vide"); return j.tiles[0]; })
    .catch((e) => { template = null; throw e; }));
}

const lonToX = (lon: number) => ((lon + 180) / 360) * 2 ** Z;
const latToY = (lat: number) => { const s = Math.sin((lat * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** Z; };

/** Tuiles couvrant un cercle (rayon en mètres). */
export function tilesFor(lat: number, lon: number, radiusM: number): [number, number][] {
  const dLat = radiusM / 111320, dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const x0 = Math.floor(lonToX(lon - dLon)), x1 = Math.floor(lonToX(lon + dLon));
  const y0 = Math.floor(latToY(lat + dLat)), y1 = Math.floor(latToY(lat - dLat));
  const out: [number, number][] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([x, y]);
  return out;
}

const cache = new Map<string, Promise<MvtLayer[]>>();
async function fetchTile(x: number, y: number): Promise<MvtLayer[]> {
  const key = `${x}/${y}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const url = (await tileUrl()).replace("{z}", String(Z)).replace("{x}", String(x)).replace("{y}", String(y));
      let last: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
          if (res.status === 204 || res.status === 404) return [];
          if (!res.ok) throw new Error(`Tuile ${res.status}`);
          return decodeTile(new Uint8Array(await res.arrayBuffer()), new Set(["transportation", "transportation_name", "poi"]));
        } catch (e) { last = e; await new Promise((r) => setTimeout(r, 400 * (attempt + 1))); }
      }
      cache.delete(key);
      throw last;
    })();
    cache.set(key, p);
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
  }
  return p;
}

export async function loadTiles(tiles: [number, number][], progress?: (done: number, total: number) => void): Promise<{ x: number; y: number; layers: MvtLayer[] }[]> {
  const out: { x: number; y: number; layers: MvtLayer[] }[] = [];
  let i = 0;
  const worker = async () => { while (i < tiles.length) { const [x, y] = tiles[i++]; out.push({ x, y, layers: await fetchTile(x, y) }); progress?.(out.length, tiles.length); } };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, tiles.length) }, worker));
  return out;
}

// ---------- Réseau de chemins ----------
const PATHS: Record<string, string> = { path: "path", footway: "footway", cycleway: "cycleway", steps: "steps", bridleway: "bridleway", pedestrian: "pedestrian" };
/** Type de voie OSM reconstitué à partir des classes OpenMapTiles ; null = non praticable à pied ou trop fréquenté. */
function highwayOf(t: Record<string, string | number | boolean>): string | null {
  if (t.access === "no" || t.foot === "no" || t.foot === "private" || t.indoor === 1 || String(t.class).endsWith("_construction")) return null;
  switch (t.class) {
    case "path": return PATHS[String(t.subclass)] ?? null;
    case "track": return "track";
    case "minor": return "residential";
    case "tertiary": return "tertiary";
    case "secondary": return "secondary";
    case "service": return t.service === "driveway" || t.service === "parking_aisle" ? null : "service";
    default: return null;
  }
}

type Pt = [number, number];
/** Découpe une ligne au carré de la tuile [0, E] × [0, E] (algorithme de Liang–Barsky, segment par segment). */
function clip(line: Pt[], E: number): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] | null = null;
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1];
    const [x1, y1] = line[i];
    let t0 = 0, t1 = 1;
    const dx = x1 - x0, dy = y1 - y0;
    let ok = true;
    for (const [p, q] of [[-dx, x0], [dx, E - x0], [-dy, y0], [dy, E - y0]]) {
      if (p === 0) { if (q < 0) { ok = false; break; } continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; }
      else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
    }
    if (!ok) { cur = null; continue; }
    const a: Pt = [x0 + t0 * dx, y0 + t0 * dy], b: Pt = [x0 + t1 * dx, y0 + t1 * dy];
    if (!cur || t0 > 0) { cur = [a]; out.push(cur); }
    cur.push(b);
    if (t1 < 1) cur = null;
  }
  return out.filter((l) => l.length >= 2);
}

/** Construit des « voies » au format OSM (nœuds numérotés, géométrie, tags) à partir des tuiles. */
export function waysFromTiles(tiles: { x: number; y: number; layers: MvtLayer[] }[]): OsmWay[] {
  type Raw = { pts: Pt[]; tags: Record<string, string>; brunnel: boolean };
  const raws: Raw[] = [];
  const names = new Map<string, string>();
  let E = 4096;
  for (const t of tiles) {
    for (const layer of t.layers) {
      if (layer.name !== "transportation" && layer.name !== "transportation_name") continue;
      E = layer.extent;
      const ox = t.x * E, oy = t.y * E;
      for (const f of layer.features) {
        if (f.type !== 2) continue;
        if (layer.name === "transportation_name") {
          const n = f.tags["name:fr"] ?? f.tags.name;
          if (typeof n === "string" && n) for (const l of f.lines) for (const [x, y] of l) names.set(`${Math.round(ox + x)}:${Math.round(oy + y)}`, n);
          continue;
        }
        const hw = highwayOf(f.tags);
        if (!hw) continue;
        const tags: Record<string, string> = { highway: hw };
        if (f.tags.surface === "paved") tags.surface = "asphalt";
        else if (f.tags.surface === "unpaved") tags.surface = "ground";
        if (typeof f.tags.mtb_scale === "string" && Number(f.tags.mtb_scale) >= 2) tags.sac_scale = "mountain_hiking";
        const brunnel = f.tags.brunnel === "bridge" || f.tags.brunnel === "tunnel";
        for (const l of f.lines) for (const c of clip(l, E)) raws.push({ pts: c.map(([x, y]) => [ox + x, oy + y] as Pt), tags, brunnel });
      }
    }
  }
  snapJunctions(raws);
  // Raccord des points : sommets identiques d’une tuile à l’autre ; points de coupe rapprochés le long des bords.
  const ids = new Map<string, number>();
  const border = new Map<string, { v: number; id: number }[]>();
  const parent: number[] = [];
  const find = (a: number): number => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  const idOf = (x: number, y: number): number => {
    const onX = Math.abs(x / E - Math.round(x / E)) < 1e-6, onY = Math.abs(y / E - Math.round(y / E)) < 1e-6;
    const k = `${Math.round(x)}:${Math.round(y)}`;
    let id = ids.get(k);
    if (id === undefined) {
      id = parent.push(parent.length) - 1; ids.set(k, id);
      if (onX !== onY) {
        const b = onX ? `x${Math.round(x)}` : `y${Math.round(y)}`;
        const list = border.get(b) ?? []; list.push({ v: onX ? y : x, id }); border.set(b, list);
      }
    }
    return id;
  };
  const nodeLists = raws.map((r) => r.pts.map(([x, y]) => idOf(x, y)));
  for (const list of border.values()) {
    list.sort((a, b) => a.v - b.v);
    for (let i = 1; i < list.length; i++) if (list[i].v - list[i - 1].v <= 6) parent[find(list[i].id)] = find(list[i - 1].id);
  }
  const n = 2 ** Z;
  return raws.map((r, k) => {
    // Nom : celui qui revient le plus souvent sur les sommets du tronçon.
    const count = new Map<string, number>();
    for (const [x, y] of r.pts) { const nm = names.get(`${Math.round(x)}:${Math.round(y)}`); if (nm) count.set(nm, (count.get(nm) ?? 0) + 1); }
    const name = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      id: k + 1,
      nodes: nodeLists[k].map(find),
      geometry: r.pts.map(([x, y]) => ({ lon: (x / (E * n)) * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / (E * n)))) * 180) / Math.PI })),
      tags: name ? { ...r.tags, name } : r.tags,
    };
  });
}

/**
 * Les tuiles simplifient les tracés : un carrefour situé sur une portion droite peut disparaître d’une des deux lignes,
 * et le sentier qui y débouche ne touche plus la route. On recolle chaque bout de ligne (jusqu’à ~5 m) et chaque
 * sommet posé sur une autre ligne (~1 m) en insérant le point manquant. Ponts et tunnels ne sont raccordés qu’à leurs extrémités.
 */
function snapJunctions(raws: { pts: Pt[]; brunnel: boolean }[]) {
  const CELL = 48, END_TOL = 12, MID_TOL = 2.5;
  const grid = new Map<string, number[]>(); // paires (tronçon, segment) à plat
  const cellKey = (cx: number, cy: number) => `${cx}:${cy}`;
  raws.forEach((r, ri) => {
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const [ax, ay] = r.pts[i], [bx, by] = r.pts[i + 1];
      for (let cx = Math.floor((Math.min(ax, bx) - END_TOL) / CELL); cx <= Math.floor((Math.max(ax, bx) + END_TOL) / CELL); cx++)
        for (let cy = Math.floor((Math.min(ay, by) - END_TOL) / CELL); cy <= Math.floor((Math.max(ay, by) + END_TOL) / CELL); cy++) {
          const k = cellKey(cx, cy), l = grid.get(k);
          if (l) l.push(ri, i); else grid.set(k, [ri, i]);
        }
    }
  });
  const inserts = new Map<number, { seg: number; t: number; p: Pt }[]>();
  raws.forEach((r, ri) => {
    const last = r.pts.length - 1;
    r.pts.forEach((p, k) => {
      const isEnd = k === 0 || k === last;
      if (!isEnd && r.brunnel) return;
      const tol = isEnd ? END_TOL : MID_TOL;
      const cand = grid.get(cellKey(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL)));
      if (!cand) return;
      let best = -1, bt = 0, bd = tol;
      for (let c = 0; c < cand.length; c += 2) {
        const rj = cand[c], sj = cand[c + 1];
        if (rj === ri || (!isEnd && raws[rj].brunnel)) continue;
        const [ax, ay] = raws[rj].pts[sj], [bx, by] = raws[rj].pts[sj + 1];
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        const t = L ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L)) : 0;
        const d = Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy));
        if (d < bd) { bd = d; best = c; bt = t; }
      }
      if (best < 0) return;
      const rj = cand[best], sj = cand[best + 1];
      const q = bt <= 0 ? raws[rj].pts[sj] : bt >= 1 ? raws[rj].pts[sj + 1] : null;
      if (q) { if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.5) r.pts[k] = [q[0], q[1]]; return; } // colle au sommet existant
      const list = inserts.get(rj) ?? [];
      list.push({ seg: sj, t: bt, p: [p[0], p[1]] });
      inserts.set(rj, list);
    });
  });
  for (const [rj, list] of inserts) {
    list.sort((a, b) => a.seg - b.seg || a.t - b.t);
    const pts = raws[rj].pts, out: Pt[] = [];
    let n = 0;
    for (let i = 0; i < pts.length; i++) {
      out.push(pts[i]);
      while (n < list.length && list[n].seg === i) out.push(list[n++].p);
    }
    raws[rj].pts = out;
  }
}

// ---------- Lieux ----------
/** Lieux du calque « poi », convertis au format des éléments OSM attendu par les recherches. */
export function poisFromTiles(tiles: { x: number; y: number; layers: MvtLayer[] }[], match: (cls: string, sub: string) => Record<string, string> | null): OsmEl[] {
  const out: OsmEl[] = [];
  let id = 1;
  for (const t of tiles) for (const layer of t.layers) {
    if (layer.name !== "poi") continue;
    const E = layer.extent, n = 2 ** Z;
    for (const f of layer.features) {
      const tags = match(String(f.tags.class ?? ""), String(f.tags.subclass ?? ""));
      const p = f.lines[0]?.[0];
      if (!tags || !p) continue;
      const gx = t.x * E + p[0], gy = t.y * E + p[1];
      if (p[0] < 0 || p[1] < 0 || p[0] > E || p[1] > E) continue; // doublon de la tuile voisine
      const name = f.tags["name:fr"] ?? f.tags.name;
      out.push({ type: "node", id: id++, lon: (gx / (E * n)) * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * gy) / (E * n)))) * 180) / Math.PI, tags: { ...tags, ...(typeof name === "string" && name ? { name } : {}) } });
    }
  }
  return out;
}
