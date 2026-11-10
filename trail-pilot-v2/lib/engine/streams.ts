/**
 * Analyse seconde par seconde d’une sortie (flux Strava ou fichier de montre).
 *
 * On ne garde pas les flux bruts : on en tire un résumé compact, indépendant de la FC max du profil
 * (elle peut être corrigée plus tard sans tout réimporter) :
 *  - `hist`  : temps passé par tranche de 5 battements (de 60 à 220 bpm) → zones cardiaques, charge ;
 *  - `win`   : fenêtres d’effort stable [allure ajustée à la pente (m/min), FC, minute] → VO2max ;
 *  - `gap`   : allure moyenne ajustée à la pente, en mouvement (m/min) ;
 *  - `dec`   : découplage cardiaque (%) : perte d’efficacité entre la première et la seconde moitié ;
 *  - `loss`  : dénivelé négatif réel ; `moving` : secondes en mouvement ;
 *  - `best`  : meilleurs efforts de la sortie (1, 5 et 10 km en secondes, meilleure montée sur 10 min en m/h).
 *
 * Ce sont des indicateurs d’entraînement, pas des mesures de laboratoire.
 */
export interface Streams {
  time: number[];            // secondes depuis le départ
  hr?: (number | null)[];    // bpm
  speed?: (number | null)[]; // m/s
  grade?: (number | null)[]; // pente en %
  altitude?: (number | null)[];
  distance?: (number | null)[]; // m
}
export interface Best { k1: number | null; k5: number | null; k10: number | null; vam: number | null }
export interface Analysis { v: 1; hist: number[]; win: [number, number, number][]; gap: number | null; dec: number | null; loss: number | null; moving: number; best?: Best }

export const HIST_MIN = 60, HIST_STEP = 5, HIST_BINS = 32;
const WIN = 120, STEP = 30, WARMUP = 480, MAX_WIN = 48;

/** Coût énergétique de la course selon la pente (J/kg/m, Minetti et al. 2002). */
export const minetti = (i: number) => 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6;
/**
 * Facteur d’allure ajustée : en montée, le coût de Minetti ; en descente, on plafonne le gain
 * (sur sentier on freine : la descente ne « rend » jamais autant que le modèle sur tapis).
 */
export const gapFactor = (gradePct: number) => {
  const g = Math.max(-0.3, Math.min(0.3, gradePct / 100));
  return Math.max(0.82, minetti(g) / 3.6);
};

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Pente (%) recalculée depuis l’altitude et la distance, lissée sur ±15 points. */
export function gradeFrom(altitude: (number | null)[], distance: (number | null)[]) {
  const n = altitude.length, out: (number | null)[] = new Array(n).fill(null), K = 15;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - K), b = Math.min(n - 1, i + K);
    const dz = (num(altitude[b]) ?? NaN) - (num(altitude[a]) ?? NaN), dx = (num(distance[b]) ?? NaN) - (num(distance[a]) ?? NaN);
    if (Number.isFinite(dz) && Number.isFinite(dx) && dx > 8) out[i] = Math.max(-45, Math.min(45, (dz / dx) * 100));
  }
  return out;
}

/** D− lissé : on ne compte une descente qu’au-delà de 3 m, pour ignorer le bruit du capteur. */
function lossOf(alt: (number | null)[]) {
  let ref: number | null = null, loss = 0, seen = 0;
  for (const v of alt) {
    const a = num(v); if (a == null) continue;
    seen++;
    if (ref == null) { ref = a; continue; }
    if (a <= ref - 3) { loss += ref - a; ref = a; } else if (a >= ref + 3) ref = a;
  }
  return seen > 30 ? Math.round(loss) : null;
}

