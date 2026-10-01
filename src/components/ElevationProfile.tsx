import type { Race } from "@/game/models/types";

interface Point {
  km: number;
  alt: number;
}

export function profilePoints(race: Race): Point[] {
  const points: Point[] = [{ km: 0, alt: race.startAltitudeM }];
  let altitude = race.startAltitudeM;
  for (const segment of race.segments) {
    altitude += segment.elevationGain;
    points.push({ km: (segment.startKm + segment.endKm) / 2, alt: altitude });
    altitude -= segment.elevationLoss;
    points.push({ km: segment.endKm, alt: altitude });
  }
  return points;
}

function altitudeAt(points: Point[], km: number): number {
  const nextIndex = points.findIndex((point) => point.km >= km);
  if (nextIndex <= 0) return points[0]?.alt ?? 0;
  const right = points[nextIndex];
  const left = points[nextIndex - 1];
  if (!right || !left || right.km === left.km) return right?.alt ?? left?.alt ?? 0;
  const ratio = (km - left.km) / (right.km - left.km);
  return left.alt + (right.alt - left.alt) * ratio;
}

export function ElevationProfile({ race, distance }: { race: Race; distance: number }) {
  const points = profilePoints(race);
  const minAlt = Math.min(...points.map((point) => point.alt));
  const maxAlt = Math.max(...points.map((point) => point.alt));
  const span = Math.max(1, maxAlt - minAlt);
  const xOf = (km: number) => (km / race.distanceKm) * 100;
  const yOf = (alt: number) => 3 + ((maxAlt - alt) / span) * 26;
  const line = points.map((point) => `${xOf(point.km).toFixed(2)},${yOf(point.alt).toFixed(2)}`).join(" ");
  const markerKm = Math.min(Math.max(distance, 0), race.distanceKm);

  return (
    <svg viewBox="0 0 100 34" className="h-20 w-full" role="img" aria-label="Profil altimétrique">
      <polygon points={`0,34 ${line} 100,34`} fill="#102226" />
      <polyline fill="none" stroke="#3ee0c5" strokeWidth="1.3" points={line} />
      <circle cx={xOf(markerKm)} cy={yOf(altitudeAt(points, markerKm))} r="1.7" fill="#f4f7f8" />
    </svg>
  );
}
