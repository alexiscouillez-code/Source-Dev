/**
 * Recherche de terrains d’entraînement dans le réseau de chemins :
 * boucles à distance et D+ visés, côtes et descentes, et lieux ponctuels (pistes, escaliers, agrès, eau).
 * Pur calcul : l’altitude est fournie par une fonction injectée.
 */
import { decodePolyline, encodePolyline, thin, type LatLon } from "@/lib/polyline";
import { astar, componentOf, contract, dist, gainLoss, nearestNode, offset, pathPoints, resample, ROADLIKE, type Graph } from "./graph";

export type Kind = "loop" | "climb" | "descent" | "track" | "stairs" | "fitness" | "water";
export const KINDS: Kind[] = ["loop", "climb", "descent", "track", "stairs", "fitness", "water"];
export type Surface = "trail" | "mixed" | "any";

export interface Terrain {
  id: string; kind: Kind; source: "osm" | "mine";
  name: string; detail: string; tags: string[];
  lat: number; lon: number; fromStartKm: number;
  poly: string | null; distanceKm: number | null; gainM: number | null; lossM: number | null;
  grade: number | null; maxGrade: number | null; trailShare: number | null;
  profile: [number, number][] | null; osm: string | null;
}
export type Elev = (pts: LatLon[]) => Promise<number[]>;

export class TerrainError extends Error { constructor(message: string, public status = 422) { super(message); } }

