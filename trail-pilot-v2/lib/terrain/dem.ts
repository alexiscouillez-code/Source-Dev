/**
 * Altitude à partir des tuiles de terrain « Terrarium » (jeu de données ouvert Mapzen Terrain Tiles,
 * hébergé par AWS Open Data) : une image PNG de 256 px encode l’altitude de chaque pixel.
 * Fonctionne dans un worker (OffscreenCanvas) comme dans la page.
 */
import type { LatLon } from "@/lib/polyline";

const URL_TPL = process.env.NEXT_PUBLIC_DEM_URL || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const MAX_TILES = 48;

type Tile = Float32Array; // 256 × 256 altitudes
const cache = new Map<string, Promise<Tile>>();

async function pixels(blob: Blob): Promise<Uint8ClampedArray> {
  const bmp = await createImageBitmap(blob);
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(256, 256), ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    return ctx.getImageData(0, 0, 256, 256).data;
  }
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, 256, 256).data;
}

function tile(z: number, x: number, y: number): Promise<Tile> {
  const key = `${z}/${x}/${y}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      let last: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(URL_TPL.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)), { signal: AbortSignal.timeout(15000) });
          if (!res.ok) throw new Error(`Tuile ${res.status}`);
          const d = await pixels(await res.blob());
          const out = new Float32Array(65536);
          for (let i = 0; i < 65536; i++) out[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
          return out;
        } catch (e) { last = e; await new Promise((r) => setTimeout(r, 300 * (attempt + 1))); }
      }
      cache.delete(key);
      throw last;
    })();
    cache.set(key, p);
    if (cache.size > 160) cache.delete(cache.keys().next().value!);
  }
  return p;
}

const toPx = (lat: number, lon: number, z: number) => {
  const n = 2 ** z, s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * n * 256, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n * 256] as const;
};

/** Zoom le plus fin (≤ 13, environ 15 m par pixel) qui couvre les points avec au plus MAX_TILES tuiles. */
function zoomFor(pts: LatLon[]): number {
  for (let z = 13; z >= 9; z--) {
    const set = new Set<string>();
    for (const [a, b] of pts) { const [px, py] = toPx(a, b, z); set.add(`${Math.floor(px / 256)}:${Math.floor(py / 256)}`); if (set.size > MAX_TILES) break; }
    if (set.size <= MAX_TILES) return z;
  }
  return 9;
}

/** Altitudes (m) des points, interpolées entre les pixels voisins. */
export async function demElevation(pts: LatLon[]): Promise<number[]> {
  if (!pts.length) return [];
  const z = zoomFor(pts);
  const need = new Map<string, [number, number]>();
  const px = pts.map(([a, b]) => toPx(a, b, z));
  for (const [x, y] of px) {
    const x0 = Math.floor(x - 0.5), y0 = Math.floor(y - 0.5);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const tx = Math.floor((x0 + dx) / 256), ty = Math.floor((y0 + dy) / 256); need.set(`${tx}:${ty}`, [tx, ty]); }
  }
  const tiles = new Map<string, Tile>();
  await Promise.all([...need.entries()].map(async ([k, [tx, ty]]) => { tiles.set(k, await tile(z, tx, ty)); }));
  const at = (gx: number, gy: number) => {
    const tx = Math.floor(gx / 256), ty = Math.floor(gy / 256);
    return tiles.get(`${tx}:${ty}`)![(gy - ty * 256) * 256 + (gx - tx * 256)];
  };
  return px.map(([x, y]) => {
    const fx = x - 0.5, fy = y - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
    return at(x0, y0) * (1 - u) * (1 - v) + at(x0 + 1, y0) * u * (1 - v) + at(x0, y0 + 1) * (1 - u) * v + at(x0 + 1, y0 + 1) * u * v;
  });
}
