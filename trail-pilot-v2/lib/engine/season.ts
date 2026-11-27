import { addDays, diffDays } from "./dates";
import type { PlanItem } from "./planner";

/**
 * Saison à plusieurs courses principales (A) : le plan vise la prochaine, puis repart vers la suivante après une
 * récupération proportionnée à l'effort. Repères usuels pour enchaîner deux efforts à fond : 2 à 3 semaines après un trail
 * court, 4 à 6 après un 40-50 km, 8 semaines ou plus après un ultra.
 * Effort en « km-effort » : distance + D+ / 100 (comme le reste du moteur).
 */
export interface MainRace { key: string; name: string; date: string; distanceKm: number | null; gainM: number | null; chained?: boolean }

export const effortOf = (distanceKm: number | null, gainM: number | null) => {
  const km = distanceKm ?? 25;
  return km + (gainM ?? km * 35) / 100;
};

/** Jours de récupération active après la course (pas d'intensité, volume réduit). */
export function recoveryDays(effortKm: number) {
  if (effortKm < 35) return 7;
  if (effortKm < 70) return 14;
  if (effortKm < 130) return 21;
  return 28;
}

/** Écart conseillé avant une autre course à fond : récupération, reprise, puis affûtage. */
export function spacingDays(effortKm: number) {
  if (effortKm < 35) return 21;
  if (effortKm < 70) return 35;
  if (effortKm < 130) return 56;
  return 70;
}

const weeks = (d: number) => { const w = Math.round(d / 7); return `${w} semaine${w > 1 ? "s" : ""}`; };
const effortLabel = (e: number) => (e < 35 ? "un trail court" : e < 70 ? "un trail de cette taille" : e < 130 ? "un ultra" : "un long ultra");

export interface SeasonWarning { key: string; prevKey: string; prevName: string; gapDays: number; needDays: number; text: string }

/** Courses principales trop proches l'une de l'autre (sauf si l'enchaînement a été accepté). */
export function seasonWarnings(races: MainRace[]): SeasonWarning[] {
  const list = [...races].sort((a, b) => a.date.localeCompare(b.date));
  const out: SeasonWarning[] = [];
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1], cur = list[i];
    if (cur.chained) continue;
    const e = effortOf(prev.distanceKm, prev.gainM);
    const gap = diffDays(prev.date, cur.date), need = spacingDays(e);
    if (gap < need) out.push({
      key: cur.key, prevKey: prev.key, prevName: prev.name, gapDays: gap, needDays: need,
      text: `${weeks(gap)} après ${prev.name} : après ${effortLabel(e)}, on conseille plutôt ${weeks(need)} pour récupérer, reprendre et s’affûter avant de courir à fond.`,
    });
  }
  return out;
}

/**
 * Récupération après une course principale passée : rien les premiers jours après une longue course, puis seulement des
 * footings faciles, de plus en plus longs ; ni séance de qualité ni sortie longue avant la fin de la période.
 */
export function withRecovery(items: PlanItem[], race: { name: string; date: string; distanceKm: number | null; gainM: number | null }, today: string): { items: PlanItem[]; note: string | null } {
  const e = effortOf(race.distanceKm, race.gainM);
  const days = recoveryDays(e), end = addDays(race.date, days);
  if (end <= today) return { items, note: null };
  const offDays = e >= 70 ? 3 : e >= 35 ? 2 : 1;
  const out: PlanItem[] = [];
  for (const p of items) {
    const d = diffDays(race.date, p.date);
    if (d <= 0 || d > days || p.template === "race") { out.push(p); continue; }
    if (d <= offDays) continue; // repos complet
    const k = d / days;
    if (p.template === "strength" && k < 0.5) continue;
    if (p.template === "strength") { out.push(p); continue; }
    const cap = k < 0.4 ? 30 : k < 0.75 ? 45 : 60;
    const keep = p.template === "easy" && p.durationMin <= cap;
    out.push(keep ? { ...p, rpeTarget: Math.min(p.rpeTarget, 3) } : {
      ...p, template: "easy", sport: p.sport === "velo" ? "velo" : "course", gainM: null, rpeTarget: k < 0.4 ? 2 : 3,
      durationMin: Math.min(cap, Math.max(20, Math.round(p.durationMin / 5) * 5)),
      title: k < 0.4 ? "Footing de récupération" : "Endurance facile",
      description: `Récupération après ${race.name} : ${k < 0.4 ? "très facile, sur terrain souple, de la marche si les jambes sont lourdes" : "allure conversation, sans intensité"}. Les séances dures reprennent après le ${new Date(`${end}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" })}.`,
    });
  }
  return { items: out, note: `Récupération après ${race.name} : repos les ${offDays === 1 ? "lendemain" : `${offDays} premiers jours`}, puis footings faciles jusqu’au ${new Date(`${end}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" })}, avant de repartir vers la suite de ta saison.` };
}
