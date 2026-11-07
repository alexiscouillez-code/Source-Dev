/**
 * Charge Trail Pilot (unité « UA »).
 *
 * charge = interne + mécanique
 *  - interne   = durée (min) × (0,7 + 0,16 × effort), l’effort (1-10) venant du ressenti,
 *                sinon de la fréquence cardiaque moyenne, sinon d’une valeur par défaut du sport ;
 *  - mécanique = coût des impacts et du dénivelé : 1,5/km, 6 par 100 m de D+, 7 par 100 m de D−
 *                (la descente, excentrique, abîme davantage), pondérés selon le sport.
 *
 * Ce sont des heuristiques d’entraînement, pas un modèle médical ni un risque de blessure.
 */
export type Sport = "trail" | "course" | "rando" | "velo" | "renfo" | "autre";
export const SPORTS: Record<Sport, string> = { trail: "Trail", course: "Course", rando: "Randonnée", velo: "Vélo", renfo: "Renforcement", autre: "Autre" };

export interface ActivityLike {
  date: string; sport: Sport; durationMin: number;
  distanceKm?: number | null; gainM?: number | null; lossM?: number | null;
  avgHr?: number | null; rpe?: number | null;
}
export interface Physio { hrMax?: number | null; hrRest?: number | null }
export type EffortSource = "ressenti" | "fc" | "estimé";

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
  if (hr && max && hr < max && hr > 60) {
    if (rest && rest < hr) {
      const r = (hr - rest) / (max - rest); // réserve cardiaque (Karvonen)
      const rpe = r < 0.5 ? 3 : r < 0.6 ? 4 : r < 0.7 ? 5 : r < 0.78 ? 6 : r < 0.85 ? 7 : r < 0.9 ? 8 : 9;
      return { rpe, source: "fc" };
    }
    const f = hr / max;
    const rpe = f < 0.68 ? 3 : f < 0.74 ? 4 : f < 0.8 ? 5 : f < 0.85 ? 6 : f < 0.89 ? 7 : f < 0.93 ? 8 : 9;
    return { rpe, source: "fc" };
  }
  return { rpe: IMPACT[a.sport].rpe, source: "estimé" };
}

export function sessionLoad(a: ActivityLike, p: Physio = {}) {
  const { rpe, source } = effort(a, p);
  const w = IMPACT[a.sport];
  const internal = a.durationMin * (0.7 + 0.16 * rpe);
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
