/**
 * Réseau de chemins construit à partir d’OpenStreetMap : nœuds, tronçons et plus courts chemins.
 * Pur calcul (pas d’accès réseau), testable hors ligne.
 */
import type { LatLon } from "@/lib/polyline";

export interface OsmWay { id: number; nodes: number[]; geometry: { lat: number; lon: number }[]; tags?: Record<string, string> }
export interface WayInfo { id: number; name: string | null; highway: string; surface: string | null; sac: string | null; trail: boolean }

export interface Graph {
  n: number; lat: Float64Array; lon: Float64Array; z: Float64Array | null;
  /** Pour chaque nœud : indices des demi-tronçons qui en partent. */
  adj: number[][];
  /** Demi-tronçon i : de eFrom[i] vers eTo[i] ; le tronçon physique est i >> 1. */
  eFrom: Int32Array; eTo: Int32Array; eLen: Float64Array; eWay: Int32Array;
  ways: WayInfo[];
}

const R = 6371008.8;
const rad = Math.PI / 180;
export function dist(aLat: number, aLon: number, bLat: number, bLon: number) {
  const dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
/** Point à `m` mètres dans la direction `bearing` (degrés, 0 = nord). */
export function offset(lat: number, lon: number, m: number, bearing: number): LatLon {
  const b = bearing * rad, d = m / R, l1 = lat * rad, g1 = lon * rad;
  const l2 = Math.asin(Math.sin(l1) * Math.cos(d) + Math.cos(l1) * Math.sin(d) * Math.cos(b));
  const g2 = g1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(l1), Math.cos(d) - Math.sin(l1) * Math.sin(l2));
  return [l2 / rad, g2 / rad];
}

const TRAIL = new Set(["path", "track", "bridleway", "footway", "steps"]);
export const ROADLIKE = new Set(["residential", "unclassified", "service", "living_street", "tertiary"]);

export function buildGraph(ways: OsmWay[]): Graph {
  const idx = new Map<number, number>();
  const lat: number[] = [], lon: number[] = [];
  const eFrom: number[] = [], eTo: number[] = [], eLen: number[] = [], eWay: number[] = [];
  const info: WayInfo[] = [];
  for (const w of ways) {
    if (!w.nodes || !w.geometry || w.nodes.length !== w.geometry.length || w.nodes.length < 2) continue;
    const t = w.tags ?? {};
    const wi = info.push({ id: w.id, name: t.name ?? t["name:fr"] ?? null, highway: t.highway ?? "path", surface: t.surface ?? null, sac: t.sac_scale ?? null, trail: TRAIL.has(t.highway ?? "") && !/^(asphalt|paved|concrete)/.test(t.surface ?? "") }) - 1;
    let prev = -1;
    for (let k = 0; k < w.nodes.length; k++) {
      const g = w.geometry[k];
      if (!g || !Number.isFinite(g.lat)) { prev = -1; continue; }
      let i = idx.get(w.nodes[k]);
      if (i === undefined) { i = lat.push(g.lat) - 1; lon.push(g.lon); idx.set(w.nodes[k], i); }
      if (prev >= 0 && prev !== i) {
        const l = dist(lat[prev], lon[prev], lat[i], lon[i]);
        eFrom.push(prev, i); eTo.push(i, prev); eLen.push(l, l); eWay.push(wi, wi);
      }
      prev = i;
    }
  }
  const n = lat.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let e = 0; e < eFrom.length; e++) adj[eFrom[e]].push(e);
  return {
    n, lat: Float64Array.from(lat), lon: Float64Array.from(lon), z: null, adj,
    eFrom: Int32Array.from(eFrom), eTo: Int32Array.from(eTo), eLen: Float64Array.from(eLen), eWay: Int32Array.from(eWay), ways: info,
  };
}

/** Plus grande composante connexe autour d’un nœud : évite de partir d’un bout de sentier isolé. */
export function componentOf(g: Graph, start: number): Uint8Array {
  const seen = new Uint8Array(g.n), stack = [start];
  seen[start] = 1;
  while (stack.length) { const u = stack.pop()!; for (const e of g.adj[u]) { const v = g.eTo[e]; if (!seen[v]) { seen[v] = 1; stack.push(v); } } }
  return seen;
}

