import { diffDays } from "./dates";
import { perHourNeeds } from "./strategy";

/**
 * Entraîner l’alimentation de course (« entraîner l’estomac ») sur les sorties longues.
 *  - Cible du jour J : celle du plan de course (40–60 g/h jusqu’à 3 h de course, 60–90 g/h au-delà).
 *  - Progression : 30 g/h au début de la préparation, puis montée régulière jusqu’au bas de la fourchette de la course
 *    quatre semaines avant, et jusqu’à son milieu pendant le dernier bloc. L’affûtage garde la dernière cible.
 *  - Ressenti : si le dernier essai n’est « pas passé », la cible recule de 10 g/h ; « limite », elle ne monte pas.
 *  - Uniquement les sorties de 75 min et plus : en dessous, l’eau suffit.
 * Les quantités sont arrondies à 5 g et traduites en gels de 25 g (ou l’équivalent en boisson, barre, compote).
 */
export type FuelFeel = "ok" | "limite" | "ko";
export interface FuelTarget { gPerHour: number; total: number; gels: number; waterMl: number; text: string }

export function raceFuel(raceMin: number): [number, number] {
  const c = perHourNeeds(raceMin).carbs;
  return c[1] ? c : [30, 40];
}

export function fuelTarget(o: { date: string; durationMin: number; planStart: string; raceDate: string; raceMin: number; lastFeel?: FuelFeel | null; lastTarget?: number | null }): FuelTarget | null {
  if (o.durationMin < 75 || o.raceMin < 90) return null;
  const [lo, hi] = raceFuel(o.raceMin);
  const span = Math.max(14, diffDays(o.planStart, o.raceDate) - 28);
  const t = Math.min(1, Math.max(0, diffDays(o.planStart, o.date) / span));
  let g = 30 + (lo - 30) * t;
  if (diffDays(o.date, o.raceDate) <= 28) g = Math.max(g, (lo + hi) / 2);
  if (o.lastTarget && o.lastFeel === "ko") g = Math.min(g, o.lastTarget - 10);
  else if (o.lastTarget && o.lastFeel === "limite") g = Math.min(g, o.lastTarget);
  g = Math.round(Math.max(20, Math.min(hi, g)) / 5) * 5;
  const h = o.durationMin / 60;
  // On commence à manger après 30 min environ : la première demi-heure ne compte pas.
  const total = Math.round((g * Math.max(0.5, h - 0.5)) / 5) * 5;
  const gels = Math.max(1, Math.round(total / 25));
  const waterMl = Math.round((h * 550) / 50) * 50;
  const text = `Alimentation à entraîner : ${g} g de glucides par heure dès la 30e minute, soit environ ${total} g (${gels} gel${gels > 1 ? "s" : ""} ou l’équivalent), et ${String(waterMl / 1000).replace(".", ",")} L d’eau. Utilise les produits que tu prendras le jour J.`;
  return { gPerHour: g, total, gels, waterMl, text };
}
