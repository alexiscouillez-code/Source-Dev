import { diffDays, mondayOf } from "./dates";
import { isFoot, type ActivityLike } from "./load";

/**
 * Profil trail : six qualités notées de 0 à 100 à partir des 8 à 12 dernières semaines.
 *  - Endurance : la plus longue sortie (100 = 4 h).
 *  - Volume : temps moyen par semaine (100 = 8 h).
 *  - Montée : D+ moyen par semaine (100 = 2 000 m) et vitesse ascensionnelle sur les sorties vallonnées (100 = 700 m/h).
 *  - Descente : D− moyen par semaine (100 = 2 000 m).
 *  - Vitesse : VO2max estimée (35 → 0, 65 → 100).
 *  - Régularité : semaines avec au moins 3 sorties, et volume stable d’une semaine à l’autre.
 * Avec une course choisie, chaque qualité est aussi comparée à ce que demande la course.
 */
export type Axis = "endurance" | "volume" | "climb" | "descent" | "speed" | "consistency";
export interface AxisScore { key: Axis; label: string; score: number; value: string; target: number | null; targetText: string | null }
export interface Advice { key: Axis; title: string; why: string; sessions: string[] }
export interface TrailProfile {
  enough: boolean; sessions: number; weeks: number;
  axes: AxisScore[]; strengths: AxisScore[]; weaknesses: AxisScore[]; advice: Advice[];
  type: { name: string; line: string } | null;
}
export interface RaceNeeds { longMin: number; weeklyMin: number; weeklyGain: number; lossPerGain?: number }

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const h = (m: number) => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")}`;
const LABEL: Record<Axis, string> = { endurance: "Endurance", volume: "Volume", climb: "Montée", descent: "Descente", speed: "Vitesse", consistency: "Régularité" };