export function nearestNode(g: Graph, lat: number, lon: number, within?: Uint8Array): { i: number; d: number } {
  let best = -1, bd = Infinity;
  const cos = Math.cos(lat * rad);
  for (let i = 0; i < g.n; i++) {
    if (!g.adj[i].length || (within && !within[i])) continue;
    const dy = g.lat[i] - lat, dx = (g.lon[i] - lon) * cos, d = dy * dy + dx * dx;
    if (d < bd) { bd = d; best = i; }
  }
  return { i: best, d: best < 0 ? Infinity : dist(lat, lon, g.lat[best], g.lon[best]) };
}

/** Plus court chemin (Dijkstra, tas binaire) avec un coût par demi-tronçon. Renvoie la liste des demi-tronçons. */
export function shortest(g: Graph, src: number, dst: number, cost: (e: number) => number, maxCost = Infinity): number[] | null {
  if (src === dst) return [];
  const d = new Float64Array(g.n).fill(Infinity), via = new Int32Array(g.n).fill(-1);
  const heap: number[] = [], key: number[] = [];
  const push = (v: number, k: number) => {
    heap.push(v); key.push(k);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (key[p] <= key[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [key[p], key[i]] = [key[i], key[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], tk = key[0], lv = heap.pop()!, lk = key.pop()!;
    if (heap.length) {
      heap[0] = lv; key[0] = lk;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && key[l] < key[m]) m = l;
        if (r < heap.length && key[r] < key[m]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; [key[m], key[i]] = [key[i], key[m]]; i = m;
      }
    }
    return [top, tk] as const;
  };
  d[src] = 0; push(src, 0);
  while (heap.length) {
    const [u, k] = pop();
    if (k > d[u]) continue;
    if (u === dst) break;
    if (k > maxCost) return null;
    for (const e of g.adj[u]) {
      const v = g.eTo[e], nk = k + cost(e);
      if (nk < d[v]) { d[v] = nk; via[v] = e; push(v, nk); }
    }
  }
  if (!Number.isFinite(d[dst])) return null;
  const path: number[] = [];
  for (let v = dst; v !== src; v = g.eFrom[via[v]]) path.push(via[v]);
  return path.reverse();
}

/** Points d’un itinéraire (suite de demi-tronçons). */
export function pathPoints(g: Graph, edges: number[], start: number): LatLon[] {
  const pts: LatLon[] = [[g.lat[start], g.lon[start]]];
  for (const e of edges) pts.push([g.lat[g.eTo[e]], g.lon[g.eTo[e]]]);
  return pts;
}

/** Ré-échantillonne une ligne tous les `step` mètres (pour l’altitude). */
export function resample(pts: LatLon[], step: number): { pts: LatLon[]; at: number[] } {
  const out: LatLon[] = [pts[0]], at = [0];
  let carry = 0, total = 0;
  for (let i = 1; i < pts.length; i++) {
    const [aLat, aLon] = pts[i - 1], [bLat, bLon] = pts[i];
    const l = dist(aLat, aLon, bLat, bLon);
    let pos = step - carry;
    while (pos <= l) { const f = pos / l; out.push([aLat + (bLat - aLat) * f, aLon + (bLon - aLon) * f]); at.push(total + pos); pos += step; }
    carry = l - (pos - step); total += l;
  }
  if (total - at[at.length - 1] > step * 0.3) { out.push(pts[pts.length - 1]); at.push(total); }
  return { pts: out, at };
}

/** Dénivelés positif et négatif avec un seuil d’hystérésis pour filtrer le bruit du modèle de terrain. */
export function gainLoss(z: number[], threshold = 2): { gain: number; loss: number } {
  let gain = 0, loss = 0, ref = z[0];
  for (const v of z) {
    if (v - ref >= threshold) { gain += v - ref; ref = v; }
    else if (ref - v >= threshold) { loss += ref - v; ref = v; }
  }
  return { gain, loss };
}
