export type SegmentNeed = {
  km: number;
  elevation: number;
};

export type Progress = {
  segmentIndex: number;
  kmFilled: number;
  elevationFilled: number;
};

export type ApplyResult = {
  progress: Progress;
  segmentsCleared: number;
  kmApplied: number;
  elevationApplied: number;
  kmUnused: number;
  elevationUnused: number;
  finished: boolean;
};

function roundKm(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Credits an outing to the current segment only.
 * The segment is cleared when both its kilometres and its positive elevation
 * are covered. Surplus of the same outing then continues onto the next segment.
 * Extra kilometres or climb that arrive while the other gauge is still short
 * stay unused: the avatar does not advance.
 */
export function applyOuting(
  segments: SegmentNeed[],
  start: Progress,
  kmIn: number,
  elevationIn: number,
): ApplyResult {
  let segmentIndex = start.segmentIndex;
  let kmFilled = start.kmFilled;
  let elevationFilled = start.elevationFilled;
  let kmLeft = roundKm(Math.max(0, kmIn));
  let elevLeft = Math.max(0, Math.round(elevationIn));
  let kmApplied = 0;
  let elevationApplied = 0;
  let segmentsCleared = 0;

  if (segmentIndex >= segments.length) {
    return {
      progress: {
        segmentIndex: segments.length,
        kmFilled: 0,
        elevationFilled: 0,
      },
      segmentsCleared: 0,
      kmApplied: 0,
      elevationApplied: 0,
      kmUnused: kmLeft,
      elevationUnused: elevLeft,
      finished: true,
    };
  }

  while (segmentIndex < segments.length && (kmLeft > 0 || elevLeft > 0)) {
    const segment = segments[segmentIndex];
    if (!segment) break;

    const kmNeed = roundKm(segment.km - kmFilled);
    const elevNeed = segment.elevation - elevationFilled;
    const kmAdd = roundKm(Math.min(kmLeft, Math.max(0, kmNeed)));
    const elevAdd = Math.min(elevLeft, Math.max(0, elevNeed));

    kmFilled = roundKm(kmFilled + kmAdd);
    elevationFilled += elevAdd;
    kmLeft = roundKm(kmLeft - kmAdd);
    elevLeft -= elevAdd;
    kmApplied = roundKm(kmApplied + kmAdd);
    elevationApplied += elevAdd;

    const kmDone = kmFilled >= segment.km - 0.0005;
    const elevDone = elevationFilled >= segment.elevation;
    if (kmDone && elevDone) {
      segmentsCleared += 1;
      segmentIndex += 1;
      kmFilled = 0;
      elevationFilled = 0;
      continue;
    }
    break;
  }

  const finished = segmentIndex >= segments.length;
  return {
    progress: {
      segmentIndex,
      kmFilled: finished ? 0 : kmFilled,
      elevationFilled: finished ? 0 : elevationFilled,
    },
    segmentsCleared,
    kmApplied,
    elevationApplied,
    kmUnused: kmLeft,
    elevationUnused: elevLeft,
    finished,
  };
}

/** Distance along the profile where the avatar stands: cleared segments only. */
export function clearedDistance(
  segments: SegmentNeed[],
  segmentIndex: number,
): number {
  let km = 0;
  const last = Math.min(Math.max(segmentIndex, 0), segments.length);
  for (let i = 0; i < last; i += 1) {
    km += segments[i]?.km ?? 0;
  }
  return roundKm(km);
}
