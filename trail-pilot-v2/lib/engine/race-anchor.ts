/**
 * Temps de course au plus près du réel : ce qui complète le modèle générique (VO2max → km-effort) quand on le connaît.
 *
 *  1. Un vrai résultat de trail du coureur (distance, D+, temps) : c'est la meilleure base, elle contient déjà
 *     la technique, les descentes et la gestion de course qu'une VO2max ne voit pas. On le transpose à la course
 *     visée par la loi de Riegel sur le km-effort (exposant 1,06), en retirant puis en remettant l'usure des
 *     longues durées propre à chaque format.
 *  2. Le temps du vainqueur de l'édition précédente : il mesure la difficulté réelle du parcours. On le compare au
 *     temps que le modèle donne à un coureur élite sur la même distance et le même D+ ; l'écart (borné de −15 à
 *     +40 %) s'applique à l'estimation du coureur.
 *  3. À défaut, le niveau technique du terrain déclaré (roulant −4 %, technique +7 %, très technique +15 %).
 *
 * Ce sont des hypothèses de modèle, pas des mesures : l'écran dit toujours d'où vient le temps affiché.
 */
import { raceTime } from "./vo2";

export type Terrain = "roulant" | "mixte" | "technique" | "tres";
export interface RaceRef { km: number; gain: number; min: number }
export interface RaceAnchor { ref?: RaceRef | null; terrain?: Terrain | null; winnerMin?: number | null }

export const TERRAIN_F: Record<Terrain, number> = { roulant: 0.96, mixte: 1, technique: 1.07, tres: 1.15 };
export const TERRAIN_LABEL: Record<Terrain, string> = { roulant: "roulant", mixte: "mixte", technique: "technique", tres: "très technique" };
/** Exposant de Riegel pour transposer un temps d'une distance à une autre (sur le km-effort). */
export const RIEGEL = 1.06;

/** Usure des longues durées (marche, ravitaillements, nuit) : +4 % par heure de 4 h à 12 h, puis +1,2 % par heure. */
export const wear = (h: number) => (h <= 4 ? 1 : 1 + 0.04 * (Math.min(h, 12) - 4) + 0.012 * Math.max(0, h - 12));
export const effortKm = (km: number, gain: number) => km + gain / 100;

/**
 * Temps de course à partir de la VO2max : le km-effort couru comme une distance à plat (modèle Daniels), puis
 * sentier (8 %), raideur du parcours (jusqu'à 6 %) et usure des longues durées.
 * Repères de calage (temps publiés) : UTMB ≈ 22 h pour le haut du classement élite, ≈ 31 h pour un coureur à 3 h
 * au marathon ; les formats de moins de 4 h ne sont pas concernés par l'usure.
 */
export function trailTime(vdot: number, distanceKm: number, gainM: number) {
  const base = raceTime(vdot, effortKm(distanceKm, gainM)) * (1.08 + Math.min(0.06, gainM / Math.max(1, distanceKm) / 1000));
  return base * wear(base / 60);
}

/** Temps « sans usure » d'un temps réel : on cherche t tel que t × usure(t) = temps réel. */
function unwear(min: number) {
  let lo = min / 2, hi = min;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (m * wear(m / 60) > min) hi = m; else lo = m; }
  return (lo + hi) / 2;
}

/** Temps visé d'après un vrai résultat du coureur, sur terrain comparable. */
export function fromReference(ref: RaceRef, km: number, gain: number) {
  const base = unwear(ref.min) * (effortKm(km, gain) / effortKm(ref.km, ref.gain)) ** RIEGEL;
  return base * wear(base / 60);
}

/** Rapport entre la course visée et le résultat de référence (km-effort) : au-delà de ×3, l'extrapolation est moins sûre. */
export const refRatio = (ref: RaceRef, km: number, gain: number) => effortKm(km, gain) / effortKm(ref.km, ref.gain);

/**
 * Temps de victoire de référence d'une course, selon le modèle : le temps d'un coureur élite (VO2max 79,5), ramené
 * au temps réel de victoire de l'UTMB 2025 (Tom Evans, 19 h 19 sur 174 km et 9 900 m D+). Sur ce repère, la
 * difficulté du parcours vaut 1 ; un parcours plus lent pour ses vainqueurs que ne le prévoit le modèle vaut plus.
 */
export const ELITE_VDOT = 79.5;
const UTMB_2025 = { km: 174, gain: 9900, min: 19 * 60 + 19 };
const WINNER_SCALE = UTMB_2025.min / trailTime(ELITE_VDOT, UTMB_2025.km, UTMB_2025.gain);
export const winnerModel = (km: number, gain: number) => trailTime(ELITE_VDOT, km, gain) * WINNER_SCALE;

/** Difficulté réelle du parcours d'après le temps du vainqueur précédent (1 = conforme au modèle), bornée. */
export function courseFactor(winnerMin: number, km: number, gain: number) {
  return Math.min(1.4, Math.max(0.85, winnerMin / winnerModel(km, gain)));
}

/** Correction du parcours : vainqueur précédent s'il est connu, sinon terrain déclaré, sinon aucune. */
export function courseCorrection(a: RaceAnchor | null | undefined, km: number, gain: number): { factor: number; from: "vainqueur" | "terrain" | null } {
  if (a?.winnerMin) return { factor: courseFactor(a.winnerMin, km, gain), from: "vainqueur" };
  if (a?.terrain && a.terrain !== "mixte") return { factor: TERRAIN_F[a.terrain], from: "terrain" };
  return { factor: 1, from: null };
}

const n = (v: unknown, lo: number, hi: number) => { const x = Number(v); return Number.isFinite(x) && x >= lo && x <= hi ? x : null; };

/** Lecture sûre (base ou formulaire) ; null si rien d'utilisable. */
export function cleanAnchor(x: unknown): RaceAnchor | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>, r = (o.ref ?? null) as Record<string, unknown> | null;
  const km = n(r?.km, 3, 400), gain = n(r?.gain, 0, 15000), min = n(r?.min, 15, 100 * 60);
  // Allure plausible pour un trail : entre 2'30 et 30' par km-effort.
  const ref = km != null && gain != null && min != null && min / effortKm(km, gain) >= 2.5 && min / effortKm(km, gain) <= 30 ? { km, gain: Math.round(gain), min: Math.round(min) } : null;
  const terrain = typeof o.terrain === "string" && o.terrain in TERRAIN_F ? (o.terrain as Terrain) : null;
  const winnerMin = n(o.winnerMin, 20, 80 * 60);
  return ref || terrain || winnerMin ? { ref, terrain, winnerMin: winnerMin != null ? Math.round(winnerMin) : null } : null;
}

/** Durée saisie à la main : « 4h05 », « 4 h 05 », « 4:05 », « 19h19 » ou un nombre d'heures (« 4,5 »). Minutes, ou null. */
export function parseDuration(s: string): number | null {
  const t = s.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return null;
  const hm = t.match(/^(\d{1,3})(?:h|:)(\d{1,2})?(?:min|m)?$/);
  if (hm) { const m = Number(hm[2] ?? 0); return m < 60 ? Number(hm[1]) * 60 + m : null; }
  const mins = t.match(/^(\d{1,4})(?:min|mn|m)$/);
  if (mins) return Number(mins[1]);
  const h = Number(t.replace(",", "."));
  return Number.isFinite(h) && h > 0 && h <= 100 ? Math.round(h * 60) : null;
}
/** Minutes vers « 4 h 05 », pour pré-remplir les champs. */
export const durationText = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`;
