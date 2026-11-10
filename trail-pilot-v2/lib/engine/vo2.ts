import { diffDays } from "./dates";
import type { Sport } from "./load";
import { windowsVo2 } from "./streams";

/**
 * VO2max estimée (ml/kg/min), sans test d’effort, à partir de tout l’historique de course.
 *
 * 1. À partir de tes sorties (méthode principale).
 *    a. Sortie analysée seconde par seconde (flux Strava ou fichier de montre) : on isole les passages
 *       d’effort stable, on ajuste l’allure à la pente de chacun et on rapporte son coût en oxygène à la
 *       réserve cardiaque utilisée ; la séance vaut le quartile supérieur de ces passages (engine/streams).
 *    b. Sinon, à partir des moyennes de la sortie : allure équivalente sur le plat (Minetti 2002 sur route,
 *       km-effort + 5 % sur sentier), on en tire le coût en oxygène (Daniels-Gilbert),
 *    puis la part de ta capacité utilisée, donnée par ta réserve cardiaque (Swain : %VO2 de réserve
 *    ≈ %FC de réserve), corrigée de la dérive cardiaque des sorties longues. Sur les efforts durs
 *    (FC moyenne ≥ 88 % de la FC max), on y ajoute la VDOT de Daniels tirée du couple temps/distance.
 *    Chaque mois de l’historique donne une valeur (moyenne de ses 2 meilleures séances : les
 *    sorties faciles sous-estiment la capacité). La VO2max actuelle est la moyenne de tous les
 *    mois, pondérée par l’ancienneté : le poids d’un mois est divisé par deux tous les 3 mois.
 * 2. À partir des seules fréquences cardiaques (repère) : 15,3 × FC max / FC repos (Uth et al.).
 *
 * Ce sont des estimations de terrain, à ±5 à 10 %, pas une mesure de laboratoire.
 */
export interface Vo2Run {
  date: string; sport: Sport; durationMin: number; distanceKm: number | null; gainM: number | null; lossM?: number | null; avgHr: number | null; maxHr?: number | null; name?: string | null;
  /** Fenêtres d’effort stable de l’analyse seconde par seconde : [allure ajustée m/min, FC, minute]. */
  win?: [number, number, number][] | null;
}
export interface Vo2Session { date: string; name: string | null; vo2max: number; speedKmh: number; hrPct: number; precise?: boolean }
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
  /** VO2max indiquée par ta montre (profil), et valeur retenue pour calculer tes allures. */
  watch: number | null; paceVdot: number | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (n: number) => Math.round(n * 10) / 10;
const HALF_LIFE_DAYS = 90;

/** Coût énergétique de la course selon la pente (J/kg/m, Minetti et al. 2002). */
const minetti = (i: number) => 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6;
const daniels = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v; // ml/kg/min, v en m/min
const fracOf = (t: number) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);

/** Vitesse équivalente sur le plat : même dépense que la sortie, montées et descentes comprises. */
export function flatEquivalent(distanceKm: number, gainM: number | null, lossM: number | null, durationMin: number) {
  const d = distanceKm * 1000, up = Math.max(0, gainM ?? 0), down = Math.max(0, lossM ?? up);
  const v = d / durationMin;
  if (up + down < 1) return { v, factor: 1, grade: 0 };
  const g = Math.min(0.25, (up + down) / d), su = up / (up + down);
  const factor = (su * minetti(g) + (1 - su) * minetti(-g)) / minetti(0);
  return { v: v * factor, factor, grade: g };
}

function sessionVo2(a: Vo2Run, hrMax: number, hrRest: number | null): number | null {
  if (a.sport !== "course" && a.sport !== "trail") return null;
  if (!a.avgHr || !a.distanceKm || a.durationMin < 20 || a.distanceKm < 3) return null;
  // Sortie analysée seconde par seconde : on part des passages d’effort stable, pente par pente.
  // C’est la méthode des montres ; elle ne souffre ni des pauses, ni des murs raides, ni des passages techniques.
  const precise = windowsVo2(a.win, { hrMax, hrRest });
  if (precise != null) {
    const hardP = a.avgHr / hrMax >= 0.88 && a.durationMin <= 240 && (a.gainM ?? 0) / (a.distanceKm * 1000) < 0.03;
    return hardP ? (precise + daniels((a.distanceKm * 1000) / a.durationMin) / fracOf(a.durationMin)) / 2 : precise;
  }
  const eq0 = flatEquivalent(a.distanceKm, a.gainM, a.lossM ?? null, a.durationMin);
  let eq: { v: number; grade: number };
  if (a.sport === "trail") {
    // Sur sentier, le modèle de tapis roulant (Minetti) « rend » en descente une énergie qu’on ne récupère pas :
    // on freine, on marche, le terrain est technique. On utilise donc la règle des traileurs, le km-effort
    // (100 m de D+ = 1 km de plat), plus 5 % pour le terrain. C’est la même règle que pour estimer le temps de course.
    if (eq0.grade > 0.22) return null; // au-delà, on est en alpinisme plus qu’en course
    eq = { v: ((a.distanceKm + Math.max(0, a.gainM ?? 0) / 100) * 1000 * 1.05) / a.durationMin, grade: eq0.grade };
  } else {
    // Sur route, les descentes se courent : coût énergétique selon la pente, avec une petite marge pour la pente irrégulière.
    if (eq0.grade > 0.12) return null;
    eq = { v: eq0.v * (1 + 0.2 * eq0.grade), grade: eq0.grade };
  }
  const v = eq.v; // m/min équivalents plat
  if (v < 110 || v > 420) return null;
  const vo2 = daniels(v);
  // Dérive cardiaque : sur les sorties longues, la FC monte à allure égale.
  const drift = a.durationMin > 60 ? Math.min(0.05, ((a.durationMin - 60) / 30) * 0.015) : 0;
  let hrBased: number | null = null;
  if (hrRest && hrRest < a.avgHr) {
    const hrr = (a.avgHr - hrRest) / (hrMax - hrRest) - drift;
    if (hrr >= 0.5 && hrr <= 0.97) hrBased = 3.5 + (vo2 - 3.5) / hrr;
  } else {
    const pctMax = a.avgHr / hrMax - drift * 0.8;
    if (pctMax >= 0.68 && pctMax <= 0.98) hrBased = vo2 / ((pctMax * 100 - 37) / 64); // Swain : %FCmax = 0,64 × %VO2max + 37
  }
  // Effort dur (allure de course) : VDOT de Daniels, indépendante de la FC.
  const hard = a.avgHr / hrMax >= 0.88 && a.durationMin <= 240;
  const vdot = hard ? vo2 / fracOf(a.durationMin) : null;
  if (hrBased != null && vdot != null) return (hrBased + vdot) / 2;
  return hrBased ?? vdot;
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
    out.push({ date: a.date, name: a.name ?? null, vo2max: r1(v), speedKmh: r1((a.distanceKm! / a.durationMin) * 60), hrPct: Math.round((a.avgHr! / hrMax) * 100), age, precise: !!(a.win && a.win.length >= 4) || undefined });
  }
  return out.sort((x, y) => x.age - y.age);
}