const r1 = (n: number) => Math.round(n * 10) / 10;
const fmtKm = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace(".", ",")} km` : `${Math.round(m / 10) * 10} m`);

const HW: Record<string, string> = {
  path: "Sentier", track: "Chemin", bridleway: "Chemin", footway: "Allée piétonne", steps: "Escaliers", pedestrian: "Zone piétonne",
  cycleway: "Voie verte", residential: "Petite route", unclassified: "Petite route", service: "Voie de desserte", living_street: "Rue calme", tertiary: "Route", secondary: "Route départementale",
};
const SURF: Record<string, string> = {
  ground: "terre", dirt: "terre", earth: "terre", grass: "herbe", gravel: "gravier", fine_gravel: "gravier fin", compacted: "stabilisé", rock: "roche",
  stone: "pierre", pebblestone: "galets", sand: "sable", asphalt: "bitume", paved: "bitume", concrete: "béton", wood: "bois", unpaved: "non revêtu",
};
const SAC: Record<string, string> = { hiking: "facile", mountain_hiking: "montagne", demanding_mountain_hiking: "montagne exigeant", alpine_hiking: "alpin" };

/** Coût relatif d’un tronçon selon la préférence de terrain. */
function costFn(g: Graph, surface: Surface) {
  const m = new Float64Array(g.ways.length);
  g.ways.forEach((w, i) => {
    const road = ROADLIKE.has(w.highway);
    m[i] = w.trail ? (w.highway === "steps" ? 1.4 : w.highway === "footway" ? 1.15 : 1)
      : road ? (surface === "trail" ? 2.8 : surface === "mixed" ? 1.5 : 1.05) * (w.highway === "secondary" ? 1.8 : w.highway === "tertiary" ? 1.3 : 1)
        : 1.3;
    if (surface === "any") m[i] = Math.min(m[i], w.highway === "secondary" ? 1.6 : 1.2);
  });
  return (e: number) => g.eLen[e] * m[g.eWay[e]];
}

function mainName(g: Graph, edges: number[]): string | null {
  const len = new Map<string, number>();
  for (const e of edges) { const n = g.ways[g.eWay[e]].name; if (n) len.set(n, (len.get(n) ?? 0) + g.eLen[e]); }
  let best: string | null = null, bl = 0;
  for (const [n, l] of len) if (l > bl) { bl = l; best = n; }
  return best;
}
function trailShare(g: Graph, edges: number[]) {
  let t = 0, all = 0;
  for (const e of edges) { all += g.eLen[e]; if (g.ways[g.eWay[e]].trail) t += g.eLen[e]; }
  return all ? t / all : 0;
}
function profileOf(at: number[], z: number[]): [number, number][] {
  const n = Math.min(48, at.length), out: [number, number][] = [];
  for (let k = 0; k < n; k++) { const i = Math.round((k * (at.length - 1)) / Math.max(1, n - 1)); out.push([Math.round(at[i]) / 1000, Math.round(z[i])]); }
  return out;
}
/** Pente maximale moyenne sur une fenêtre glissante (en %). */
function maxGradeOf(at: number[], z: number[], dir: 1 | -1, win = 100) {
  let best = 0, j = 0;
  for (let i = 0; i < at.length; i++) {
    while (at[i] - at[j] > win) j++;
    if (at[i] - at[j] >= win * 0.6) best = Math.max(best, (dir * (z[i] - z[j])) / (at[i] - at[j]));
  }
  return Math.round(best * 100);
}
function surfaceTags(g: Graph, edges: number[]): string[] {
  const hw = new Map<string, number>(), sf = new Map<string, number>();
  let sac: string | null = null;
  for (const e of edges) {
    const w = g.ways[g.eWay[e]], l = g.eLen[e];
    const h = HW[w.highway] ?? "Chemin"; hw.set(h, (hw.get(h) ?? 0) + l);
    if (w.surface && SURF[w.surface]) sf.set(SURF[w.surface], (sf.get(SURF[w.surface]) ?? 0) + l);
    if (w.sac && SAC[w.sac]) sac = SAC[w.sac];
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return [top(hw), top(sf), sac ? `Difficulté : ${sac}` : undefined].filter((x): x is string => !!x);
}

// ---------- Boucles ----------
/** Point de départ sur le réseau principal : le nœud le plus proche appartenant à un grand ensemble de chemins reliés. */
function mainStart(g: Graph, start: { lat: number; lon: number }): { i: number; d: number } {
  const label = new Int32Array(g.n).fill(-1), sizes: number[] = [];
  for (let i = 0; i < g.n; i++) {
    if (label[i] >= 0 || !g.adj[i].length) continue;
    const id = sizes.length, stack = [i];
    let n = 0;
    label[i] = id;
    while (stack.length) { const u = stack.pop()!; n++; for (const e of g.adj[u]) { const v = g.eTo[e]; if (label[v] < 0) { label[v] = id; stack.push(v); } } }
    sizes.push(n);
  }
  const big = Math.max(0, ...sizes);
  const near = nearestNode(g, start.lat, start.lon);
  if (near.i < 0 || sizes[label[near.i]] >= big * 0.3) return near;
  const mask = new Uint8Array(g.n);
  for (let i = 0; i < g.n; i++) if (label[i] >= 0 && sizes[label[i]] >= big * 0.3) mask[i] = 1;
  const alt = nearestNode(g, start.lat, start.lon, mask);
  return alt.i >= 0 && alt.d - near.d < 400 ? alt : near;
}

export async function findLoops(g: Graph, start: { lat: number; lon: number }, p: { distanceKm: number; gainM: number | null; surface: Surface }, elev: Elev): Promise<Terrain[]> {
  const s = mainStart(g, start);
  if (s.i < 0 || s.d > 700) throw new TerrainError("Aucun chemin trouvé près de ce point de départ. Choisis un départ plus proche d’un sentier ou d’une route.");
  const comp = componentOf(g, s.i);
  const D = p.distanceKm * 1000;
  const base = costFn(g, p.surface);
  // Calculs sur le réseau réduit aux carrefours : bien plus rapide sur un téléphone.
  const net = contract(g, [s.i]);
  const ccost = net.chains.map((ch) => ch.edges.reduce((a, e) => a + base(e), 0));
  const jmask = new Uint8Array(g.n);
  for (let i = 0; i < g.n; i++) if (comp[i] && net.isJ[i] && net.out[i]?.length) jmask[i] = 1;
  type Cand = { edges: number[]; len: number; reuse: number; trail: number; score: number };
  const cands: Cand[] = [], all: Cand[] = [];

  const loopFrom = (r: number, bearing: number): Cand | null => {
    const a = offset(start.lat, start.lon, r, bearing - 30), b = offset(start.lat, start.lon, r, bearing + 30);
    const na = nearestNode(g, a[0], a[1], jmask).i, nb = nearestNode(g, b[0], b[1], jmask).i;
    if (na < 0 || nb < 0 || na === nb || na === s.i || nb === s.i) return null;
    const used = new Set<number>();
    const cost = (ci: number) => ccost[ci] * (used.has(net.chains[ci].id) ? 4 : 1);
    const edges: number[] = [];
    for (const [u, v] of [[s.i, na], [na, nb], [nb, s.i]] as const) {
      // Pas de plafond de coût : un accès unique par la route doit rester possible (retour par le même chemin).
      const leg = astar(g, net, u, v, cost);
      if (!leg) return null;
      for (const ci of leg) { used.add(net.chains[ci].id); for (const e of net.chains[ci].edges) edges.push(e); }
    }
    let len = 0, again = 0;
    const seen = new Set<number>();
    for (const e of edges) { len += g.eLen[e]; if (seen.has(e >> 1)) again += g.eLen[e]; else seen.add(e >> 1); }
    if (len < 300) return null;
    const reuse = again / len, trail = trailShare(g, edges);
    const score = Math.abs(len - D) / D + reuse * 1.6 + (p.surface === "trail" ? (1 - trail) * 0.7 : p.surface === "mixed" ? (1 - trail) * 0.2 : 0);
    return { edges, len, reuse, trail, score };
  };

  for (let bearing = 0; bearing < 360; bearing += 45) {
    let r = D / 3.75, best: Cand | null = null;
    for (let it = 0; it < 3; it++) {
      const c = loopFrom(r, bearing);
      if (!c) break;
      if (!best || Math.abs(c.len - D) < Math.abs(best.len - D)) best = c;
      const off = c.len / D;
      if (Math.abs(off - 1) < 0.1) break;
      r *= Math.min(1.6, Math.max(0.6, 1 / off));
    }
    if (best) all.push(best);
    if (best && Math.abs(best.len - D) / D < 0.3) cands.push(best);
  }
  // Rien d’assez proche : on propose quand même les boucles les plus proches de la distance demandée.
  let approx = false;
  if (!cands.length) { cands.push(...all.filter((c) => Math.abs(c.len - D) / D < 0.6)); approx = cands.length > 0; }
  if (!cands.length) throw new TerrainError("Pas de boucle de cette distance avec les chemins du secteur. Essaie une autre distance ou un autre départ.");

  // Garde des boucles vraiment différentes.
  cands.sort((x, y) => x.score - y.score);
  const kept: Cand[] = [], sets: Set<number>[] = [];
  for (const c of cands) {
    const set = new Set(c.edges.map((e) => e >> 1));
    if (sets.some((o) => { let inter = 0; for (const k of set) if (o.has(k)) inter++; return inter / Math.min(set.size, o.size) > 0.55; })) continue;
    kept.push(c); sets.push(set);
    if (kept.length >= 6) break;
  }

  const out: (Terrain & { _score: number })[] = [];
  for (const c of kept) {
    const pts = pathPoints(g, c.edges, s.i);
    const { pts: sp, at } = resample(pts, Math.max(40, c.len / 250));
    let z: number[] | null = null;
    try { z = await elev(sp); } catch { z = null; }
    const gl = z ? gainLoss(z) : null;
    const gain = gl ? Math.round(gl.gain) : null;
    const gScore = p.gainM != null && gain != null ? (Math.abs(gain - p.gainM) / Math.max(p.gainM, 120)) * 0.8 : 0;
    const name = mainName(g, c.edges);
    const km = r1(c.len / 1000);
    out.push({
      _score: c.score + gScore,
      id: `loop-${c.edges[0]}-${c.edges.length}`, kind: "loop", source: "osm",
      name: name ? `Boucle par ${name}` : `Boucle de ${String(km).replace(".", ",")} km`,
      detail: [approx ? `${c.len < D ? "plus courte" : "plus longue"} que demandé : le réseau du secteur ne permet pas mieux` : null, `${Math.round(c.trail * 100)} % de sentiers et chemins`, c.reuse > 0.12 ? "repasse en partie par le même chemin" : null].filter(Boolean).join(" · "),
      tags: surfaceTags(g, c.edges), lat: g.lat[s.i], lon: g.lon[s.i], fromStartKm: r1(s.d / 1000),
      poly: encodePolyline(thin(pts, 700)), distanceKm: km, gainM: gain, lossM: gl ? Math.round(gl.loss) : null,
      grade: null, maxGrade: z ? maxGradeOf(at, z, 1) : null, trailShare: Math.round(c.trail * 100) / 100,
      profile: z ? profileOf(at, z) : null, osm: null,
    });
  }
  const best = out.sort((a, b) => a._score - b._score).slice(0, 4).map(({ _score, ...t }) => (void _score, t));
  // Deux boucles du même nom : on précise la direction dans laquelle chacune part.
  const DIRS = ["nord", "nord-est", "est", "sud-est", "sud", "sud-ouest", "ouest", "nord-ouest"];
  for (const t of best) {
    if (best.filter((o) => o.name === t.name).length < 2) continue;
    const pts = decodePolyline(t.poly!);
    const cLat = pts.reduce((a, p) => a + p[0], 0) / pts.length, cLon = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const brg = (Math.atan2((cLon - start.lon) * Math.cos((start.lat * Math.PI) / 180), cLat - start.lat) * 180) / Math.PI;
    t.name = `${t.name}, côté ${DIRS[Math.round(((brg + 360) % 360) / 45) % 8]}`;
  }
  return best;
}

// ---------- Côtes et descentes ----------
export interface SlopeParams { minLen: number; maxLen: number; minGrade: number; maxGrade: number; radiusKm: number }

/** Nécessite l’altitude des nœuds (g.z). dir = 1 pour une côte, -1 pour une descente. */
export function findSlopes(g: Graph, start: { lat: number; lon: number }, p: SlopeParams, dir: 1 | -1): Terrain[] {
  const z = g.z;
  if (!z) throw new Error("Altitudes manquantes");
  const lo = p.minGrade / 100, hi = p.maxGrade / 100, target = (lo + hi) / 2, R = p.radiusKm * 1000;
  const inside: number[] = [];
  for (let i = 0; i < g.n; i++) if (g.adj[i].length && Number.isFinite(z[i]) && dist(start.lat, start.lon, g.lat[i], g.lon[i]) <= R) inside.push(i);
  if (!inside.length) throw new TerrainError("Aucun chemin trouvé dans ce rayon. Agrandis la zone ou change de point de départ.");
  const step = Math.max(1, Math.floor(inside.length / 14000));
  const stamp = new Int32Array(g.n);
  type C = { edges: number[]; start: number; len: number; rise: number; score: number; nodes: number[] };
  const cands: C[] = [];
  let walk = 0;
  for (let k = 0; k < inside.length; k += step) {
    const s0 = inside[k];
    walk++;
    let cur = s0, len = 0, prevWay = -1;
    stamp[cur] = walk;
    const edges: number[] = [], lens: number[] = [];
    while (len < p.maxLen) {
      let best = -1, bs = -Infinity;
      for (const e of g.adj[cur]) {
        const v = g.eTo[e];
        if (stamp[v] === walk || !Number.isFinite(z[v])) continue;
        const l = g.eLen[e];
        const gr = l > 0.5 ? (dir * (z[v] - z[cur])) / l : target;
        if (gr < lo * 0.35 || gr > hi * 1.6) continue;
        const sc = -Math.abs(gr - target) + (g.eWay[e] === prevWay ? 0.025 : 0) + (g.ways[g.eWay[e]].trail ? 0.01 : 0);
        if (sc > bs) { bs = sc; best = e; }
      }
      if (best < 0) break;
      edges.push(best); len += g.eLen[best]; lens.push(len);
      prevWay = g.eWay[best]; cur = g.eTo[best]; stamp[cur] = walk;
    }
    if (len < p.minLen) continue;
    // Plus long début de parcours dont la pente moyenne est dans la plage demandée.
    let bestK = -1;
    for (let m = edges.length - 1; m >= 0; m--) {
      const L = lens[m];
      if (L > p.maxLen) continue;
      if (L < p.minLen) break;
      const rise = dir * (z[g.eTo[edges[m]]] - z[s0]), avg = rise / L;
      if (avg >= lo && avg <= hi) { bestK = m; break; }
    }
    if (bestK < 0) continue;
    const es = edges.slice(0, bestK + 1), L = lens[bestK], rise = dir * (z[g.eTo[es[es.length - 1]]] - z[s0]);
    // Régularité : écart des pentes par tranches de 50 m.
    const gr: number[] = [];
    let acc = 0, h0 = z[s0];
    for (const e of es) { acc += g.eLen[e]; if (acc >= 50) { gr.push((dir * (z[g.eTo[e]] - h0)) / acc); acc = 0; h0 = z[g.eTo[e]]; } }
    const mean = gr.reduce((a, b) => a + b, 0) / Math.max(1, gr.length);
    const sd = Math.sqrt(gr.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, gr.length));
    const trail = trailShare(g, es);
    const tech = dir === -1 ? es.reduce((a, e) => { const w = g.ways[g.eWay[e]]; return a + (w.highway === "path" || w.sac ? g.eLen[e] : 0); }, 0) / L : 0;
    const score = (L / p.maxLen) * 0.8 + (1 - Math.min(1, sd / Math.max(0.02, mean))) * 0.8 + (1 - Math.abs(rise / L - target) / Math.max(0.01, (hi - lo) / 2)) * 0.5 + trail * 0.3 + tech * 0.5;
    cands.push({ edges: es, start: s0, len: L, rise, score, nodes: [s0, ...es.map((e) => g.eTo[e])] });
  }
  if (!cands.length) throw new TerrainError(dir === 1 ? "Aucune côte de ce type dans le secteur. Essaie une pente plus douce, une longueur plus courte ou un rayon plus grand." : "Aucune descente de ce type dans le secteur. Essaie une pente plus douce ou un rayon plus grand.");
  cands.sort((a, b) => b.score - a.score);
  const used = new Uint8Array(g.n), kept: C[] = [];
  for (const c of cands) {
    let o = 0; for (const v of c.nodes) if (used[v]) o++;
    if (o / c.nodes.length > 0.25) continue;
    // Pas deux fois la même pente vue depuis deux départs voisins.
    if (kept.some((k) => dist(g.lat[k.start], g.lon[k.start], g.lat[c.start], g.lon[c.start]) < 250)) continue;
    for (const v of c.nodes) used[v] = 1;
    kept.push(c);
    if (kept.length >= 6) break;
  }
  return kept.map((c) => {
    const pts = pathPoints(g, c.edges, c.start);
    const at = [0], zz = [z[c.start]];
    for (const e of c.edges) { at.push(at[at.length - 1] + g.eLen[e]); zz.push(z[g.eTo[e]]); }
    const pct = Math.round((c.rise / c.len) * 1000) / 10;
    const name = mainName(g, c.edges);
    const label = `${dir === 1 ? "Côte" : "Descente"} de ${fmtKm(c.len)} à ${String(pct).replace(".", ",")} %`;
    return {
      id: `${dir === 1 ? "climb" : "descent"}-${c.start}-${c.edges.length}`, kind: dir === 1 ? "climb" : "descent", source: "osm",
      name: name ? `${label} · ${name}` : label,
      detail: `${dir === 1 ? "+" : "−"}${Math.round(c.rise)} m sur ${fmtKm(c.len)}, pente la plus forte ${maxGradeOf(at, zz, dir)} %`,
      tags: surfaceTags(g, c.edges), lat: g.lat[c.start], lon: g.lon[c.start], fromStartKm: r1(dist(start.lat, start.lon, g.lat[c.start], g.lon[c.start]) / 1000),
      poly: encodePolyline(thin(pts, 400)), distanceKm: Math.round(c.len) / 1000, gainM: dir === 1 ? Math.round(c.rise) : null, lossM: dir === -1 ? Math.round(c.rise) : null,
      grade: pct, maxGrade: maxGradeOf(at, zz, dir), trailShare: Math.round(trailShare(g, c.edges) * 100) / 100,
      profile: profileOf(at, zz), osm: null,
    } satisfies Terrain;
  });
}

// ---------- Lieux ponctuels ----------
export interface OsmEl { type: "node" | "way" | "relation"; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }

/** Lien vers la fiche OSM quand l’identifiant est connu (les éléments lus dans les tuiles n’en ont pas). */
const osmUrl = (el: OsmEl) => (el.id > 0 ? `https://www.openstreetmap.org/${el.type}/${el.id}` : null);
const posOf = (el: OsmEl): LatLon | null => (el.lat != null ? [el.lat, el.lon!] : el.center ? [el.center.lat, el.center.lon] : el.geometry?.length ? [el.geometry[0].lat, el.geometry[0].lon] : null);

