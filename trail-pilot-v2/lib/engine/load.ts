/**
 * Charge Trail Pilot (unité « UA »).
 *
 * charge = interne + mécanique
 *  - interne   = durée (min) × coût de l’intensité. Le coût croît comme le carré de l’intensité
 *                (une minute de fractionné pèse environ 2,5 fois une minute de footing), comme dans
 *                les modèles de référence (TRIMP, score de stress). L’intensité vient, dans l’ordre :
 *                du ressenti (1-10), du temps passé dans chaque zone cardiaque quand la sortie a été
 *                analysée seconde par seconde, de la FC moyenne, de l’allure rapportée à la VO2max,
 *                sinon d’une valeur type du sport ;
 *  - mécanique = coût des impacts et du dénivelé : 1,5/km, 6 par 100 m de D+, 7 par 100 m de D−
 *                (la descente, excentrique, abîme davantage), pondérés selon le sport.
 *
 * Ce sont des heuristiques d’entraînement, pas un modèle médical ni un risque de blessure.
 */
import { zoneMinutes } from "./streams";

export type Sport = "trail" | "course" | "rando" | "velo" | "renfo" | "autre";
export const SPORTS: Record<Sport, string> = { trail: "Trail", course: "Course", rando: "Randonnée", velo: "Vélo", renfo: "Renforcement", autre: "Autre" };

export interface ActivityLike {
  date: string; sport: Sport; durationMin: number;
  distanceKm?: number | null; gainM?: number | null; lossM?: number | null;
  avgHr?: number | null; maxHr?: number | null; rpe?: number | null;
  /** Temps par tranche de 5 bpm (analyse seconde par seconde), voir engine/streams. */
  hrHist?: number[] | null;
}
export interface Physio { hrMax?: number | null; hrRest?: number | null; /** VO2max de référence (montre, sinon estimation) : sert à juger l’effort d’une sortie sans cardio d’après son allure. */ vdot?: number | null }
export type EffortSource = "ressenti" | "zones" | "fc" | "allure" | "estimé";

/** Coût d’une minute selon l’effort (1-10) : quadratique en intensité, calé pour rester proche de l’ancien barème en endurance. */
export const stress = (rpe: number) => 2.447 * (0.5 + 0.06 * rpe) ** 2;
/** Effort équivalent de chaque zone cardiaque (Z1 à Z5). */
const ZONE_RPE = [2.5, 4, 5.5, 7.5, 9.5];
const rpeOfStress = (s: number) => (Math.sqrt(s / 2.447) - 0.5) / 0.06;

const IMPACT: Record<Sport, { km: number; up: number; down: number; rpe: number }> = {
  trail: { km: 1, up: 1, down: 1, rpe: 5 },
  course: { km: 1, up: 1, down: 1, rpe: 5 },
  rando: { km: 0.6, up: 0.8, down: 0.9, rpe: 3 },
  velo: { km: 0.12, up: 0.35, down: 0, rpe: 4 },
  renfo: { km: 0, up: 0, down: 0, rpe: 5 },
  autre: { km: 0.5, up: 0.5, down: 0.5, rpe: 4 },
};

export const isFoot = (s: Sport) => s === "trail" || s === "course" || s === "rando";

export function effort(a: ActivityLike, p: Physio = {}): { rpe: number; source: EffortSource } {
  if (a.rpe != null && a.rpe >= 1 && a.rpe <= 10) return { rpe: a.rpe, source: "ressenti" };
  const hr = a.avgHr, max = p.hrMax, rest = p.hrRest;
  const z = zoneMinutes(a.hrHist, p);
  if (z) {
    // Effort équivalent : celui qui, tenu toute la durée, coûterait autant que le temps réel dans chaque zone.
    const total = z.reduce((t, v) => t + v, 0);
    const mean = z.reduce((t, v, i) => t + v * stress(ZONE_RPE[i]), 0) / total;
    return { rpe: Math.round(Math.max(1, Math.min(10, rpeOfStress(mean))) * 10) / 10, source: "zones" };
  }
  if (hr && max && hr < max && hr > 60) {
    // Fractionné : la moyenne écrase les pics. Si la FC est montée très haut, l’effort réel est au-dessus de la moyenne.
    const spiky = a.maxHr && a.maxHr >= 0.93 * max && a.maxHr - hr >= 22 ? 1 : 0;
    if (rest && rest < hr) {
      const r = (hr - rest) / (max - rest); // réserve cardiaque (Karvonen)
      // Mêmes bornes que les zones cardiaques affichées (Z1 < 60 %, Z2 60-70 %, Z3 70-80 %, Z4 80-90 %, Z5 au-delà) :
      // une sortie en Z2 est une sortie facile, pas un effort modéré.
      const rpe = r < 0.6 ? 3 : r < 0.7 ? 4 : r < 0.75 ? 5 : r < 0.8 ? 6 : r < 0.85 ? 7 : r < 0.9 ? 8 : 9;
      return { rpe: Math.min(9, rpe + (rpe <= 6 ? spiky : 0)), source: "fc" };
    }
    const f = hr / max;
    // Sans FC de repos : bornes des zones en % de FC max (0,64 / 0,73 / 0,82 / 0,91).
    const rpe = f < 0.64 ? 3 : f < 0.73 ? 4 : f < 0.775 ? 5 : f < 0.82 ? 6 : f < 0.865 ? 7 : f < 0.91 ? 8 : 9;
    return { rpe: Math.min(9, rpe + (rpe <= 6 ? spiky : 0)), source: "fc" };
  }
  // Ni ressenti ni cardio : on juge l’effort à l’allure. L’allure ramenée au plat (100 m de D+ = 1 km) donne un coût en
  // oxygène, rapporté à la VO2max du coureur. Sur une sortie continue, 65 % correspond à un footing, 85 % au seuil.
  const km = a.distanceKm ?? 0;
  if (p.vdot && p.vdot >= 28 && (a.sport === "course" || a.sport === "trail") && km >= 2 && a.durationMin >= 12) {
    const v = ((km + Math.max(0, a.gainM ?? 0) / 100) * 1000 * (a.sport === "trail" ? 1.05 : 1)) / a.durationMin;
    if (v >= 40 && v <= 420) {
      const f = (-4.6 + 0.182258 * v + 0.000104 * v * v) / p.vdot;
      const rpe = f < 0.58 ? 3 : f < 0.72 ? 4 : f < 0.78 ? 5 : f < 0.84 ? 6 : f < 0.9 ? 7 : f < 0.96 ? 8 : 9;
      return { rpe, source: "allure" };
    }
  }
  return { rpe: IMPACT[a.sport].rpe, source: "estimé" };
}

export function sessionLoad(a: ActivityLike, p: Physio = {}) {
  const { rpe, source } = effort(a, p);
  const w = IMPACT[a.sport];
  const internal = a.durationMin * stress(rpe);
  const gain = Math.max(0, a.gainM ?? 0);
  const lossEstimated = a.lossM == null && gain > 0;
  const loss = Math.max(0, a.lossM ?? gain); // boucle supposée si le D− est inconnu
  const mechanical = Math.max(0, a.distanceKm ?? 0) * 1.5 * w.km + (gain / 100) * 6 * w.up + (loss / 100) * 7 * w.down;
  return {
    total: Math.round(internal + mechanical),
    internal: Math.round(internal),
    mechanical: Math.round(mechanical),
    rpe, source, lossEstimated,
  };
}
