import type { Race, Segment, Terrain } from "./types.ts";

export type ProfilePoint = {
  km: number;
  alt: number;
  segmentIndex: number;
};

export function altitudeAt(segment: Segment, t: number): number {
  if (t <= 0) return segment.altStart;
  if (t >= 1) return segment.altEnd;
  const net = segment.altEnd - segment.altStart;
  const extra = Math.max(0, segment.elevation - Math.max(0, net));
  const eased = net >= 0 ? Math.pow(t, 0.85) : Math.pow(t, 1.2);
  const roll = Math.sin(t * Math.PI) * Math.min(180, extra * 0.22);
  const wiggle = Math.sin(t * Math.PI * 3) * Math.min(40, extra * 0.05);
  return segment.altStart + net * eased + roll + wiggle;
}

export function segmentProfiles(race: Race): ProfilePoint[][] {
  const lines: ProfilePoint[][] = [];
  let cursor = 0;
  for (let index = 0; index < race.segments.length; index += 1) {
    const segment = race.segments[index];
    if (!segment) continue;
    const samples = 20;
    const line: ProfilePoint[] = [];
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples;
      const km = i === samples ? cursor + segment.km : cursor + segment.km * t;
      line.push({ km, alt: altitudeAt(segment, t), segmentIndex: index });
    }
    lines.push(line);
    cursor += segment.km;
  }
  return lines;
}

export function buildProfile(race: Race): ProfilePoint[] {
  const points: ProfilePoint[] = [];
  for (const line of segmentProfiles(race)) {
    for (let i = 0; i < line.length; i += 1) {
      const point = line[i];
      if (!point || (points.length > 0 && i === 0)) continue;
      points.push(point);
    }
  }
  return points;
}

export function pointAtKm(points: ProfilePoint[], km: number): ProfilePoint {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return { km, alt: 0, segmentIndex: 0 };
  if (km <= first.km) return first;
  if (km >= last.km) return last;
  for (let i = 1; i < points.length; i += 1) {
    const b = points[i];
    const a = points[i - 1];
    if (!a || !b) continue;
    if (km <= b.km) {
      const span = b.km - a.km || 1;
      const t = (km - a.km) / span;
      return {
        km,
        alt: a.alt + (b.alt - a.alt) * t,
        segmentIndex: b.segmentIndex,
      };
    }
  }
  return last;
}

export function cameraFor(
  totalKm: number,
  focusKm: number,
): { start: number; end: number } {
  const span = Math.min(totalKm, Math.max(18, Math.min(32, totalKm * 0.28)));
  let start = focusKm - span * 0.34;
  if (start < 0) start = 0;
  if (start + span > totalKm) start = Math.max(0, totalKm - span);
  return { start, end: Math.min(totalKm, start + span) };
}

export function segmentIndexAtKm(race: Race, km: number): number {
  let cursor = 0;
  for (let i = 0; i < race.segments.length; i += 1) {
    const segment = race.segments[i];
    if (!segment) break;
    cursor += segment.km;
    if (km < cursor - 0.0005) return i;
  }
  return Math.max(0, race.segments.length - 1);
}

export function segmentStartKm(race: Race, index: number): number {
  let km = 0;
  for (let i = 0; i < index && i < race.segments.length; i += 1) {
    km += race.segments[i]?.km ?? 0;
  }
  return km;
}

export function slopeLabel(segment: Segment): "montée" | "descente" | "vallonné" {
  const perKm = (segment.altEnd - segment.altStart) / segment.km;
  if (perKm > 40) return "montée";
  if (perKm < -40) return "descente";
  return "vallonné";
}

export function terrainLabel(terrain: Terrain): string {
  switch (terrain) {
    case "valley":
      return "vallée";
    case "forest":
      return "forêt";
    case "alpine":
      return "alpage";
    case "rock":
      return "pierrier";
    case "snow":
      return "neige";
  }
}

export function describeSegment(segment: Segment): string {
  const slope = slopeLabel(segment);
  const titled = slope.charAt(0).toUpperCase() + slope.slice(1);
  return `${titled} · ${terrainLabel(segment.terrain)}`;
}

export function sparklinePath(
  points: ProfilePoint[],
  width: number,
  height: number,
): string {
  const first = points[0];
  if (!first) return "";
  let min = first.alt;
  let max = first.alt;
  let maxKm = first.km;
  for (const point of points) {
    if (point.alt < min) min = point.alt;
    if (point.alt > max) max = point.alt;
    if (point.km > maxKm) maxKm = point.km;
  }
  const span = max - min || 1;
  return points
    .map((point, index) => {
      const x = (point.km / (maxKm || 1)) * width;
      const y = height - 2 - ((point.alt - min) / span) * (height - 6);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
