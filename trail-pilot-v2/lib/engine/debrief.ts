import type { Analysis } from "./streams";
import { zoneMinutes } from "./streams";

/**
 * Débrief après course : ce qui était prévu contre ce qui s’est passé.
 *  - résultat : temps réel face à la fourchette estimée avant la course ;
 *  - sections (si le tracé de la course avait été importé et que la sortie a ses temps de passage) :
 *    temps prévu et temps réel de chaque tronçon, et comment l’écart évolue du début à la fin ;
 *  - cardio : part du temps en zones hautes, dérive ;
 *  - enseignements : quelques phrases tirées des chiffres et de ce que le coureur a coché.
 * Rien d’automatique sur le plan : l’estimation de la course suivante se recale d’elle-même, puisque
 * la course entre dans le calcul de la forme.
 */
export interface PlannedRace {
  name: string; date: string; distanceKm: number | null; gainM: number | null;
  estimate: { low: number; high: number } | null;
  /** Temps médian du modèle sans calibrage, et calibrage appliqué à l’estimation affichée */
  modelMid?: number | null; calib?: number | null;
  sections?: { label: string; from: number; to: number; gain: number; loss: number; low: number; high: number }[];
}
export interface RaceActivity { durationMin: number; distanceKm: number | null; gainM: number | null; avgHr: number | null }
export const TAGS: Record<string, string> = {
  parfait: "Tout s’est bien passé", depart: "Départ trop rapide", nutrition: "Alimentation ou hydratation", crampes: "Crampes", digestif: "Ventre en vrac",
  montee: "Montées difficiles", descente: "Descentes difficiles", mental: "Coup de moins bien", materiel: "Matériel", meteo: "Météo",
};
export interface DebriefSection { label: string; from: number; to: number; planned: number; actual: number; delta: number; tone: "vite" | "ok" | "lent" }
export interface Debrief {
  actual: number;
  result: { tone: "mieux" | "prevu" | "moins" | "inconnu"; label: string; delta: number | null };
  route: { match: boolean; note: string | null };
  sections: DebriefSection[] | null;
  fade: number | null;
  high: number | null; dec: number | null;
  lessons: string[];
}

const fmt = (m: number) => { const r = Math.round(m); return r >= 60 ? `${Math.floor(r / 60)} h ${String(r % 60).padStart(2, "0")}` : `${r} min`; };

/** Temps écoulé (min) au kilomètre x, d’après les temps de passage à chaque km (interpolé). */
export function timeAt(km: number[], end: [number, number] | undefined, x: number): number | null {
  if (x <= 0) return 0;
  const i = Math.floor(x);
  const at = (k: number) => (k === 0 ? 0 : km[k - 1]);
  if (i < km.length) return (at(i) + (x - i) * (km[i] - at(i))) / 60;
  // Dernier kilomètre, incomplet : jusqu’à la fin de l’enregistrement.
  if (end && x <= end[1] + 0.15) { const d0 = km.length, t0 = at(d0); return (t0 + Math.min(1, Math.max(0, (x - d0) / Math.max(0.01, end[1] - d0))) * (end[0] - t0)) / 60; }
  return null;
}

