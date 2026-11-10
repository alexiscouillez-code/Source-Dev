import { addDays, diffDays, mondayOf } from "./dates";
import { isFoot, type ActivityLike } from "./load";
import { raceTime } from "./vo2";

/**
 * Plan d’entraînement pour une course choisie.
 *
 * 1. Ce que demande la course : km-effort (km + D+/100), temps estimé, volume hebdo de pointe,
 *    sortie longue de pointe, D+ hebdo, enchaînements pour les formats longs.
 * 2. D’où part le coureur : volume, plus longue sortie et D+ des 4 dernières semaines, état de charge.
 * 3. La progression : +6 à +10 % par semaine selon le niveau, une semaine plus légère toutes les 4,
 *    plateau une fois la pointe atteinte, affûtage avant la course.
 * 4. Le verdict : le volume et la sortie longue atteignables suffisent-ils pour finir ?
 *
 * Ce sont des repères de préparation, pas une prescription médicale.
 */
export type Level = "debutant" | "regulier" | "confirme";
export interface PlannerProfile { daysPerWeek: number; longDay: number; maxWeeklyMinutes: number | null; level: Level }
export interface PlannerGoal { name: string; date: string; distanceKm: number | null; gainM: number | null }
export interface LoadState { ctl: number; atl: number; ratio: number | null; calibrated: boolean }
export interface PlanItem {
  date: string; template: Template; title: string; sport: string; durationMin: number;
  gainM: number | null; rpeTarget: number; description: string; phase: string;
}
export type Template = "easy" | "long" | "b2b" | "test" | "hills" | "climb" | "tempo" | "downhill" | "strength" | "sharpen" | "race";
export type Verdict = "solide" | "ambitieux" | "risque" | "court";

export interface PlanWeek { monday: string; phase: string; minutes: number; longMin: number; gainM: number; focus: string; light: boolean }
export interface RacePlan {
  generatedOn: string;
  race: { name: string; date: string; distanceKm: number; gainM: number; effortKm: number; daysTo: number; assumed: boolean };
  estimate: { low: number; high: number };
  /** D’où vient le temps estimé : la VO2max du coureur, sinon son niveau déclaré. */
  estimateFrom?: "vo2" | "niveau";
  demands: { weeklyMin: number; longMin: number; weeklyGain: number; backToBack: boolean };
  current: { weeklyMin: number; longestMin: number; weeklyGain: number; hasHistory: boolean };
  reach: { weeklyMin: number; longMin: number };
  verdict: Verdict; headline: string; notes: string[];
  /** Pourquoi l’objectif est ambitieux ou risqué, et comment le rendre atteignable. */
  diagnosis?: { causes: string[]; fixes: string[] };
  weeks: PlanWeek[];
}

const FALLBACK_WEEKLY: Record<Level, number> = { debutant: 120, regulier: 210, confirme: 330 };
const PACE: Record<Level, number> = { debutant: 7.6, regulier: 6, confirme: 5 }; // min par km-effort sur un format court
const GROWTH: Record<Level, number> = { debutant: 1.06, regulier: 1.08, confirme: 1.1 };
const VOLUME_FACTOR: Record<Level, number> = { debutant: 0.85, regulier: 1, confirme: 1.12 };
// Jours d’entraînement par semaine, sortie longue en dernier (dimanche = 6), puis décalés vers le jour choisi.
const SLOTS: Record<number, number[]> = { 2: [2, 6], 3: [1, 3, 6], 4: [1, 3, 4, 6], 5: [0, 1, 3, 4, 6], 6: [0, 1, 2, 3, 4, 6], 7: [0, 1, 2, 3, 4, 5, 6] };
export const MAX_PLAN_DAYS = 400;

const round5 = (n: number) => Math.max(20, Math.round(n / 5) * 5);
const round50 = (n: number) => Math.round(n / 50) * 50;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const TAPER_VOLUME: Record<number, number[]> = { 1: [0.65], 2: [0.75, 0.6], 3: [0.8, 0.68, 0.55] };
const TAPER_LONG: Record<number, number[]> = { 1: [0.55], 2: [0.7, 0.55], 3: [0.75, 0.6, 0.45] };

