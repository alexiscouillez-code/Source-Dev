import { diffDays } from "./dates";
import type { Sport } from "./load";

/**
 * VO2max estimée (ml/kg/min), sans test d’effort, à partir de tout l’historique de course.
 *
 * 1. À partir de tes sorties (méthode principale) : pour chaque course ou trail roulant avec
 *    fréquence cardiaque, on calcule le coût en oxygène de l’allure (modèle de Daniels-Gilbert,
 *    plus le coût de la pente de l’ACSM : 0,9·v·pente), puis la part de ta capacité utilisée,
 *    donnée par ta réserve cardiaque (Swain : %VO2 de réserve ≈ %FC de réserve). On en déduit
 *    la VO2max de chaque séance.
 *    Chaque mois de l’historique donne une valeur (moyenne de ses 2 meilleures séances : les
 *    sorties faciles sous-estiment la capacité). La VO2max actuelle est la moyenne de tous les
 *    mois, pondérée par l’ancienneté : le poids d’un mois est divisé par deux tous les 3 mois.
 * 2. À partir des seules fréquences cardiaques (repère) : 15,3 × FC max / FC repos (Uth et al.).
 *
 * Ce sont des estimations de terrain, à ±5 à 10 %, pas une mesure de laboratoire.
 */
export interface Vo2Run { date: string; sport: Sport; durationMin: number; distanceKm: number | null; gainM: number | null; avgHr: number | null; maxHr?: number | null; name?: string | null }
export interface Vo2Session { date: string; name: string | null; vo2max: number; speedKmh: number; hrPct: number }
export interface Vo2Month { month: string; value: number; sessions: number }
export interface Vo2Estimate {
  value: number | null; low: number | null; high: number | null;
  method: "seances" | "frequence" | null;
  sessions: Vo2Session[]; used: number;
  months: Vo2Month[]; since: string | null; // historique mois par mois, première séance prise en compte
  uth: number | null;
  previous: number | null; // même calcul tel qu’il était il y a 2 mois
  hrMax: number | null; hrMaxSource: "profil" | "observée" | null; hrRest: number | null;
  races: { label: string; km: number; minutes: number }[];
  notes: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (n: number) => Math.round(n * 10) / 10;
const HALF_LIFE_DAYS = 90;

function sessionVo2(a: Vo2Run, hrMax: number, hrRest: number | null): number | null {
  if (a.sport !== "course" && a.sport !== "trail") return null;
  if (!a.avgHr || !a.distanceKm || a.durationMin < 20 || a.distanceKm < 3) return null;
  const v = (a.distanceKm * 1000) / a.durationMin; // m/min
  if (v < 110 || v > 420) return null;
  const grade = (a.gainM ?? 0) / (a.distanceKm * 1000);
  if (grade > 0.045) return null; // trop pentu : la mécanique de la marche fausse le calcul
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v + 0.9 * v * grade;
  if (hrRest && hrRest < a.avgHr) {
    const hrr = (a.avgHr - hrRest) / (hrMax - hrRest);
    if (hrr < 0.55 || hrr > 0.97) return null;
    return 3.5 + (vo2 - 3.5) / hrr;
  }
  const pctMax = a.avgHr / hrMax;
  if (pctMax < 0.7 || pctMax > 0.98) return null;
  const pctVo2 = (pctMax * 100 - 37) / 64; // Swain : %FCmax = 0,64 × %VO2max + 37
  return vo2 / pctVo2;
}

type Dated = Vo2Session & { age: number };

/** Toutes les séances exploitables de l’historique, de la plus récente à la plus ancienne. */
function sessionsOf(runs: Vo2Run[], today: string, hrMax: number, hrRest: number | null): Dated[] {
  const out: Dated[] = [];
  for (const a of runs) {
    const age = diffDays(a.date, today);
    if (age < 0) continue;
    const v = sessionVo2(a, hrMax, hrRest);
    if (v == null || v < 25 || v > 88) continue;
    out.push({ date: a.date, name: a.name ?? null, vo2max: r1(v), speedKmh: r1((a.distanceKm! / a.durationMin) * 60), hrPct: Math.round((a.avgHr! / hrMax) * 100), age });
  }
  return out.sort((x, y) => x.age - y.age);
}

/** Une valeur par mois : moyenne des 2 meilleures séances du mois. */
function byMonth(list: Dated[]) {
  const m = new Map<string, { vs: number[]; age: number }>();
  for (const s of list) {
    const k = s.date.slice(0, 7);
    const e = m.get(k) ?? { vs: [], age: s.age };
    e.vs.push(s.vo2max); e.age = Math.min(e.age, s.age); m.set(k, e);
  }
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([month, { vs, age }]) => {
    const top = [...vs].sort((a, b) => b - a).slice(0, 2);
    return { month, value: top.reduce((x, y) => x + y, 0) / top.length, sessions: vs.length, age };
  });
}