/** Une valeur par mois : moyenne des 2 meilleures séances du mois. */
function byMonth(list: Dated[]) {
  const m = new Map<string, { vs: number[]; age: number }>();
  // Dans un mois où des sorties ont été analysées seconde par seconde, elles seules comptent : elles sont plus fiables.
  const fine = new Set(list.filter((s) => s.precise).map((s) => s.date.slice(0, 7)));
  for (const s of list) {
    const k = s.date.slice(0, 7);
    if (fine.has(k) && !s.precise) continue;
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
  // Deux séances au moins, sauf si l’une a été analysée seconde par seconde : elle suffit à donner une première valeur.
  if (list.length < 2 && !list.some((s) => s.precise)) return null;
  let sw = 0, sv = 0;
  for (const m of byMonth(list)) {
    // Un mois avec une seule séance compte un peu moins qu’un mois bien renseigné.
    const w = Math.pow(0.5, (m.age - offset) / HALF_LIFE_DAYS) * Math.min(1, 0.5 + m.sessions * 0.25);
    sw += w; sv += w * m.value;
  }
  return sw > 0 ? sv / sw : null;
}

const racesFor = (v: number) => [
  { label: "5 km", km: 5 }, { label: "10 km", km: 10 }, { label: "Semi-marathon", km: 21.0975 }, { label: "Marathon", km: 42.195 },
].map((r) => ({ ...r, minutes: raceTime(v, r.km) }));

/** Temps de course équivalent sur route plate pour une VO2max donnée (modèle Daniels-Gilbert). */
export function raceTime(vdot: number, km: number) {
  let lo = 5, hi = 6000;
  for (let i = 0; i < 60; i++) {
    const t = (lo + hi) / 2;
    if (daniels((km * 1000) / t) / fracOf(t) > vdot) lo = t; else hi = t;
  }
  return Math.round((lo + hi) / 2);
}

export function estimateVo2(runs: Vo2Run[], today: string, profile: { hrMax: number | null; hrRest: number | null; watch?: number | null }): Vo2Estimate {
  const notes: string[] = [];
  const observed = runs.reduce((m, a) => Math.max(m, a.maxHr ?? 0), 0);
  const hrMax = profile.hrMax ?? (observed >= 150 ? observed : null);
  const hrMaxSource = profile.hrMax ? "profil" : hrMax ? "observée" : null;
  const hrRest = profile.hrRest;
  const uth = hrMax && hrRest ? r1(clamp(15.3 * (hrMax / hrRest), 25, 90)) : null;

  const watch = profile.watch ?? null;
  const empty: Vo2Estimate = { value: null, low: null, high: null, method: null, sessions: [], used: 0, months: [], since: null, uth, previous: null, hrMax, hrMaxSource, hrRest, races: watch ? racesFor(watch) : [], notes, watch, paceVdot: watch };
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
  if (method === "frequence") notes.push("Estimation par les seules fréquences cardiaques (FC max / FC repos) : un repère, qui sous-estime souvent les coureurs entraînés. Importe des sorties avec cardio pour un calcul plus juste.");
  if (watch) notes.push(`Ta montre indique ${String(watch).replace(".", ",")} : c’est cette valeur qui sert à calculer tes allures. L’estimation Trail Pilot (${String(value).replace(".", ",")}) reste affichée pour comparaison ; un écart de quelques points entre deux méthodes est normal.`);
  const paceVdot = watch ?? (method === "seances" ? value : null);
  const races = racesFor(watch ?? value!);
  // Les séances affichées : les meilleures des 3 derniers mois, sinon les plus récentes.
  const recent = all.filter((s) => s.age < 90);
  const shown = (recent.length ? [...recent].sort((a, b) => b.vo2max - a.vo2max) : all).slice(0, 3).map(({ age: _age, ...s }) => s);
  return {
    value, low, high, method, sessions: shown, used: all.length,
    months: byMonth(all).map(({ month, value: v, sessions }) => ({ month, value: r1(v), sessions })),
    since: all.length ? all[all.length - 1].date : null,
    uth, previous, hrMax, hrMaxSource, hrRest, races, notes, watch, paceVdot,
  };
}