export function placesFrom(kind: "track" | "fitness" | "water", els: OsmEl[], start: { lat: number; lon: number }): Terrain[] {
  type P = { el: OsmEl; at: LatLon; d: number };
  const items: P[] = [];
  for (const el of els) { const at = posOf(el); if (at) items.push({ el, at, d: dist(start.lat, start.lon, at[0], at[1]) }); }
  items.sort((a, b) => a.d - b.d);
  const mk = (it: P, name: string, detail: string, tags: string[]): Terrain => ({
    id: `${kind}-${it.el.type}-${it.el.id}`, kind, source: "osm", name, detail, tags, lat: it.at[0], lon: it.at[1], fromStartKm: r1(it.d / 1000),
    poly: null, distanceKm: null, gainM: null, lossM: null, grade: null, maxGrade: null, trailShare: null, profile: null, osm: osmUrl(it.el),
  });
  if (kind === "fitness") {
    // Les agrès d’un même parcours santé sont regroupés.
    const groups: { items: P[]; trail: P | null }[] = [];
    for (const it of items) {
      const t = it.el.tags ?? {};
      const isTrail = t.route === "fitness_trail";
      const gr = groups.find((g) => g.items.some((o) => dist(o.at[0], o.at[1], it.at[0], it.at[1]) < 350));
      if (gr) { gr.items.push(it); if (isTrail) gr.trail = it; } else groups.push({ items: [it], trail: isTrail ? it : null });
    }
    return groups.slice(0, 8).map((g) => {
      const head = g.trail ?? g.items[0], t = head.el.tags ?? {}, n = g.items.filter((i) => i.el.tags?.leisure === "fitness_station").length;
      return mk(head, t.name ?? (g.trail ? "Parcours santé" : n > 1 ? "Espace d’agrès" : "Agrès de plein air"),
        n > 1 ? `${n} agrès` : g.trail ? "Parcours santé balisé" : "Agrès en accès libre", [t.access === "customers" ? "Réservé aux clients" : "Accès libre"].filter(Boolean));
    });
  }
  if (kind === "track") {
    const seen: P[] = [];
    items.sort((a, b) => Number(a.el.tags?.leisure === "stadium") - Number(b.el.tags?.leisure === "stadium") || a.d - b.d);
    for (const it of items) if (!seen.some((o) => o.d === it.d || dist(o.at[0], o.at[1], it.at[0], it.at[1]) < 150)) seen.push(it);
    return seen.slice(0, 8).map((it) => {
      const t = it.el.tags ?? {};
      const acc = t.access === "private" || t.access === "no" ? "Accès privé" : t.access === "customers" || t.access === "members" ? "Accès réservé (club)" : t.access === "yes" || t.access === "public" ? "Accès public" : "Accès à vérifier";
      if (t.leisure === "stadium") return mk(it, t.name ?? "Stade", "Stade : la présence d’une piste d’athlétisme est à vérifier", ["Accès à vérifier"]);
      return mk(it, t.name ?? "Piste d’athlétisme", [t.surface && SURF[t.surface] ? `Revêtement : ${SURF[t.surface]}` : t.surface === "tartan" ? "Revêtement synthétique" : null, t.lanes ? `${t.lanes} couloirs` : null].filter(Boolean).join(" · ") || "Piste d’athlétisme", [acc]);
    });
  }
  return items.slice(0, 10).map((it) => {
    const t = it.el.tags ?? {};
    const name = t.name ?? (t.natural === "spring" ? "Source" : t.amenity === "fountain" ? "Fontaine" : "Point d’eau potable");
    return mk(it, name, t.natural === "spring" ? "Source signalée potable" : t.seasonal === "yes" ? "Ouvert selon la saison" : "Eau potable", [t.drinking_water === "no" ? "Non potable" : "Potable"]);
  });
}