export function analyze(s: Streams): Analysis | null {
  const n = s.time?.length ?? 0;
  if (n < 120) return null;
  const hist = new Array<number>(HIST_BINS).fill(0);
  const grade = s.grade ?? (s.altitude && s.distance ? gradeFrom(s.altitude, s.distance) : undefined);
  // Série régulière par seconde écoulée en mouvement : [allure ajustée m/min, FC, pente]
  const gapS: number[] = [], hrS: number[] = [], grS: number[] = [], tS: number[] = [];
  let moving = 0, hrSeconds = 0;
  for (let i = 1; i < n; i++) {
    const dt = s.time[i] - s.time[i - 1];
    if (!(dt > 0) || dt > 10) continue; // pause ou trou d’enregistrement
    const hr = num(s.hr?.[i]), v = num(s.speed?.[i]), g = num(grade?.[i]) ?? 0;
    if (hr != null && hr >= 40 && hr <= 230) {
      const b = Math.max(0, Math.min(HIST_BINS - 1, Math.floor((hr - HIST_MIN) / HIST_STEP)));
      hist[b] += dt; hrSeconds += dt;
    }
    if (v != null && v > 0.6) {
      moving += dt;
      if (hr != null) for (let k = 0; k < Math.round(dt); k++) { gapS.push(v * 60 * gapFactor(g)); hrS.push(hr); grS.push(g); tS.push(s.time[i]); }
    }
  }
  if (hrSeconds < 300 && moving < 300) return null;

  // Fenêtres d’effort stable : 2 min, après l’échauffement, pente modérée, FC régulière, en courant.
  const win: [number, number, number][] = [];
  for (let a = 0; a + WIN <= gapS.length; a += STEP) {
    if (tS[a] < WARMUP) continue;
    let sv = 0, sh = 0, sg = 0, lo = Infinity, hi = -Infinity;
    for (let k = a; k < a + WIN; k++) { sv += gapS[k]; sh += hrS[k]; sg += grS[k]; if (hrS[k] < lo) lo = hrS[k]; if (hrS[k] > hi) hi = hrS[k]; }
    const mv = sv / WIN, mh = sh / WIN, mg = sg / WIN;
    if (hi - lo > 10 || mg < -4 || mg > 10 || mv < 110 || mv > 420) continue;
    win.push([Math.round(mv * 10) / 10, Math.round(mh), Math.round(tS[a] / 60)]);
  }
  // On garde au plus MAX_WIN fenêtres, réparties sur toute la sortie.
  const kept = win.length > MAX_WIN ? Array.from({ length: MAX_WIN }, (_, i) => win[Math.floor((i * win.length) / MAX_WIN)]) : win;

  const mean = (l: number[], a: number, b: number) => { let t = 0; for (let k = a; k < b; k++) t += l[k]; return t / Math.max(1, b - a); };
  const m = gapS.length;
  const gap = m >= 300 ? Math.round(mean(gapS, 0, m) * 10) / 10 : null;
  let dec: number | null = null;
  if (m >= 2400) { // 40 min en mouvement avec cardio
    const h = Math.floor(m / 2);
    const e1 = mean(gapS, 0, h) / mean(hrS, 0, h), e2 = mean(gapS, h, m) / mean(hrS, h, m);
    if (e1 > 0) dec = Math.round(((e1 - e2) / e1) * 1000) / 10;
  }
  return { v: 1, hist: hist.map((x) => Math.round(x)), win: kept, gap, dec, loss: s.altitude ? lossOf(s.altitude) : null, moving: Math.round(moving), best: bestsOf(s) };
}

/** Temps le plus court (s) pour couvrir `meters` d’un seul tenant, pauses comprises (comme les records Strava). */
function bestFor(time: number[], dist: (number | null)[], meters: number) {
  const t: number[] = [], d: number[] = [];
  for (let i = 0; i < time.length; i++) { const v = num(dist[i]); if (v != null && (!d.length || v >= d[d.length - 1])) { t.push(time[i]); d.push(v); } }
  let best: number | null = null, a = 0;
  for (let b = 1; b < d.length; b++) {
    if (d[b] - d[0] < meters) continue;
    // a = départ le plus tardif qui couvre encore la distance
    while (a + 1 < b && d[b] - d[a + 1] >= meters) a++;
    // on retire la distance en trop au départ, au prorata de la vitesse du premier segment
    const extra = d[b] - d[a] - meters, seg = d[a + 1] - d[a];
    const tt = t[b] - t[a] - (seg > 0 ? (extra / seg) * (t[a + 1] - t[a]) : 0);
    if (tt > 0 && (best == null || tt < best)) best = tt;
  }
  return best != null ? Math.round(best) : null;
}
/** Meilleure vitesse ascensionnelle sur 10 minutes (m/h), D+ lissé à 3 m. */
function bestVam(time: number[], alt: (number | null)[]) {
  const up: number[] = []; let ref: number | null = null, acc = 0;
  for (const v of alt) { const a = num(v); if (a != null) { if (ref == null) ref = a; else if (a >= ref + 3) { acc += a - ref; ref = a; } else if (a <= ref - 3) ref = a; } up.push(acc); }
  let best = 0, a = 0;
  for (let b = 0; b < time.length; b++) {
    while (a < b && time[b] - time[a] > 600) a++;
    if (time[b] - time[a] >= 590) best = Math.max(best, ((up[b] - up[a]) / (time[b] - time[a])) * 3600);
  }
  return best >= 200 ? Math.round(best) : null;
}
function bestsOf(s: Streams): Best | undefined {
  const k = (m: number) => (s.distance ? bestFor(s.time, s.distance, m) : null);
  // Bornes de vraisemblance : un record mondial ou un GPS qui saute ne doivent pas devenir ton record.
  const ok = (sec: number | null, m: number) => (sec != null && sec >= (m / 1000) * 150 ? sec : null);
  const b = { k1: ok(k(1000), 1000), k5: ok(k(5000), 5000), k10: ok(k(10000), 10000), vam: s.altitude ? bestVam(s.time, s.altitude) : null };
  return b.k1 || b.k5 || b.k10 || b.vam ? { ...b, vam: b.vam != null && b.vam <= 2500 ? b.vam : null } : undefined;
}