// ---------- État de départ ----------
const recentFoot = (acts: ActivityLike[], today: string) =>
  acts.filter((a) => { const d = diffDays(a.date, today); return d >= 1 && d <= 28 && isFoot(a.sport); });

export function baselineWeekly(activities: ActivityLike[], today: string, level: Level) {
  const minutes = recentFoot(activities, today).reduce((s, a) => s + a.durationMin, 0) / 4;
  return minutes >= 45 ? minutes : FALLBACK_WEEKLY[level];
}
export function recentLongest(activities: ActivityLike[], today: string) {
  return recentFoot(activities, today).reduce((m, a) => Math.max(m, a.durationMin), 0);
}
const recentGain = (acts: ActivityLike[], today: string) => recentFoot(acts, today).reduce((s, a) => s + (a.gainM ?? 0), 0) / 4;

// ---------- Ce que demande la course ----------
/**
 * Temps de course à partir de la VO2max : le km-effort (km + D+/100) couru comme une distance à plat
 * (modèle Daniels), puis trois corrections de terrain : sentier (8 %), raideur du parcours (jusqu’à 6 %)
 * et usure des longues durées (marche, ravitaillements, nuit : +4,5 % par heure au-delà de 4 h).
 */
export function trailTime(vdot: number, distanceKm: number, gainM: number) {
  const effortKm = distanceKm + gainM / 100;
  const base = raceTime(vdot, effortKm) * (1.08 + Math.min(0.06, gainM / Math.max(1, distanceKm) / 1000));
  return base * (1 + 0.045 * Math.max(0, base / 60 - 4));
}

export function raceDemands(goal: PlannerGoal, level: Level, ctl = 0, vdot: number | null = null) {
  const assumed = !goal.distanceKm;
  const distanceKm = goal.distanceKm ?? 25;
  const gainM = goal.gainM ?? Math.round(distanceKm * 35);
  const effortKm = distanceKm + gainM / 100;
  // Plus c’est long, plus l’allure moyenne baisse (marche, ravitaillements, fatigue, nuit).
  const fitness = clamp(1.12 - ctl / 400, 0.9, 1.12);
  const pace = PACE[level] * (1 + Math.max(0, effortKm - 30) / 400) * fitness;
  // Avec une VO2max connue (montre ou sorties), le temps vient de ta capacité réelle et non du niveau déclaré.
  const fromVo2 = vdot != null && vdot >= 28 && vdot <= 85;
  const mid = fromVo2 ? trailTime(vdot!, distanceKm, gainM) : effortKm * pace;
  const raceMin = Math.round(mid / 5) * 5;
  const longMin = raceMin <= 180 ? Math.max(60, raceMin * 0.8) : clamp(raceMin * 0.4, 150, 330);
  const weeklyMin = clamp((150 + effortKm * 5) * VOLUME_FACTOR[level], 180, 720);
  const weeklyGain = clamp(gainM * (effortKm > 100 ? 0.8 : 1.2), 300, 6000);
  return {
    distanceKm, gainM, effortKm: Math.round(effortKm), assumed, raceMin,
    estimate: { low: Math.round((mid * (fromVo2 ? 0.94 : 0.92)) / 5) * 5, high: Math.round((mid * (fromVo2 ? 1.1 : 1.15)) / 5) * 5 }, fromVo2,
    longMin: round5(longMin), weeklyMin: round5(weeklyMin), weeklyGain: round50(weeklyGain), backToBack: raceMin > 360,
  };
}