/** Estimation telle qu’elle était `offset` jours avant aujourd’hui, sur tout l’historique antérieur. */
function estimateAt(all: Dated[], offset: number) {
  const list = all.filter((s) => s.age >= offset);
  if (list.length < 2) return null;
  let sw = 0, sv = 0;
  for (const m of byMonth(list)) {
    // Un mois avec une seule séance compte un peu moins qu’un mois bien renseigné.
    const w = Math.pow(0.5, (m.age - offset) / HALF_LIFE_DAYS) * Math.min(1, 0.5 + m.sessions * 0.25);
    sw += w; sv += w * m.value;
  }
  return sw > 0 ? sv / sw : null;
}

/** Temps de course équivalent sur route plate pour une VO2max donnée (modèle Daniels-Gilbert). */
export function raceTime(vdot: number, km: number) {
  const vo2 = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v; // v en m/min
  const frac = (t: number) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  let lo = 5, hi = 600;
  for (let i = 0; i < 60; i++) {
    const t = (lo + hi) / 2;
    if (vo2((km * 1000) / t) / frac(t) > vdot) lo = t; else hi = t;
  }
  return Math.round((lo + hi) / 2);
}

export function estimateVo2(runs: Vo2Run[], today: string, profile: { hrMax: number | null; hrRest: number | null }): Vo2Estimate {
  const notes: string[] = [];
  const observed = runs.reduce((m, a) => Math.max(m, a.maxHr ?? 0), 0);
  const hrMax = profile.hrMax ?? (observed >= 150 ? observed : null);
  const hrMaxSource = profile.hrMax ? "profil" : hrMax ? "observée" : null;
  const hrRest = profile.hrRest;
  const uth = hrMax && hrRest ? r1(clamp(15.3 * (hrMax / hrRest), 25, 90)) : null;

  const empty: Vo2Estimate = { value: null, low: null, high: null, method: null, sessions: [], used: 0, months: [], since: null, uth, previous: null, hrMax, hrMaxSource, hrRest, races: [], notes };
  if (!hrMax) {
    notes.push("Renseigne ta FC max dans ton profil (ou importe des sorties Strava avec cardio) pour estimer ta VO2max.");
    if (uth == null) return empty;
  }
  let value: number | null = null, method: Vo2Estimate["method"] = null, low = null, high = null, previous: number | null = null;
  const all = hrMax ? sessionsOf(runs, today, hrMax, hrRest) : [];
  const cur = estimateAt(all, 0);
  if (cur != null) {
    value = r1(cur); method = "seances";
    // Fourchette plus large quand les données sont rares ou anciennes.
    const recent = all.filter((s) => s.age < 90).length;
    const spread = (hrRest ? 0.06 : 0.09) + (recent < 3 ? 0.02 : 0);
    low = r1(value * (1 - spread)); high = r1(value * (1 + spread));
    const prev = estimateAt(all, 60);
    previous = prev != null ? r1(prev) : null;
  }
  if (value == null && uth != null) { value = uth; method = "frequence"; low = r1(uth * 0.9); high = r1(uth * 1.1); }
  if (value == null) {
    notes.push("Pas encore assez de sorties exploitables : il faut au moins deux courses de 20 min ou plus, sur terrain roulant, avec la fréquence cardiaque.");
    return empty;
  }
  if (method === "seances" && all.length && all[0].age > 90) notes.push(`Ta dernière sortie exploitable date de plus de 3 mois : l’estimation repose sur des données anciennes.`);
  if (hrMaxSource === "observée") notes.push(`FC max prise sur ta plus haute valeur enregistrée (${hrMax} bpm). Si tu connais ta vraie FC max, renseigne-la : l’estimation sera plus juste.`);
  if (!hrRest) notes.push("Ajoute ta FC de repos dans ton profil : le calcul passe alors par ta réserve cardiaque, plus précise.");
  if (method === "frequence") notes.push("Estimation par les seules fréquences cardiaques : un repère, moins précis que le calcul sur tes sorties.");
  const races = [
    { label: "5 km", km: 5 }, { label: "10 km", km: 10 }, { label: "Semi-marathon", km: 21.0975 }, { label: "Marathon", km: 42.195 },
  ].map((r) => ({ ...r, minutes: raceTime(value!, r.km) }));
  // Les séances affichées : les meilleures des 3 derniers mois, sinon les plus récentes.
  const recent = all.filter((s) => s.age < 90);
  const shown = (recent.length ? [...recent].sort((a, b) => b.vo2max - a.vo2max) : all).slice(0, 3).map(({ age: _age, ...s }) => s);
  return {
    value, low, high, method, sessions: shown, used: all.length,
    months: byMonth(all).map(({ month, value: v, sessions }) => ({ month, value: r1(v), sessions })),
    since: all.length ? all[all.length - 1].date : null,
    uth, previous, hrMax, hrMaxSource, hrRest, races, notes,
  };
}