/** Escaliers : longueur et dénivelé (marches ou altitude des extrémités). */
export async function stairsFrom(els: OsmEl[], start: { lat: number; lon: number }, elev: Elev): Promise<Terrain[]> {
  const st = els.filter((e) => e.geometry && e.geometry.length >= 2).map((e) => {
    const pts = e.geometry!.map((g) => [g.lat, g.lon] as LatLon);
    let len = 0; for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    return { e, pts, len, d: dist(start.lat, start.lon, pts[0][0], pts[0][1]) };
  }).filter((s) => s.len >= 12).sort((a, b) => b.len - a.len).slice(0, 40);
  let z: number[] | null = null;
  try { z = st.length ? await elev(st.flatMap((s) => [s.pts[0], s.pts[s.pts.length - 1]])) : null; } catch { z = null; }
  const list = st.map((s, i) => {
    const t = s.e.tags ?? {};
    const steps = Number(t.step_count);
    const h = Number.isFinite(steps) && steps > 0 ? steps * 0.17 : z ? Math.abs(z[2 * i + 1] - z[2 * i]) : null;
    return { s, t, h: h != null && h >= 1 ? Math.round(h) : null, steps: Number.isFinite(steps) && steps > 0 ? steps : null };
  }).sort((a, b) => (b.h ?? b.s.len / 4) - (a.h ?? a.s.len / 4)).slice(0, 8);
  return list.map(({ s, t, h, steps }) => ({
    id: `stairs-${s.e.id}`, kind: "stairs", source: "osm",
    name: t.name ?? (steps ? `Escalier de ${steps} marches` : `Escalier de ${Math.round(s.len)} m`),
    detail: [`${Math.round(s.len)} m de long`, h ? `environ ${h} m de dénivelé` : null, steps ? `${steps} marches` : null].filter(Boolean).join(" · "),
    tags: [t.handrail === "yes" ? "Rampe" : null, t.lit === "yes" ? "Éclairé" : null].filter((x): x is string => !!x),
    lat: s.pts[0][0], lon: s.pts[0][1], fromStartKm: r1(s.d / 1000), poly: encodePolyline(s.pts), distanceKm: Math.round(s.len) / 1000,
    gainM: h, lossM: null, grade: h ? Math.round((h / s.len) * 100) : null, maxGrade: null, trailShare: null, profile: null, osm: osmUrl(s.e),
  }));
}