export function trailProfile(acts: ActivityLike[], today: string, vo2: number | null, race: RaceNeeds | null, iPace: string | null): TrailProfile {
  const WEEKS = 8;
  const foot = acts.filter((a) => isFoot(a.sport) && diffDays(a.date, today) >= 0 && diffDays(a.date, today) < WEEKS * 7);
  const longWin = acts.filter((a) => isFoot(a.sport) && diffDays(a.date, today) >= 0 && diffDays(a.date, today) < 84);
  const enough = foot.length >= 4;
  const byWeek = new Map<string, { min: number; n: number; gain: number; loss: number }>();
  for (let i = 0; i < WEEKS; i++) byWeek.set(mondayOf(new Date(Date.parse(`${today}T12:00:00Z`) - i * 7 * 864e5).toISOString().slice(0, 10)), { min: 0, n: 0, gain: 0, loss: 0 });
  for (const a of foot) {
    const w = byWeek.get(mondayOf(a.date)); if (!w) continue;
    w.min += a.durationMin; w.n++; w.gain += a.gainM ?? 0; w.loss += a.lossM ?? a.gainM ?? 0;
  }
  const weeks = [...byWeek.values()];
  const avg = (f: (w: (typeof weeks)[number]) => number) => weeks.reduce((s, w) => s + f(w), 0) / weeks.length;
  const weeklyMin = avg((w) => w.min), weeklyGain = avg((w) => w.gain), weeklyLoss = avg((w) => w.loss);
  const longest = longWin.reduce((m, a) => Math.max(m, a.durationMin), 0);
  const hilly = foot.filter((a) => (a.gainM ?? 0) >= 300 && a.distanceKm && (a.gainM ?? 0) / a.distanceKm >= 30);
  const vRate = hilly.length ? hilly.reduce((s, a) => s + (a.gainM ?? 0) / (a.durationMin / 60), 0) / hilly.length : null; // m de D+ par heure de sortie
  const active = weeks.filter((w) => w.n >= 3).length;
  const mean = weeklyMin || 1, sd = Math.sqrt(avg((w) => (w.min - weeklyMin) ** 2));
  const cv = sd / mean;

  const lossPerGain = race?.lossPerGain ?? 1;
  const axes: AxisScore[] = ([
    { key: "endurance", label: LABEL.endurance, score: clamp((longest / 240) * 100), value: longest ? `Plus longue sortie : ${h(longest)}` : "Aucune sortie longue récente",
      target: race ? clamp((race.longMin / 240) * 100) : null, targetText: race ? `Ta course demande ${h(race.longMin)}` : null },
    { key: "volume", label: LABEL.volume, score: clamp((weeklyMin / 480) * 100), value: `${h(weeklyMin)} par semaine en moyenne`,
      target: race ? clamp((race.weeklyMin / 480) * 100) : null, targetText: race ? `Conseillé : ${h(race.weeklyMin)}` : null },
    { key: "climb", label: LABEL.climb, score: clamp(0.6 * (weeklyGain / 2000) * 100 + 0.4 * (vRate != null ? (vRate / 700) * 100 : (weeklyGain / 2000) * 100)),
      value: `${Math.round(weeklyGain)} m D+ par semaine${vRate != null ? ` · ${Math.round(vRate)} m/h en sortie vallonnée` : ""}`,
      target: race ? clamp((race.weeklyGain / 2000) * 100) : null, targetText: race ? `Conseillé : ${race.weeklyGain} m D+ par semaine` : null },
    { key: "descent", label: LABEL.descent, score: clamp((weeklyLoss / 2000) * 100), value: `${Math.round(weeklyLoss)} m D− par semaine`,
      target: race ? clamp(((race.weeklyGain * lossPerGain) / 2000) * 100) : null, targetText: race ? `Conseillé : ${Math.round(race.weeklyGain * lossPerGain)} m D− par semaine` : null },
    { key: "speed", label: LABEL.speed, score: vo2 != null ? clamp(((vo2 - 35) / 30) * 100) : 0, value: vo2 != null ? `VO2max estimée ${vo2.toFixed(1).replace(".", ",")}` : "VO2max inconnue (il faut des sorties avec cardio)",
      target: null, targetText: null },
    { key: "consistency", label: LABEL.consistency, score: clamp((active / WEEKS) * 100 * (1 - Math.min(0.5, cv / 2))), value: `${active} semaine${active > 1 ? "s" : ""} sur ${WEEKS} avec 3 sorties ou plus`,
      target: null, targetText: null },
  ] satisfies AxisScore[]).map((a) => ({ ...a, score: Math.round(a.score), target: a.target == null ? null : Math.round(a.target) }));

  // Écart à combler : par rapport à la course si elle est connue, sinon note absolue.
  const gap = (a: AxisScore) => (a.target != null ? a.score - a.target : a.score - 60);
  const known = axes.filter((a) => a.key !== "speed" || vo2 != null);
  const sorted = [...known].sort((a, b) => gap(b) - gap(a));
  const strengths = sorted.filter((a) => gap(a) >= 0 || a.score >= 65).slice(0, 2);
  const weaknesses = [...sorted].reverse().filter((a) => !strengths.includes(a) && (gap(a) < 0 || a.score < 50)).slice(0, 3);

  const ADVICE: Record<Axis, Omit<Advice, "key">> = {
    endurance: { title: "Allonger la sortie longue", why: "C’est elle qui apprend au corps à durer : économie de glycogène, tendons, mental.",
      sessions: [`Rallonge ta sortie longue de 10 à 15 min par semaine${race ? ` jusqu’à ${h(race.longMin)}` : ""}, une semaine plus légère toutes les quatre.`, "Marche dans les montées dès le début et entraîne-toi à manger toutes les 30 à 45 min.", "Pour les formats longs : deux sorties le samedi et le dimanche plutôt qu’une seule énorme."] },
    volume: { title: "Augmenter le volume progressivement", why: "Le volume hebdomadaire construit la forme de fond qui te portera sur toute la course.",
      sessions: ["Ajoute un footing facile de 40 min par semaine, en zone 2.", "Augmente ton temps total de 8 % par semaine au plus.", "Le vélo ou la marche rapide comptent pour le cardio sans charger les jambes."] },
    climb: { title: "Travailler la montée", why: "En trail, la montée décide souvent du temps final et de la fatigue.",
      sessions: ["Une séance de côtes par semaine : 8 à 10 × 2 min en montée à effort 7/10, retour en trottinant.", "Des montées longues de 15 à 30 min à effort régulier, avec bâtons si tu cours avec.", "Renforcement : montées de marche, squats et mollets, 2 fois 15 min par semaine."] },
    descent: { title: "Travailler la descente", why: "La descente abîme les quadriceps (effort excentrique) : peu entraînée, elle coûte cher en fin de course.",
      sessions: ["Inclue des descentes dans tes sorties longues, sur terrain varié.", "6 à 8 × 1 min de descente rapide, pas courts et buste relâché, remontée en marchant.", "Renforcement excentrique : squats lents, fentes, descentes de marches, 2 fois par semaine."] },
    speed: { title: "Développer la vitesse", why: "Une VO2max plus haute rend toutes les allures plus faciles, même en ultra.",
      sessions: [`Une séance de VMA tous les 7 à 10 jours : 6 × 3 min${iPace ? ` à ${iPace} /km` : " à effort 8/10"}, récupération 2 min en trottinant.`, "Ou en côte : 10 × 1 min 30 vite en montée, retour en marchant.", "Garde 80 % de ton volume en endurance facile pour bien assimiler."] },
    consistency: { title: "Être plus régulier", why: "Trois sorties par semaine, toutes les semaines, font plus que de gros blocs suivis de coupures.",
      sessions: ["Bloque 3 créneaux fixes dans ta semaine, même courts (30 à 40 min).", "Active le rappel du check-in pour garder le rythme.", "Une semaine chargée ? Raccourcis plutôt que de sauter."] },
  };
  const advice = weaknesses.map((w) => ({ key: w.key, ...ADVICE[w.key] }));

  // Type de coureur, d’après les deux qualités dominantes.
  let type: TrailProfile["type"] = null;
  if (enough) {
    const top = [...known].sort((a, b) => b.score - a.score).slice(0, 2).map((a) => a.key);
    const has = (k: Axis) => top.includes(k);
    type = has("climb") && has("descent") ? { name: "Montagnard", line: "À l’aise dès que ça grimpe et que ça redescend : les parcours techniques sont ton terrain." }
      : has("climb") ? { name: "Grimpeur", line: "Tu avales le dénivelé positif : les courses très verticales te conviennent." }
      : has("descent") ? { name: "Descendeur", line: "Tes jambes encaissent bien la descente : un vrai atout en fin de course." }
      : has("endurance") && has("volume") ? { name: "Diesel", line: "Tu dures longtemps : les longs formats sont faits pour toi." }
      : has("speed") ? { name: "Rouleur rapide", line: "Ton moteur est puissant : les trails courts et roulants te vont bien." }
      : has("consistency") ? { name: "Régulier", line: "Ta constance est ta force : elle paie sur la durée." }
      : { name: "Polyvalent", line: "Pas de point dominant : tu progresses sur tous les fronts." };
  }
  return { enough, sessions: foot.length, weeks: WEEKS, axes, strengths, weaknesses, advice, type };
}
