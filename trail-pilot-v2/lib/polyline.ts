/**
 * Tracés GPS compacts : polyline encodée (algorithme de Google, précision 1e-5),
 * le même format que Strava. Utilisable côté navigateur et côté serveur.
 */
export type LatLon = [number, number];

export function encodePolyline(points: LatLon[]): string {
  let out = "", pLat = 0, pLon = 0;
  const enc = (v: number) => {
    let s = v < 0 ? ~(v << 1) : v << 1, r = "";
    while (s >= 0x20) { r += String.fromCharCode((0x20 | (s & 0x1f)) + 63); s >>= 5; }
    return r + String.fromCharCode(s + 63);
  };
  for (const [lat, lon] of points) {
    const a = Math.round(lat * 1e5), b = Math.round(lon * 1e5);
    out += enc(a - pLat) + enc(b - pLon);
    pLat = a; pLon = b;
  }
  return out;
}

export function decodePolyline(str: string): LatLon[] {
  const pts: LatLon[] = [];
  let i = 0, lat = 0, lon = 0;
  const next = () => {
    let shift = 0, res = 0, b: number;
    do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i <= str.length);
    return res & 1 ? ~(res >> 1) : res >> 1;
  };
  while (i < str.length) { lat += next(); if (i > str.length) break; lon += next(); pts.push([lat / 1e5, lon / 1e5]); }
  return pts;
}

/** Garde au plus `max` points, répartis régulièrement le long du tracé. */
export function thin(points: LatLon[], max = 500): LatLon[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

/** Validation côté serveur : polyline plausible, taille bornée. */
export function cleanPolyline(v: unknown, maxLen = 24000): string | null {
  if (typeof v !== "string" || v.length < 4 || v.length > maxLen || !/^[\x3f-\x7e]+$/.test(v)) return null;
  const pts = decodePolyline(v);
  if (pts.length < 2 || pts.some(([a, b]) => !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180)) return null;
  return v;
}
