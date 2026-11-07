/**
 * Allures et zones d’entraînement personnelles.
 *
 * Allures (sur plat) : modèle de Daniels-Gilbert. Pour une VO2max (VDOT) donnée, on cherche la vitesse
 * dont le coût en oxygène correspond à une fraction de la VO2max :
 *   endurance 62-74 %, marathon 79-84 %, seuil 86-89 %, VMA (fractionné) 96-100 %.
 * Zones cardio : méthode de Karvonen (réserve cardiaque) si la FC de repos est connue, sinon % de FC max.
 */
export type PaceKey = "E" | "M" | "T" | "I";
export interface PaceRange { key: PaceKey; label: string; use: string; fast: number; slow: number } // secondes par km
export interface HrZone { z: 1 | 2 | 3 | 4 | 5; label: string; low: number; high: number }
export interface Targets { vdot: number | null; paces: PaceRange[]; zones: HrZone[]; method: "reserve" | "max" | null }

/** Vitesse (m/min) dont le coût en oxygène (−4,6 + 0,182258·v + 0,000104·v²) vaut `vo2`. */
function speedFor(vo2: number) {
  const a = 0.000104, b = 0.182258, c = -4.6 - vo2;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}
const secPerKm = (vdot: number, frac: number) => Math.round(60000 / speedFor(vdot * frac));

const PACES: { key: PaceKey; label: string; use: string; lo: number; hi: number }[] = [
  { key: "E", label: "Endurance", use: "Footings, sorties longues, récupération", lo: 0.62, hi: 0.74 },
  { key: "M", label: "Allure marathon", use: "Rappels d’allure, tempo long", lo: 0.79, hi: 0.84 },
  { key: "T", label: "Seuil", use: "Tempo, blocs de 8 à 20 min", lo: 0.86, hi: 0.89 },
  { key: "I", label: "VMA", use: "Fractionné de 2 à 5 min", lo: 0.96, hi: 1 },
];
const ZONES: { z: HrZone["z"]; label: string; lo: number; hi: number }[] = [
  { z: 1, label: "Récupération", lo: 0.5, hi: 0.6 },
  { z: 2, label: "Endurance", lo: 0.6, hi: 0.7 },
  { z: 3, label: "Tempo", lo: 0.7, hi: 0.8 },
  { z: 4, label: "Seuil", lo: 0.8, hi: 0.9 },
  { z: 5, label: "VMA", lo: 0.9, hi: 1 },
];

export function trainingTargets(vdot: number | null, hrMax: number | null, hrRest: number | null): Targets {
  const paces = vdot ? PACES.map((p) => ({ key: p.key, label: p.label, use: p.use, fast: secPerKm(vdot, p.hi), slow: secPerKm(vdot, p.lo) })) : [];
  let zones: HrZone[] = [], method: Targets["method"] = null;
  if (hrMax) {
    const reserve = hrRest && hrRest < hrMax ? hrMax - hrRest : null;
    method = reserve ? "reserve" : "max";
    zones = ZONES.map((z) => ({
      z: z.z, label: z.label,
      low: Math.round(reserve ? hrRest! + reserve * z.lo : hrMax * (z.lo + 0.1 * (1 - z.lo))),
      high: Math.round(reserve ? hrRest! + reserve * z.hi : hrMax * (z.hi + 0.1 * (1 - z.hi))),
    }));
  }
  return { vdot, paces, zones, method };
}

/** Consigne d’une séance du plan : allure sur plat et zone cardio selon son type. */
export function sessionTarget(t: Targets, template: string, rpe: number): { pace: PaceRange | null; zones: [number, number] | null; hint: string | null } {
  const p = (k: PaceKey) => t.paces.find((x) => x.key === k) ?? null;
  switch (template) {
    case "easy": case "long": case "b2b": case "recovery":
      return { pace: p("E"), zones: rpe <= 2 ? [1, 2] : [2, 2], hint: template === "recovery" ? null : "En montée, marche dès que la FC dépasse la zone." };
    case "test": return { pace: p("E"), zones: [2, 3], hint: "Teste ton allure de course et ta nutrition." };
    case "sharpen": return { pace: p("M"), zones: [3, 3], hint: null };
    case "tempo": return { pace: p("T"), zones: [3, 4], hint: "Blocs au seuil, récupération en endurance." };
    case "hills": return { pace: null, zones: [4, 5], hint: "En côte, fie-toi à la FC plutôt qu’à l’allure." };
    case "climb": return { pace: null, zones: [3, 4], hint: "Montées longues à effort régulier, bâtons si tu cours avec." };
    case "downhill": return { pace: null, zones: [2, 3], hint: "La descente se travaille à la technique, pas au chrono." };
    default: return { pace: null, zones: null, hint: null };
  }
}

export const fmtPace = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