// ---------- Lecture du résumé avec la physiologie du coureur ----------
export interface Physio { hrMax?: number | null; hrRest?: number | null }
/** Bornes hautes des zones 1 à 4, en bpm (réserve cardiaque si la FC de repos est connue). */
export function zoneBounds(p: Physio): number[] | null {
  if (!p.hrMax) return null;
  return p.hrRest && p.hrRest < p.hrMax
    ? [0.6, 0.7, 0.8, 0.9].map((f) => p.hrRest! + f * (p.hrMax! - p.hrRest!))
    : [0.6, 0.7, 0.8, 0.9].map((f) => (f + 0.1 * (1 - f)) * p.hrMax!); // mêmes bornes que les zones affichées (engine/paces)
}
/** Minutes passées dans chacune des 5 zones cardiaques. */
export function zoneMinutes(hist: number[] | null | undefined, p: Physio): number[] | null {
  const b = zoneBounds(p);
  if (!b || !hist?.length) return null;
  const z = [0, 0, 0, 0, 0];
  hist.forEach((sec, i) => {
    if (!sec) return;
    const hr = HIST_MIN + (i + 0.5) * HIST_STEP;
    z[hr < b[0] ? 0 : hr < b[1] ? 1 : hr < b[2] ? 2 : hr < b[3] ? 3 : 4] += sec / 60;
  });
  return z.reduce((t, v) => t + v, 0) >= 5 ? z : null;
}

const daniels = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v;
/**
 * VO2max de la sortie à partir des fenêtres stables : coût en oxygène de l’allure ajustée, rapporté
 * à la part de réserve cardiaque utilisée. On retient le quartile supérieur : les passages techniques
 * ou vent de face tirent des fenêtres vers le bas, jamais vers le haut.
 */
export function windowsVo2(win: [number, number, number][] | null | undefined, p: Physio): number | null {
  if (!win || win.length < 4 || !p.hrMax) return null;
  const vals: number[] = [];
  for (const [v, hr, minute] of win) {
    const drift = minute > 60 ? Math.min(0.05, ((minute - 60) / 30) * 0.015) : 0;
    let frac: number;
    if (p.hrRest && p.hrRest < hr) frac = (hr - p.hrRest) / (p.hrMax - p.hrRest) - drift;
    else frac = ((hr / p.hrMax) * 100 - 37) / 64 - drift;
    if (frac < 0.55 || frac > 0.97) continue;
    const x = 3.5 + (daniels(v) - 3.5) / frac;
    if (x >= 25 && x <= 90) vals.push(x);
  }
  if (vals.length < 4) return null;
  vals.sort((a, b) => a - b);
  const q = (f: number) => { const i = (vals.length - 1) * f, lo = Math.floor(i); return vals[lo] + (vals[Math.min(vals.length - 1, lo + 1)] - vals[lo]) * (i - lo); };
  return q(0.75);
}

export function parseAnalysis(raw: string | null | undefined): Analysis | null {
  if (!raw) return null;
  try { const a = JSON.parse(raw) as Analysis; return a && a.v === 1 && Array.isArray(a.hist) ? a : null; } catch { return null; }
}
/** Validation d’un résumé envoyé par le navigateur (import de fichier). */
export function cleanAnalysis(x: unknown): Analysis | null {
  const a = x as Analysis | null;
  if (!a || typeof a !== "object" || a.v !== 1 || !Array.isArray(a.hist) || a.hist.length !== HIST_BINS || !Array.isArray(a.win) || a.win.length > MAX_WIN) return null;
  const ok = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  if (!a.hist.every((v) => ok(v, 0, 200000))) return null;
  if (!a.win.every((w) => Array.isArray(w) && w.length === 3 && ok(w[0], 60, 500) && ok(w[1], 40, 230) && ok(w[2], 0, 3000))) return null;
  return {
    v: 1, hist: a.hist.map(Math.round), win: a.win.map((w) => [w[0], w[1], w[2]] as [number, number, number]),
    gap: ok(a.gap, 30, 600) ? a.gap : null, dec: ok(a.dec, -60, 60) ? a.dec : null, loss: ok(a.loss, 0, 30000) ? a.loss : null, moving: ok(a.moving, 0, 400000) ? Math.round(a.moving) : 0,
    best: a.best && typeof a.best === "object" ? {
      k1: ok(a.best.k1, 150, 3600) ? Math.round(a.best.k1!) : null, k5: ok(a.best.k5, 750, 18000) ? Math.round(a.best.k5!) : null,
      k10: ok(a.best.k10, 1500, 36000) ? Math.round(a.best.k10!) : null, vam: ok(a.best.vam, 200, 2500) ? Math.round(a.best.vam!) : null,
    } : undefined,
  };
}