// ---------- Plan ----------
export function buildRacePlan(input: { today: string; profile: PlannerProfile; goal: PlannerGoal; activities: ActivityLike[]; load: LoadState; vdot?: number | null }): { items: PlanItem[]; plan: RacePlan } {
  const { today, profile, goal, activities, load } = input;
  const start = addDays(today, 1);
  const d = raceDemands(goal, profile.level, load.ctl, input.vdot ?? null);
  const hasHistory = recentFoot(activities, today).length >= 3;
  const base = baselineWeekly(activities, today, profile.level);
  const longest = recentLongest(activities, today) || base * 0.3;
  const baseGain = recentGain(activities, today);
  const cap = profile.maxWeeklyMinutes ?? Infinity;
  const peakWeekly = Math.min(d.weeklyMin, cap);
  const growth = GROWTH[profile.level];
  const daysTo = diffDays(today, goal.date);

  const raceMonday = mondayOf(goal.date);
  const firstMonday = mondayOf(start);
  const nWeeks = Math.max(1, diffDays(firstMonday, raceMonday) / 7 + 1);
  // Affûtage : 1 semaine sur les formats courts, 2 à partir de 80 km-effort, 3 pour les ultras (130 km-effort et plus).
  const taperWeeks = nWeeks <= 2 ? 0 : d.effortKm >= 130 && nWeeks >= 10 ? 3 : d.effortKm >= 80 ? 2 : 1;
  const buildWeeks = Math.max(0, nWeeks - 1 - taperWeeks);
  const specWeeks = buildWeeks <= 3 ? buildWeeks : Math.min(6, Math.ceil(buildWeeks * 0.35));
  const devWeeks = buildWeeks <= 3 ? 0 : Math.ceil(buildWeeks * 0.35);

  // Charge du moment : on stabilise si elle monte trop vite ou si la fatigue est marquée.
  const notes: string[] = [];
  let startFactor = 1;
  if (load.ratio != null && load.ratio > 1.3) { startFactor = 0.95; notes.push("Ta charge a monté vite ces 7 derniers jours : la première semaine est stabilisée avant de reprendre la progression."); }
  else if (load.ctl - load.atl < -15) { startFactor = 0.85; notes.push("Tu portes de la fatigue en ce moment : la première semaine est allégée."); }

  const weeks: PlanWeek[] = [];
  let level = base * startFactor, lng = longest;
  let peakReached = 0, longReached = 0;
  for (let w = 0; w < nWeeks; w++) {
    const monday = addDays(firstMonday, w * 7);
    const isRace = w === nWeeks - 1;
    const taperIdx = w - buildWeeks; // 0..taperWeeks-1 pendant l’affûtage
    let phase: string, minutes: number, longMin: number, light = false;
    if (isRace) {
      phase = "Semaine de course"; minutes = peakReached ? peakReached * 0.35 : level * 0.45; longMin = 0;
    } else if (w >= buildWeeks) {
      phase = "Affûtage";
      const f = (TAPER_VOLUME[taperWeeks] ?? [0.65])[taperIdx] ?? 0.6;
      minutes = (peakReached || level) * f; longMin = (longReached || lng) * ((TAPER_LONG[taperWeeks] ?? [0.55])[taperIdx] ?? 0.5);
    } else {
      const rem = buildWeeks - w;
      phase = rem <= specWeeks ? "Spécifique" : rem <= specWeeks + devWeeks ? "Développement" : "Fondation";
      // Semaine allégée toutes les 4 semaines, comptées à rebours depuis l’affûtage : 3 semaines de travail,
      // 1 d’assimilation, et les 3 dernières avant l’affûtage sont toujours pleines. Stable d’un recalcul à l’autre.
      light = buildWeeks >= 4 && rem % 4 === 0;
      if (!light && w > 0) { level = Math.min(peakWeekly, level * growth); lng = Math.min(d.longMin, lng * 1.1); }
      if (w === 0) lng = Math.min(d.longMin, lng * (startFactor < 1 ? 1 : 1.05));
      minutes = light ? level * 0.8 : level;
      longMin = Math.min(lng, minutes * 0.5);
      if (light) longMin *= 0.75;
      peakReached = Math.max(peakReached, minutes);
      longReached = Math.max(longReached, longMin);
    }
    const ratio = clamp(minutes / Math.max(1, peakWeekly), 0, 1);
    const phaseGain = phase === "Fondation" ? 0.55 : phase === "Développement" ? 0.85 : phase === "Spécifique" ? 1 : 0.5;
    const building = phase !== "Affûtage" && phase !== "Semaine de course";
    const gainM = round50(Math.max(building ? baseGain : 0, d.weeklyGain * ratio * phaseGain) * (light ? 0.8 : 1));
    weeks.push({ monday, phase, minutes: round5(minutes), longMin: longMin ? round5(longMin) : 0, gainM, light, focus: focusFor(phase, light, d.backToBack) });
  }

  // Sortie test : la plus grosse journée, 3 à 5 semaines avant la course, pour les formats de plus de 4 h.
  if (d.raceMin > 240 && buildWeeks >= 4) {
    const idx = Math.max(0, buildWeeks - (taperWeeks >= 2 ? 2 : 3));
    const wk = weeks[idx];
    if (wk && !wk.light) { wk.longMin = round5(Math.min(d.longMin, Math.max(wk.longMin, longReached) * 1.05)); wk.focus = "Sortie test : matériel, nutrition et allure de course"; longReached = Math.max(longReached, wk.longMin); }
  }

  // ---------- Verdict ----------
  const reachWeekly = round5(peakReached || base);
  const reachLong = round5(longReached || longest);
  const score = Math.min(reachWeekly / peakWeekly, reachLong / d.longMin);
  let verdict: Verdict, headline: string;
  if (daysTo < 21) {
    verdict = "court";
    headline = "La course est trop proche pour progresser : on entretient ta forme et tu arrives frais. Objectif : finir en gérant ton effort.";
  } else if (score >= 0.95) {
    verdict = "solide";
    headline = "Faisable : tu as le temps de construire le volume et la sortie longue qu’il faut pour finir.";
  } else if (score >= 0.75) {
    verdict = "ambitieux";
    headline = "Jouable pour finir : le plan te rapproche du volume idéal sans l’atteindre. Pars prudemment et marche les montées dès le début.";
  } else {
    verdict = "risque";
    headline = "Risqué : l’écart entre ta charge actuelle et ce que demande la course est grand. Envisage un format plus court ou une course plus tard dans la saison.";
  }
  if (!hasHistory) notes.unshift("Peu de séances sur les 4 dernières semaines : le plan part d’un volume type pour ton niveau. Connecte Strava ou ajoute tes sorties pour l’affiner.");
  if (cap < d.weeklyMin) notes.push(`Ton temps disponible (${fmtH(cap)} par semaine) est en dessous du volume conseillé pour cette course (${fmtH(d.weeklyMin)}).`);
  if (d.assumed) notes.push("Distance et dénivelé non renseignés : le plan suppose 25 km et 875 m D+. Complète-les pour un plan plus juste.");
  if (d.backToBack) notes.push("Format long : des enchaînements de sorties sur deux jours arrivent en phase spécifique, pour habituer les jambes à courir fatiguées.");

  const diagnosis = verdict === "ambitieux" || verdict === "risque"
    ? diagnose({ today, goal, profile, d, base: base * startFactor, longest, baseGain, reachWeekly, reachLong, peakGain: Math.max(...weeks.map((w) => w.gainM)), cap, growth, firstMonday, ctl: load.ctl, vdot: input.vdot ?? null })
    : undefined;

  const plan: RacePlan = {
    generatedOn: today,
    race: { name: goal.name, date: goal.date, distanceKm: d.distanceKm, gainM: d.gainM, effortKm: d.effortKm, daysTo, assumed: d.assumed },
    estimate: d.estimate, estimateFrom: d.fromVo2 ? "vo2" : "niveau",
    demands: { weeklyMin: d.weeklyMin, longMin: d.longMin, weeklyGain: d.weeklyGain, backToBack: d.backToBack },
    current: { weeklyMin: round5(base), longestMin: round5(longest), weeklyGain: round50(baseGain), hasHistory },
    reach: { weeklyMin: reachWeekly, longMin: reachLong },
    verdict, headline, notes, diagnosis, weeks,
  };
  return { items: sessionsFor(weeks, { start, goal, profile, raceMin: d.raceMin, dplusPerKm: d.gainM / d.distanceKm, backToBack: d.backToBack, hasRace: true }), plan };
}

