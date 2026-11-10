import { sessionTarget, type Targets } from "./paces";
import { zoneMinutes, type Analysis } from "./streams";

/**
 * Prévu / réalisé : la séance a-t-elle été tenue ?
 *  - durée et dénivelé comparés au prévu ;
 *  - quand la sortie a été analysée seconde par seconde : part du temps passé dans la zone visée,
 *    au-dessus (trop intense) ou en dessous (trop facile) ;
 *  - un verdict court, celui qu’un entraîneur écrirait dans la marge.
 */
export interface Review {
  dur: number; gain: number | null; inZone: number | null; above: number | null; below: number | null;
  verdict: "tenue" | "courte" | "longue" | "intense" | "facile"; label: string;
}
const QUALITY = new Set(["tempo", "hills", "climb", "downhill", "sharpen", "test"]);

export function reviewSession(
  plan: { template: string; duration_min: number; gain_m: number | null; rpe_target: number },
  act: { duration_min: number; gain_m: number | null },
  analysis: Analysis | null, targets: Targets, physio: { hrMax: number | null; hrRest: number | null },
): Review | null {
  if (plan.template === "race" || plan.template === "strength" || !plan.duration_min) return null;
  const dur = Math.round((act.duration_min / plan.duration_min) * 100);
  const gain = plan.gain_m && plan.gain_m >= 100 && act.gain_m != null ? Math.round((act.gain_m / plan.gain_m) * 100) : null;
  let inZone: number | null = null, above: number | null = null, below: number | null = null;
  const t = sessionTarget(targets, plan.template, plan.rpe_target);
  const z = zoneMinutes(analysis?.hist, physio);
  if (z && t.zones) {
    const total = z.reduce((s, v) => s + v, 0);
    // Pour une séance de qualité, seule une partie se court dans la zone visée (échauffement, récupérations) :
    // on juge surtout l’excès, pas le temps en dessous.
    const [lo, hi] = t.zones;
    inZone = Math.round((z.slice(lo - 1, hi).reduce((s, v) => s + v, 0) / total) * 100);
    above = Math.round((z.slice(hi).reduce((s, v) => s + v, 0) / total) * 100);
    below = Math.round((z.slice(0, lo - 1).reduce((s, v) => s + v, 0) / total) * 100);
  }
  const quality = QUALITY.has(plan.template);
  let verdict: Review["verdict"] = "tenue", label = "Séance tenue";
  if (dur < 75) { verdict = "courte"; label = `Plus courte que prévu (${dur} %)`; }
  else if (dur > 135) { verdict = "longue"; label = `Plus longue que prévu (${dur} %)`; }
  else if (above != null && !quality && above >= 25) { verdict = "intense"; label = `Trop intense : ${above} % du temps au-dessus de la zone`; }
  else if (above != null && quality && above >= 45) { verdict = "intense"; label = `Plus dure que prévu : ${above} % au-dessus de la zone`; }
  else if (inZone != null && quality && inZone + (above ?? 0) < 15) { verdict = "facile"; label = "Le corps de séance n’a presque pas été couru dans la zone visée"; }
  else if (inZone != null) label = `Séance tenue · ${inZone} % dans la zone`;
  return { dur, gain, inZone, above, below, verdict, label };
}
