import assert from "node:assert/strict";
import { test } from "node:test";
import { coachComment } from "../src/comments.ts";
import { buildProfile } from "../src/profile.ts";
import { applyOuting, clearedDistance } from "../src/progress.ts";
import { PUBLISHED_TOTALS, RACES, totalElevation, totalKm } from "../src/races.ts";

const occ = RACES[0];
assert.ok(occ);

test("public totals match the schematic segments", () => {
  for (const race of RACES) {
    const expected = PUBLISHED_TOTALS[race.id];
    assert.equal(totalKm(race), expected.km);
    assert.equal(totalElevation(race), expected.elevation);
    for (let i = 0; i < race.segments.length - 1; i += 1) {
      const current = race.segments[i];
      const next = race.segments[i + 1];
      assert.ok(current && next);
      assert.equal(current.altEnd, next.altStart);
    }
  }
});

test("profile follows the segment endpoints", () => {
  for (const race of RACES) {
    const points = buildProfile(race);
    const first = points[0];
    const last = points[points.length - 1];
    const start = race.segments[0];
    const end = race.segments[race.segments.length - 1];
    assert.ok(first && last && start && end);
    assert.equal(first.km, 0);
    assert.equal(first.alt, start.altStart);
    assert.equal(last.km, totalKm(race));
    assert.equal(last.alt, end.altEnd);
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const point = points[i];
      assert.ok(prev && point);
      assert.ok(point.km >= prev.km);
      assert.ok(Number.isFinite(point.alt));
    }
  }
});

test("a partial outing does not move the avatar", () => {
  const result = applyOuting(occ.segments, empty(), 5, 40);
  assert.equal(result.segmentsCleared, 0);
  assert.equal(result.progress.segmentIndex, 0);
  assert.equal(result.progress.kmFilled, 5);
  assert.equal(result.progress.elevationFilled, 40);
  assert.equal(clearedDistance(occ.segments, result.progress.segmentIndex), 0);
});

test("kilometres alone do not clear a segment", () => {
  const result = applyOuting(occ.segments, empty(), 20, 100);
  assert.equal(result.segmentsCleared, 0);
  assert.equal(result.progress.kmFilled, 14);
  assert.equal(result.progress.elevationFilled, 100);
  assert.equal(result.kmUnused, 6);
  assert.equal(result.elevationUnused, 0);
  assert.equal(clearedDistance(occ.segments, result.progress.segmentIndex), 0);
});

test("climb alone does not clear a segment", () => {
  const result = applyOuting(occ.segments, empty(), 4, 900);
  assert.equal(result.segmentsCleared, 0);
  assert.equal(result.progress.kmFilled, 4);
  assert.equal(result.progress.elevationFilled, 800);
  assert.equal(result.elevationUnused, 100);
  assert.equal(clearedDistance(occ.segments, result.progress.segmentIndex), 0);
});

test("both gauges clear the segment and the avatar steps forward", () => {
  const afterFlat = applyOuting(occ.segments, empty(), 5, 40);
  const result = applyOuting(occ.segments, afterFlat.progress, 9, 760);
  assert.equal(result.segmentsCleared, 1);
  assert.equal(result.progress.segmentIndex, 1);
  assert.equal(result.progress.kmFilled, 0);
  assert.equal(result.progress.elevationFilled, 0);
  assert.equal(clearedDistance(occ.segments, result.progress.segmentIndex), 14);
});

test("surplus of a clearing outing continues on the next segment", () => {
  const result = applyOuting(occ.segments, empty(), 20, 1000);
  assert.equal(result.segmentsCleared, 1);
  assert.equal(result.progress.segmentIndex, 1);
  assert.equal(result.progress.kmFilled, 6);
  assert.equal(result.progress.elevationFilled, 200);
  assert.equal(result.kmUnused, 0);
  assert.equal(result.elevationUnused, 0);
  assert.equal(clearedDistance(occ.segments, 1), 14);
});

test("one outing can clear several segments", () => {
  const result = applyOuting(occ.segments, empty(), 40, 3000);
  assert.equal(result.segmentsCleared, 3);
  assert.equal(result.progress.segmentIndex, 3);
  assert.equal(result.finished, false);
  assert.equal(clearedDistance(occ.segments, result.progress.segmentIndex), 36);
});

test("the race finishes on the last segment and drops the leftover", () => {
  const result = applyOuting(occ.segments, empty(), 80, 4000);
  assert.equal(result.finished, true);
  assert.equal(result.progress.segmentIndex, occ.segments.length);
  assert.equal(clearedDistance(occ.segments, result.progress.segmentIndex), 57);
  assert.ok(result.kmUnused > 0 || result.elevationUnused > 0);
});

test("coach lines stay on one line", () => {
  const lines = [
    coachComment({
      finished: false,
      finishTown: "Chamonix",
      segmentsCleared: 0,
      gate: null,
      kmApplied: 8,
      elevationApplied: 50,
      segmentKm: 14,
      segmentElevation: 800,
      kmFull: false,
      elevationFull: false,
      kmRemaining: 6,
      elevationRemaining: 750,
    }),
    coachComment({
      finished: false,
      finishTown: "Chamonix",
      segmentsCleared: 0,
      gate: null,
      kmApplied: 3,
      elevationApplied: 700,
      segmentKm: 14,
      segmentElevation: 800,
      kmFull: false,
      elevationFull: false,
      kmRemaining: 11,
      elevationRemaining: 100,
    }),
    coachComment({
      finished: false,
      finishTown: "Chamonix",
      segmentsCleared: 0,
      gate: null,
      kmApplied: 14,
      elevationApplied: 100,
      segmentKm: 14,
      segmentElevation: 800,
      kmFull: true,
      elevationFull: false,
      kmRemaining: 0,
      elevationRemaining: 700,
    }),
    coachComment({
      finished: false,
      finishTown: "Chamonix",
      segmentsCleared: 1,
      gate: "Champex-Lac",
      kmApplied: 14,
      elevationApplied: 800,
      segmentKm: 12,
      segmentElevation: 650,
      kmFull: false,
      elevationFull: false,
      kmRemaining: 12,
      elevationRemaining: 650,
    }),
    coachComment({
      finished: true,
      finishTown: "Chamonix",
      segmentsCleared: 1,
      gate: "Chamonix",
      kmApplied: 7,
      elevationApplied: 70,
      segmentKm: 7,
      segmentElevation: 70,
      kmFull: false,
      elevationFull: false,
      kmRemaining: 0,
      elevationRemaining: 0,
    }),
  ];
  assert.match(lines[0] ?? "", /plate/);
  assert.match(lines[1] ?? "", /raide/);
  assert.match(lines[2] ?? "", /Encore 700 m de D\+/);
  assert.match(lines[3] ?? "", /jusqu'à Champex-Lac/);
  assert.match(lines[4] ?? "", /Arrivée à Chamonix/);
  for (const line of lines) {
    assert.equal(line.includes("\n"), false);
    assert.ok(line.length < 160);
  }
});

function empty() {
  return { segmentIndex: 0, kmFilled: 0, elevationFilled: 0 };
}