function focusFor(phase: string, light: boolean, b2b: boolean) {
  if (light) return "Semaine plus légère : on assimile";
  switch (phase) {
    case "Fondation": return "Endurance et régularité, renforcement";
    case "Développement": return "Côtes et volume qui monte";
    case "Spécifique": return b2b ? "Montées longues et enchaînements" : "Montées longues, allure de course";
    case "Affûtage": return "Moins de volume, on garde du rythme";
    default: return "Fraîcheur et confiance";
  }
}
const fmtH = (m: number) => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")}`;
const frDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * Diagnostic d’un objectif ambitieux ou risqué : ce qui manque (volume, sortie longue, dénivelé,
 * temps disponible) et les leviers chiffrés pour le rendre atteignable.
 */
function diagnose(o: {
  today: string; goal: PlannerGoal; profile: PlannerProfile; d: ReturnType<typeof raceDemands>;
  base: number; longest: number; baseGain: number; reachWeekly: number; reachLong: number; peakGain: number;
  cap: number; growth: number; firstMonday: string; ctl: number; vdot: number | null;
}) {
  const { d, profile } = o;
  const causes: string[] = [], fixes: string[] = [];
  const pct = (a: number, b: number) => Math.round((a / Math.max(1, b)) * 100);
  const peakWeekly = Math.min(d.weeklyMin, o.cap);
  if (o.reachWeekly < d.weeklyMin * 0.95) causes.push(`Volume : le plan t’amène à ${fmtH(o.reachWeekly)} par semaine au plus haut, la course en demande environ ${fmtH(d.weeklyMin)} (${pct(o.reachWeekly, d.weeklyMin)} %). Tu pars de ${fmtH(o.base)} par semaine.`);
  if (o.reachLong < d.longMin * 0.95) causes.push(`Sortie longue : ${fmtH(o.reachLong)} au plus long d’ici la course, contre ${fmtH(d.longMin)} conseillées pour ce format (${pct(o.reachLong, d.longMin)} %). Ta plus longue sortie récente : ${fmtH(o.longest)}.`);
  if (o.peakGain < d.weeklyGain * 0.8) causes.push(`Dénivelé : environ ${o.peakGain} m de D+ par semaine au plus haut, contre ${d.weeklyGain} m conseillés. Les montées et surtout les descentes de la course risquent de te coûter cher.`);
  if (o.cap < d.weeklyMin) causes.push(`Temps disponible : tu as fixé ${fmtH(o.cap)} par semaine au maximum, en dessous des ${fmtH(d.weeklyMin)} conseillées.`);

  // 1. Plus de temps : combien de semaines faudrait-il pour atteindre volume et sortie longue ?
  const lightShare = 4 / 3; // une semaine allégée sur quatre
  const wVol = Math.log(Math.max(1, peakWeekly / Math.max(30, o.base))) / Math.log(o.growth);
  const wLong = Math.log(Math.max(1, d.longMin / Math.max(20, o.longest))) / Math.log(1.1);
  const needWeeks = Math.ceil(Math.max(wVol, wLong) * lightShare) + (d.effortKm >= 130 ? 3 : d.effortKm >= 80 ? 2 : 1) + 1;
  const okDate = addDays(o.firstMonday, needWeeks * 7 - 1);
  if (okDate > o.goal.date && diffDays(o.today, okDate) <= MAX_PLAN_DAYS) fixes.push(`Viser une course plus tard : à partir du ${frDate(okDate)} environ, la progression a le temps d’atteindre ce que demande ce format sans brûler les étapes.`);

  // 2. Un format plus court, à la même date : le plus long que le plan permet d’atteindre.
  const ratio = d.gainM / Math.max(1, d.distanceKm);
  let best: { km: number; gain: number } | null = null;
  for (let km = Math.floor(d.distanceKm) - 1; km >= 8; km--) {
    const t = raceDemands({ ...o.goal, distanceKm: km, gainM: Math.round(km * ratio) }, profile.level, o.ctl, o.vdot);
    if (o.reachWeekly >= Math.min(t.weeklyMin, o.cap) * 0.95 && o.reachLong >= t.longMin * 0.95) { best = { km, gain: Math.round((km * ratio) / 50) * 50 }; break; }
  }
  if (best) fixes.push(`Choisir un format plus court à cette date : jusqu’à environ ${best.km} km et ${best.gain} m D+, le plan te prépare correctement.`);

  // 3. Les leviers d’entraînement.
  if (o.cap < d.weeklyMin) fixes.push(`Libérer du temps : passer ton temps maximum de ${fmtH(o.cap)} à ${fmtH(d.weeklyMin)} par semaine (rubrique Compte).`);
  if (profile.daysPerWeek < 5 && o.reachWeekly < d.weeklyMin * 0.95) fixes.push(`Ajouter une séance par semaine (${profile.daysPerWeek} → ${profile.daysPerWeek + 1}) : plus de volume sans allonger chaque sortie, donc moins de risque de blessure.`);
  if (o.peakGain < d.weeklyGain * 0.8) fixes.push("Chercher du dénivelé : fais tes sorties longues sur des parcours vallonnés et garde une séance de côtes par semaine ; en ville, l’escalier ou le tapis incliné dépannent.");
  fixes.push("Si tu gardes cette course : pars nettement plus lentement que tes sensations, marche toutes les montées dès le départ, mange et bois dès la première heure, et repère les barrières horaires pour savoir où tu peux t’arrêter.");
  return { causes, fixes };
}

