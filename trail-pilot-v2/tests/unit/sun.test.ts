import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSunChange, SUN_INLINE, sunAltitude, sunPosition, sunUp } from "../../lib/engine/sun";

// Repères publiés (heure légale de Paris = UTC+1 en hiver, UTC+2 en été).
const at = (iso: string) => Date.parse(iso);

test("hauteur du soleil : midi solaire plus haut en été qu'en hiver à Paris", () => {
  const summer = sunAltitude(at("2026-06-21T11:50:00Z"), 48.857, 2.352);
  const winter = sunAltitude(at("2026-12-21T11:50:00Z"), 48.857, 2.352);
  assert.ok(summer > 63 && summer < 66, `été ${summer}`);
  assert.ok(winter > 16.5 && winter < 19.5, `hiver ${winter}`);
});

test("coucher du soleil à Paris le 24 novembre 2026 vers 17 h (heure de Paris)", () => {
  const c = nextSunChange(at("2026-11-24T12:00:00Z"), 48.857, 2.352)!;
  assert.equal(c.rise, false);
  const min = (c.at - at("2026-11-24T00:00:00Z")) / 60000; // minutes UTC
  // Coucher publié : 16 h 59 heure de Paris, soit 15 h 59 UTC.
  assert.ok(Math.abs(min - (15 * 60 + 59)) <= 4, `coucher à ${Math.floor(min / 60)}:${Math.round(min % 60)} UTC`);
});

test("lever du soleil à Paris le 25 novembre 2026 vers 8 h 14 (heure de Paris)", () => {
  const c = nextSunChange(at("2026-11-24T20:00:00Z"), 48.857, 2.352)!;
  assert.equal(c.rise, true);
  const min = (c.at - at("2026-11-25T00:00:00Z")) / 60000;
  // Lever publié : 8 h 14 heure de Paris, soit 7 h 14 UTC.
  assert.ok(Math.abs(min - (7 * 60 + 14)) <= 4, `lever à ${Math.floor(min / 60)}:${Math.round(min % 60)} UTC`);
});

test("plus à l'est et plus au sud, le soleil se lève plus tôt (Chamonix avant Paris)", () => {
  const paris = nextSunChange(at("2026-11-24T20:00:00Z"), 48.857, 2.352)!.at;
  const cham = nextSunChange(at("2026-11-24T20:00:00Z"), 45.924, 6.869)!.at;
  const gap = (paris - cham) / 60000;
  assert.ok(gap > 15 && gap < 40, `écart ${gap} min`);
});

test("jour et nuit", () => {
  assert.equal(sunUp(at("2026-11-24T12:00:00Z"), 48.857, 2.352), true);
  assert.equal(sunUp(at("2026-11-24T22:00:00Z"), 48.857, 2.352), false);
});

test("nuit polaire : pas de changement dans les 48 h", () => {
  assert.equal(nextSunChange(at("2026-12-21T12:00:00Z"), 78.22, 15.65), null);
});

test("la version compacte du script de démarrage donne la même hauteur", () => {
  const f = new Function(`return (${SUN_INLINE})`)() as (la: number, lo: number) => number;
  const real = Date.now;
  for (const iso of ["2026-03-20T06:00:00Z", "2026-11-24T15:58:00Z", "2027-07-01T19:30:00Z"]) {
    Date.now = () => at(iso);
    try { assert.ok(Math.abs(f(45.9, 6.87) - sunAltitude(at(iso), 45.9, 6.87)) < 1e-9, iso); } finally { Date.now = real; }
  }
});

test("azimut du soleil : est le matin, sud à midi, ouest le soir (Paris, équinoxe)", () => {
  const utc = (h: number, m = 0) => Date.UTC(2026, 2, 20, h, m);
  const morning = sunPosition(utc(7, 30), 48.85, 2.35), noon = sunPosition(utc(11, 50), 48.85, 2.35), evening = sunPosition(utc(16, 30), 48.85, 2.35);
  assert.ok(morning.az > 70 && morning.az < 120, `matin ${morning.az}`);
  assert.ok(Math.abs(noon.az - 180) < 8, `midi ${noon.az}`);
  assert.ok(evening.az > 225 && evening.az < 270, `soir ${evening.az}`);
  assert.ok(Math.abs(noon.alt - sunAltitude(utc(11, 50), 48.85, 2.35)) < 1e-9, "même hauteur que sunAltitude");
});
