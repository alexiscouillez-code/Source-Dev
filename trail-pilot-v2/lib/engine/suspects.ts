/**
 * Séances suspectes : une seule sortie mal enregistrée (doublon, chrono resté allumé, trajet en voiture
 * enregistré comme une course) peut multiplier la fatigue par dix et fausser le plan pendant des semaines.
 * On les repère pour que le coureur les exclue des calculs ou confirme qu’elles sont justes.
 */
import { isFoot, sessionLoad, type ActivityLike, type Physio } from "./load";

export interface SuspectInput extends ActivityLike { id: number; name: string | null; checkState?: number | null }
export type SuspectKind = "doublon" | "chrono" | "vitesse" | "charge";
export interface Suspect { id: number; date: string; name: string | null; sport: string; durationMin: number; distanceKm: number | null; load: number; kind: SuspectKind; reason: string; twinId?: number }

const fmtH = (min: number) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; };
const near = (a: number, b: number, abs: number, rel: number) => Math.abs(a - b) <= Math.max(abs, rel * Math.max(a, b));
const family = (s: string) => (s === "course" || s === "trail" ? "run" : s);

export function findSuspects(acts: SuspectInput[], physio: Physio): Suspect[] {
  const todo = acts.filter((a) => a.checkState == null);
  if (!todo.length) return [];
  const loads = new Map(acts.map((a) => [a.id, sessionLoad(a, physio).total]));
  // Référence : la charge d’une grosse sortie habituelle (90e centile), sur les séances non exclues.
  const ref = acts.filter((a) => a.checkState !== 1).map((a) => loads.get(a.id)!).filter((v) => v > 0).sort((a, b) => a - b);
  const p90 = ref.length >= 8 ? ref[Math.floor(ref.length * 0.9)] : null;
  const out = new Map<number, Suspect>();
  const add = (a: SuspectInput, kind: SuspectKind, reason: string, twinId?: number) => {
    if (out.has(a.id) || a.checkState != null) return;
    out.set(a.id, { id: a.id, date: a.date, name: a.name, sport: a.sport, durationMin: a.durationMin, distanceKm: a.distanceKm ?? null, load: loads.get(a.id) ?? 0, kind, reason, twinId });
  };

  // 1. Doublons : même jour, même type de sport, durée et distance quasi identiques (montre + fichier, deux imports Strava…).
  const byDay = new Map<string, SuspectInput[]>();
  for (const a of acts) { if (a.checkState === 1) continue; const k = `${a.date}|${family(a.sport)}`; byDay.set(k, [...(byDay.get(k) ?? []), a]); }
  for (const list of byDay.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.id - b.id);
    for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      if (a.durationMin < 10 || !near(a.durationMin, b.durationMin, 3, 0.05)) continue;
      const da = a.distanceKm ?? 0, db = b.distanceKm ?? 0;
      if ((da > 0 || db > 0) && !near(da, db, 0.3, 0.05)) continue;
      add(b, "doublon", `Même jour, même durée (${fmtH(b.durationMin)})${db ? ` et même distance (${String(Math.round(db * 10) / 10).replace(".", ",")} km)` : ""} qu’une autre séance : elle est sans doute comptée deux fois.`, a.id);
    }
  }

  for (const a of todo) {
    const km = a.distanceKm ?? 0, h = a.durationMin / 60, v = km > 0 && h > 0 ? km / h : null;
    // 2. Chrono resté allumé : très longue durée pour la distance parcourue, ou durée hors norme.
    if (a.durationMin > 20 * 60) add(a, "chrono", `Durée de ${fmtH(a.durationMin)} : le chronomètre est peut-être resté allumé après la sortie.`);
    else if (isFoot(a.sport) && h >= 5 && v != null && v < 1.6) add(a, "chrono", `${fmtH(a.durationMin)} pour ${String(Math.round(km * 10) / 10).replace(".", ",")} km, soit ${String(Math.round(v * 10) / 10).replace(".", ",")} km/h : le chronomètre a sans doute tourné pendant une pause.`);
    // 3. Vitesse impossible à pied : trajet motorisé ou vélo enregistré comme une course.
    if (v != null && km >= 3) {
      const max = a.sport === "rando" ? 10 : a.sport === "course" || a.sport === "trail" ? 24 : null;
      if (max && v > max) add(a, "vitesse", `Vitesse moyenne de ${Math.round(v)} km/h, impossible à pied : trajet en voiture ou sortie vélo enregistrée comme ${a.sport === "rando" ? "randonnée" : "course"} ?`);
    }
    // 4. Charge sans commune mesure avec les autres sorties.
    const l = loads.get(a.id) ?? 0;
    if (p90 && l > 1200 && l > 3.5 * p90) add(a, "charge", `Charge de ${l}, ${Math.round(l / p90)} fois une grosse sortie habituelle (${p90}). Si ce n’est pas une course exceptionnelle, une donnée est sans doute fausse.`);
  }
  return [...out.values()].sort((a, b) => b.load - a.load);
}

/**
 * Échelle robuste d’un graphique : un pic isolé ne doit pas écraser tout le reste.
 * Une moyenne exponentielle met des semaines à redescendre après un pic : un centile ne suffit pas,
 * on part donc de la médiane. En entraînement normal, la fatigue dépasse rarement 2 fois sa valeur médiane.
 */
export function robustMax(values: number[], floor = 10) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return floor;
  const max = v[v.length - 1], med = v[Math.floor(v.length / 2)];
  const cap = Math.max(floor, med * 2.2);
  return max > cap * 1.15 ? cap : Math.max(floor, max);
}