// ---------- Répartition des séances dans la semaine ----------
function sessionsFor(weeks: PlanWeek[], o: { start: string; goal: PlannerGoal; profile: PlannerProfile; raceMin: number; dplusPerKm: number; backToBack: boolean; hasRace: boolean }): PlanItem[] {
  const { start, goal, profile } = o;
  const days = Math.max(2, Math.min(7, profile.daysPerWeek));
  const shift = (profile.longDay - 6 + 7) % 7;
  const baseSlots = SLOTS[days].map((s) => (s + shift) % 7);
  const longSlot = (6 + shift) % 7;
  const items: PlanItem[] = [];

  weeks.forEach((wk, wi) => {
    const { phase } = wk;
    let slots = [...baseSlots];
    const b2b = o.backToBack && phase === "Spécifique" && !wk.light && days >= 3;
    const dayBefore = (longSlot + 6) % 7;
    if (b2b && !slots.includes(dayBefore)) {
      const drop = slots.filter((s) => s !== longSlot).sort((a, b) => dist(a, dayBefore) - dist(b, dayBefore))[0];
      slots = slots.map((s) => (s === drop ? dayBefore : s));
    }
    const qualitySlot = pickQualitySlot(slots.filter((s) => !(b2b && s === dayBefore)), longSlot);
    // Alternance comptée à rebours depuis la course : elle ne change pas quand le plan est recalculé chaque lundi.
    const toGo = weeks.length - 1 - wi;
    const quality = qualityFor(phase, wk.light, profile.level, toGo, o.dplusPerKm);
    // Seconde séance de qualité (allure soutenue) pour qui s’entraîne beaucoup : confirmé dès 5 sorties, régulier dès 6.
    const wantsTwo = !wk.light && (phase === "Développement" || phase === "Spécifique") && ((profile.level === "confirme" && days >= 5) || (profile.level === "regulier" && days >= 6));
    const quality2Slot = wantsTwo && quality
      ? slots.filter((s) => s !== longSlot && s !== qualitySlot && s !== dayBefore && dist(s, qualitySlot) >= 2 && dist(s, longSlot) >= 2).sort((a, b) => dist(b, qualitySlot) - dist(a, qualitySlot))[0] ?? -1
      : -1;
    const q2Min = quality2Slot >= 0 ? clamp(wk.minutes * 0.13, 45, 70) : 0;
    const firstEasy = slots.find((s) => s !== longSlot && s !== qualitySlot && s !== quality2Slot && !(b2b && s === dayBefore));
    const strength = (days >= 5 && profile.level !== "debutant") || (phase === "Fondation" && days >= 4);

    const qMin = quality ? (quality === "sharpen" ? 40 : clamp(wk.minutes * 0.18, 50, 85)) : 0;
    const b2bMin = b2b ? wk.longMin * 0.55 : 0;
    const strengthMin = strength && firstEasy != null ? 40 : 0;
    const easySlots = slots.filter((s) => s !== longSlot && s !== qualitySlot && s !== quality2Slot && !(b2b && s === dayBefore) && !(strengthMin && s === firstEasy));
    const easyMin = clamp((wk.minutes - wk.longMin - qMin - q2Min - b2bMin - strengthMin * 0.5) / Math.max(1, easySlots.length), 30, 80);
    const longGain = round50(wk.gainM * (b2b ? 0.45 : 0.55));
    const qGain = round50(wk.gainM * 0.3);

    for (const slot of [...slots].sort((a, b) => a - b)) {
      const date = addDays(wk.monday, slot);
      if (date < start || date > goal.date) continue;
      if (o.hasRace && date === goal.date) continue; // la course est ajoutée à part
      const toRace = diffDays(date, goal.date);
      if (o.hasRace && toRace === 1) { items.push(make("sharpen", date, 20, phase, 0)); continue; }
      if (o.hasRace && phase === "Semaine de course") {
        items.push(toRace <= 3 ? make("easy", date, 25, phase, 0) : make("sharpen", date, 35, phase, 0));
        continue;
      }
      const isTest = wk.focus.startsWith("Sortie test");
      if (slot === longSlot && wk.longMin) items.push(make(isTest ? "test" : b2b ? "b2b" : "long", date, b2b ? b2bMin : wk.longMin, phase, isTest ? round50(wk.gainM * 0.6) : b2b ? round50(wk.gainM * 0.3) : longGain, b2b ? "J2" : undefined));
      else if (b2b && slot === dayBefore) items.push(make("b2b", date, wk.longMin, phase, longGain, "J1"));
      else if (slot === qualitySlot && quality) items.push(make(quality, date, qMin, phase, qGain));
      else if (slot === quality2Slot) items.push(make("tempo", date, q2Min, phase, 0));
      else if (strengthMin && slot === firstEasy) items.push(make("strength", date, 40, phase, 0));
      else items.push(make("easy", date, easyMin, phase, 0));
    }
  });

  if (o.hasRace && goal.date >= start) {
    items.push({ date: goal.date, template: "race", title: goal.name, sport: "trail", durationMin: o.raceMin, gainM: goal.gainM, rpeTarget: 7, phase: "Semaine de course",
      description: "Jour J. Pars nettement en dedans sur la première heure, marche les montées raides, mange et bois dès le départ (un apport toutes les 30 à 40 min). L’objectif est de finir." });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

const dist = (a: number, b: number) => Math.min((a - b + 7) % 7, (b - a + 7) % 7);
function pickQualitySlot(slots: number[], longSlot: number) {
  return slots.filter((s) => s !== longSlot).sort((a, b) => dist(b, longSlot) - dist(a, longSlot))[0] ?? -1;
}

function qualityFor(phase: string, light: boolean, level: Level, wi: number, dplusPerKm: number): Template | null {
  if (light || phase === "Semaine de course") return null;
  if (level === "debutant" && phase === "Fondation" && wi % 2 === 1) return null;
  if (phase === "Affûtage") return "sharpen";
  if (phase === "Spécifique") return dplusPerKm >= 40 && wi % 2 === 1 ? "downhill" : "climb";
  if (phase === "Développement") return "hills";
  return wi % 2 === 0 ? "tempo" : "hills";
}

function make(t: Template, date: string, minutes: number, phase: string, gain: number, part?: "J1" | "J2"): PlanItem {
  const d = round5(minutes);
  const g = gain > 0 ? gain : null;
  switch (t) {
    case "long":
      return { date, template: t, phase, sport: "trail", title: "Sortie longue", durationMin: d, rpeTarget: 4, gainM: g,
        description: "Allure facile et régulière, tu dois pouvoir parler. Marche franchement dans les montées raides. Teste ce que tu mangeras en course : un apport toutes les 40 minutes." };
    case "test":
      return { date, template: t, phase, sport: "trail", title: "Sortie test", durationMin: d, rpeTarget: 5, gainM: g,
        description: "La plus grosse journée du plan, comme une répétition de course : même sac, mêmes chaussures, même nutrition. Allure de course, pas plus vite. Note ce qui coince." };
    case "b2b":
      return { date, template: t, phase, sport: "trail", title: part === "J1" ? "Enchaînement · jour 1" : "Enchaînement · jour 2", durationMin: d, rpeTarget: 4, gainM: g,
        description: part === "J1"
          ? "Première sortie du week-end : longue et facile, avec du dénivelé. Mange comme en course."
          : "Le lendemain, sur des jambes déjà fatiguées : allure très facile, beaucoup de marche active. C’est ce qui prépare la deuxième moitié de course." };
    case "hills":
      return { date, template: t, phase, sport: "trail", title: "Répétitions en côte", durationMin: d, rpeTarget: 7, gainM: g ?? 300,
        description: "20 min d’échauffement facile, puis 8 à 10 × 1 min 30 en côte à effort soutenu (7/10), retour en descente trottinée. 10 min de retour au calme." };
    case "climb":
      return { date, template: t, phase, sport: "trail", title: "Montées longues", durationMin: d, rpeTarget: 6, gainM: g ?? 500,
        description: "Échauffement 15 min, puis 3 × 10 à 15 min de montée continue à l’effort de course (6/10), bâtons si tu cours avec. Descentes souples et relâchées entre les blocs." };
    case "tempo": {
      const { n, block } = tempoBlocks(d);
      return { date, template: t, phase, sport: "course", title: "Tempo contrôlé", durationMin: d, rpeTarget: 6, gainM: null,
        description: `15 min facile, puis ${n} × ${block} min à allure soutenue mais maîtrisée (6/10), 3 min de trot entre. 10 min de retour au calme.` };
    }
    case "downhill":
      return { date, template: t, phase, sport: "trail", title: "Montée + descente technique", durationMin: d, rpeTarget: 5, gainM: g ?? 400,
        description: "Monte à effort contrôlé, puis travaille la descente : haut du corps relâché, regard loin, appuis courts et rapides. C’est la descente qui casse les cuisses en course." };
    case "sharpen":
      return { date, template: t, phase, sport: "course", title: "Rappel d’allure", durationMin: Math.min(d, 40), rpeTarget: 5, gainM: null,
        description: "20 min faciles, puis 4 × 1 min un peu plus vite, 1 min de trot entre. Tu dois finir frais." };
    case "strength":
      return { date, template: t, phase, sport: "renfo", title: "Renforcement", durationMin: 40, rpeTarget: 5, gainM: null,
        description: "Gainage, fentes, squats sur une jambe, montées de mollets, chaise. 3 tours de 40 s par exercice. Priorité à la qualité du geste." };
    default:
      return { date, template: "easy", phase, sport: "course", title: "Endurance facile", durationMin: d, rpeTarget: 3, gainM: null,
        description: "Allure conversation sur terrain souple si possible. L’essentiel est d’être régulier, pas rapide." };
  }
}

// ---------- Sans course : entretien sur 3 semaines ----------
export function maintenancePlan(input: { today: string; profile: PlannerProfile; activities: ActivityLike[] }): PlanItem[] {
  const { today, profile, activities } = input;
  const start = addDays(today, 1);
  const base = baselineWeekly(activities, today, profile.level);
  const longest = recentLongest(activities, today) || base * 0.3;
  const weeks: PlanWeek[] = [0, 1, 2, 3].map((w) => {
    const minutes = Math.min(base * (w === 3 ? 0.85 : 1.03 ** (w + 1)), profile.maxWeeklyMinutes ?? Infinity);
    return { monday: addDays(mondayOf(start), w * 7), phase: "Entretien", minutes: round5(minutes), longMin: round5(Math.min(longest * 1.03, minutes * 0.4)), gainM: 0, light: w === 3, focus: "Entretien" };
  });
  const horizon = addDays(start, 20);
  const fake: PlannerGoal = { name: "", date: horizon, distanceKm: null, gainM: null };
  return sessionsFor(weeks, { start, goal: fake, profile, raceMin: 0, dplusPerKm: 30, backToBack: false, hasRace: false })
    .filter((i) => i.date <= horizon)
    .map((i) => ({ ...i, phase: "Entretien" }));
}

export function phaseFor(daysToGoal: number | null): string {
  if (daysToGoal == null) return "Entretien";
  if (daysToGoal < 0) return "Récupération";
  if (daysToGoal <= 6) return "Semaine de course";
  if (daysToGoal <= 14) return "Affûtage";
  if (daysToGoal <= 42) return "Spécifique";
  if (daysToGoal <= 84) return "Développement";
  return "Fondation";
}

/** Découpage d’un tempo : blocs de 6 à 12 min au seuil, 3 min de trot entre, 25 min d’échauffement et retour au calme. */
export function tempoBlocks(durationMin: number): { n: number; block: number } {
  const main = Math.max(10, durationMin - 25);
  const n = Math.max(2, Math.min(5, Math.round((main + 3) / 11)));
  return { n, block: Math.max(5, Math.round((main - 3 * (n - 1)) / n)) };
}