export function debrief(plan: PlannedRace, act: RaceActivity, analysis: Analysis | null, physio: { hrMax: number | null; hrRest: number | null }, tags: string[] = []): Debrief {
  const actual = act.durationMin, lessons: string[] = [];
  // Parcours : la sortie correspond-elle à la course prévue ?
  const dk = plan.distanceKm && act.distanceKm ? act.distanceKm / plan.distanceKm : null;
  const match = dk == null || (dk > 0.88 && dk < 1.12);
  const routeNote = dk == null ? null : !match ? `Ta sortie fait ${String(act.distanceKm).replace(".", ",")} km pour ${String(plan.distanceKm).replace(".", ",")} km prévus : la comparaison est indicative.` : null;

  // Résultat face à l’estimation
  let result: Debrief["result"] = { tone: "inconnu", label: "Pas d’estimation à comparer", delta: null };
  if (plan.estimate && match) {
    const { low, high } = plan.estimate;
    if (actual < low) { result = { tone: "mieux", label: `${fmt(low - actual)} sous l’estimation`, delta: Math.round(actual - low) }; lessons.push(`Tu as fini ${fmt(low - actual)} plus vite que l’estimation la plus optimiste : ta forme valait mieux que le calcul. Tes prochaines estimations sont recalées sur ce résultat.`); }
    else if (actual > high) { result = { tone: "moins", label: `${fmt(actual - high)} au-dessus de l’estimation`, delta: Math.round(actual - high) }; lessons.push(`Tu as mis ${fmt(actual - high)} de plus que l’estimation prudente. Regarde dans les sections où le temps est parti avant de conclure sur ta forme : un départ trop rapide ou un souci d’alimentation coûtent plus qu’un manque d’entraînement.`); }
    else { result = { tone: "prevu", label: "Dans la fourchette prévue", delta: 0 }; lessons.push("Tu as fini dans la fourchette estimée : l’estimation était juste, tu peux t’y fier pour la suite. Tes prochaines estimations sont recalées sur ce résultat."); }
  }

  // Sections : temps réel de chaque tronçon, d’après les temps de passage au kilomètre
  let sections: DebriefSection[] | null = null, fade: number | null = null;
  if (plan.sections?.length && analysis?.km?.length && match && plan.distanceKm) {
    // Petit écart de distance entre le tracé et la montre : les bornes sont ramenées à la distance mesurée.
    const k = act.distanceKm ? act.distanceKm / plan.distanceKm : 1;
    const out: DebriefSection[] = [];
    for (const s of plan.sections) {
      const a = timeAt(analysis.km, analysis.end, s.from * k), b = timeAt(analysis.km, analysis.end, Math.min(s.to * k, analysis.end?.[1] ?? s.to * k));
      if (a == null || b == null || b <= a) { out.length = 0; break; }
      const planned = (s.low + s.high) / 2, real = b - a, delta = Math.round((real / planned - 1) * 100);
      out.push({ label: s.label, from: s.from, to: s.to, planned: Math.round(planned), actual: Math.round(real), delta, tone: delta <= -6 ? "vite" : delta >= 8 ? "lent" : "ok" });
    }
    if (out.length >= 2) {
      sections = out;
      // Évolution de l’écart : seconde moitié du parcours face à la première, à profil égal (le prévu tient compte du relief).
      // Coupure au plus près de la mi-course en temps prévu.
      const totalPlanned = out.reduce((t, x) => t + x.planned, 0);
      let half = 1, bestGap = Infinity, cum = 0;
      for (let i = 0; i < out.length - 1; i++) { cum += out[i].planned; const g = Math.abs(cum / totalPlanned - 0.5); if (g < bestGap) { bestGap = g; half = i + 1; } }
      const ratio = (l: DebriefSection[]) => l.reduce((t, x) => t + x.actual, 0) / Math.max(1, l.reduce((t, x) => t + x.planned, 0));
      const r1 = ratio(out.slice(0, half)), r2 = ratio(out.slice(half));
      fade = out.length > half ? Math.round((r2 / r1 - 1) * 100) : null;
      if (fade != null && fade >= 10) lessons.push(`Tu as perdu ${fade} % sur la seconde moitié par rapport à la première, relief pris en compte. Le temps s’est joué là : pars un cran plus lentement et mange plus tôt.`);
      else if (fade != null && fade <= -6) lessons.push(`Tu as fini plus fort que tu n’as commencé (${-fade} % de mieux sur la seconde moitié) : gestion prudente, tu peux partir un peu plus franchement la prochaine fois.`);
      else if (fade != null) lessons.push("Effort régulier du début à la fin : ta gestion de course était bonne.");
      const worst = [...out].sort((a, b) => b.delta - a.delta)[0];
      if (worst.delta >= 15) lessons.push(`Le tronçon le plus coûteux : ${worst.label} (${fmt(worst.actual)} pour ${fmt(worst.planned)} prévues${worst.to - worst.from > 0 ? "" : ""}).`);
    }
  }

  // Cardio
  const z = analysis ? zoneMinutes(analysis.hist, physio) : null;
  const total = z ? z.reduce((a, b) => a + b, 0) : 0;
  const high = z && total > 20 ? Math.round(((z[3] + z[4]) / total) * 100) : null;
  const dec = analysis?.dec ?? null;
  if (high != null && actual >= 180 && high >= 25) lessons.push(`${high} % du temps en zones 4 et 5 : c’est trop haut pour une course de ${fmt(actual)}. Au-delà de 3 h, vise la zone 3 au plus dans les montées.`);
  if (dec != null && dec >= 8 && fade == null) lessons.push(`Ta fréquence cardiaque a dérivé de ${String(dec).replace(".", ",")} % à allure égale : signe de déshydratation, de chaleur ou d’un début trop rapide.`);

  // Ce que le coureur a coché
  const t = new Set(tags);
  if (t.has("depart") && !(fade != null && fade >= 10)) lessons.push("Départ trop rapide : sur la prochaine course, laisse-toi doubler pendant le premier quart et cale-toi sur la respiration, pas sur les autres.");
  if (t.has("nutrition")) lessons.push("Alimentation : répète ton plan de ravitaillement sur tes sorties longues (mêmes produits, mêmes quantités, à heure fixe) jusqu’à ce qu’il passe sans y penser.");
  if (t.has("crampes")) lessons.push("Crampes : elles viennent le plus souvent d’une intensité au-dessus de ce que les jambes ont appris à tenir. Plus de dénivelé en sortie longue et un départ plus sage aident davantage que le sel.");
  if (t.has("digestif")) lessons.push("Ventre : teste de plus petites prises plus souvent, évite le très sucré concentré, et entraîne l’estomac en sortie longue.");
  if (t.has("descente")) lessons.push("Descentes : garde la séance de descente du plan et ajoute du renforcement excentrique (fentes, descentes d’escaliers) ; les cuisses s’y habituent en quelques semaines.");
  if (t.has("montee")) lessons.push("Montées : les séances de côtes et de montée longue du plan visent ça. En course, marche tôt et vite plutôt que de courir lentement.");
  if (t.has("mental")) lessons.push("Coup de moins bien : il arrive presque toujours et il passe. Mange, ralentis dix minutes, et découpe la course en tronçons jusqu’au prochain ravito.");
  if (t.has("materiel")) lessons.push("Matériel : note ce qui a gêné tant que c’est frais, et refais une sortie longue avec la solution avant la prochaine course.");
  if (t.has("meteo")) lessons.push("Météo : regarde la prévision de ta prochaine course dans le Planning dès J-15 pour adapter équipement, allure et boisson.");
  return { actual, result, route: { match, note: routeNote }, sections, fade, high, dec, lessons: lessons.slice(0, 6) };
}

/** Ce que cette course laisse attendre sur une autre, plus longue : même coureur, la durée croît un peu plus vite que la distance (exposant 1,10 sur le km-effort). */
export function project(actualMin: number, from: { distanceKm: number; gainM: number }, to: { distanceKm: number; gainM: number }): { low: number; high: number } | null {
  const e1 = from.distanceKm + from.gainM / 100, e2 = to.distanceKm + to.gainM / 100;
  if (!(e1 >= 8) || !(e2 > 0) || e2 / e1 > 4 || e2 / e1 < 0.5) return null;
  const mid = actualMin * (e2 / e1) ** 1.1;
  return { low: Math.round((mid * 0.95) / 5) * 5, high: Math.round((mid * 1.1) / 5) * 5 };
}
