/**
 * Stratégie de course à partir du tracé (profil distance/altitude) et du temps estimé par le plan.
 *
 * 1. Le parcours est découpé aux ravitaillements (ou tous les 10 km s’il n’y en a pas).
 * 2. Chaque section reçoit une part du temps total proportionnelle à son effort :
 *    km + D+/100 + D−/500 (la descente coûte un peu, surtout en fin de course),
 *    majorée par la fatigue qui s’accumule (jusqu’à +25 % en fin d’ultra).
 * 3. Nutrition par heure d’effort, repères usuels en endurance :
 *    moins de 1 h 30 : de l’eau ; jusqu’à 3 h : 40-60 g de glucides/h ; au-delà : 60-90 g/h ;
 *    500-750 ml d’eau/h et 300-600 mg de sodium/h, à ajuster selon la chaleur et ta tolérance.
 */
export type RoutePoint = [km: number, ele: number];
export interface Aid { km: number; name?: string | null; /** Barrière horaire, en minutes depuis le départ */ cutoff?: number | null }
export interface RaceRoute { points: RoutePoint[]; aid: Aid[]; distanceKm: number; gainM: number; lossM: number; name?: string | null; uploadedAt?: number; /** Tracé GPS (polyline encodée) */ line?: string | null; /** Heure de départ « HH:MM » */ startTime?: string | null; /** Barrière à l’arrivée, en minutes */ finishCutoff?: number | null }
export interface Section {
  from: number; to: number; km: number; gain: number; loss: number; label: string;
  minutes: { low: number; high: number }; arrival: { low: number; high: number };
  carbs: [number, number]; water: [number, number]; pace: string;
  /** Barrière horaire en fin de section (minutes) et marge sur l’estimation prudente */
  cutoff: number | null; margin: number | null;
  /** Ce qu’il faut emporter : gels (≈ 25 g de glucides) et flasques de 500 ml */
  gels: [number, number]; flasks: [number, number];
}
export interface Strategy { sections: Section[]; total: { low: number; high: number }; perHour: { carbs: [number, number]; water: [number, number]; sodium: [number, number] }; totals: { carbs: [number, number]; water: [number, number] } }

const r = (n: number) => Math.round(n);

function climb(points: RoutePoint[], from: number, to: number) {
  let gain = 0, loss = 0, prev: number | null = null;
  for (const [k, e] of points) {
    if (k < from || k > to) continue;
    if (prev != null) { const d = e - prev; if (d > 0) gain += d; else loss -= d; }
    prev = e;
  }
  return { gain: r(gain), loss: r(loss) };
}

export function perHourNeeds(totalMin: number) {
  const h = totalMin / 60;
  const carbs: [number, number] = h < 1.5 ? [0, 30] : h <= 3 ? [40, 60] : [60, 90];
  return { carbs, water: [500, 750] as [number, number], sodium: [300, 600] as [number, number] };
}

export interface WeatherLike { tMin: number; tMax: number; feelsMax: number; rainProb: number | null; windMax: number }
export interface WeatherAdjust { water: [number, number]; sodium: [number, number]; timeFactor: number; tips: string[]; tone: "chaud" | "tres-chaud" | "froid" | "normal" }

/**
 * Ajustements selon la météo prévue : par forte chaleur on boit et on sale davantage, et on court plus lentement
 * (repères usuels : environ +3 à +8 % de temps au-delà de 24-30 °C ressentis).
 */
export function weatherAdjust(w: WeatherLike): WeatherAdjust {
  const t = Math.max(w.tMax, w.feelsMax), tips: string[] = [];
  let water: [number, number] = [500, 750], sodium: [number, number] = [300, 600], timeFactor = 1, tone: WeatherAdjust["tone"] = "normal";
  if (t >= 30) {
    tone = "tres-chaud"; water = [750, 1000]; sodium = [500, 1000]; timeFactor = 1.08;
    tips.push("Forte chaleur : pars nettement plus lentement, mouille casquette et nuque à chaque point d’eau, et prends du sel à chaque ravito.");
  } else if (t >= 24) {
    tone = "chaud"; water = [600, 900]; sodium = [400, 800]; timeFactor = 1.04;
    tips.push("Il fera chaud : bois un peu à chaque fois plutôt que beaucoup d’un coup, et prévois de quoi te couvrir la tête.");
  } else if (w.tMin <= 3 || t <= 6) {
    tone = "froid"; water = [400, 650];
    tips.push("Il fera froid : couches fines, gants et bonnet, et une veste chaude dans le sac pour les arrêts. On boit moins, mais il faut boire quand même.");
  }
  if ((w.rainProb ?? 0) >= 60) tips.push("Pluie probable : veste imperméable avec capuche, et attention aux descentes glissantes.");
  if (w.windMax >= 40) tips.push(`Vent fort (jusqu’à ${w.windMax} km/h) : sur les crêtes le ressenti chute vite, garde une couche coupe-vent accessible.`);
  return { water, sodium, timeFactor, tips, tone };
}

export function buildStrategy(route: RaceRoute, rawEstimate: { low: number; high: number }, weather?: WeatherAdjust | null): Strategy {
  const estimate = weather ? { low: rawEstimate.low * weather.timeFactor, high: rawEstimate.high * weather.timeFactor } : rawEstimate;
  const dist = route.distanceKm;
  const named = new Map<number, string>();
  for (const a of route.aid) if (a.km > 0.2 && a.km < dist - 0.2) { const k = Math.round(a.km * 10) / 10; if (!named.has(k)) named.set(k, a.name?.trim() || ""); }
  const cutoffAt = new Map<number, number>();
  for (const a of route.aid) if (a.cutoff && a.cutoff > 0) cutoffAt.set(Math.round(a.km * 10) / 10, a.cutoff);
  const cuts = [...named.keys()].sort((a, b) => a - b);
  const auto = !cuts.length;
  if (auto) for (let k = 10; k < dist - 3; k += 10) cuts.push(k);
  const bounds = [0, ...cuts, dist];
  const ultra = estimate.high > 240;
  const raw = bounds.slice(1).map((to, i) => {
    const from = bounds[i], c = climb(route.points, from, to), mid = (from + to) / 2 / dist;
    const effort = (to - from) + c.gain / 100 + c.loss / 500;
    return { from, to, ...c, w: effort * (1 + (ultra ? 0.25 : 0.1) * mid) };
  });
  const W = raw.reduce((s, x) => s + x.w, 0) || 1;
  const base = perHourNeeds((estimate.low + estimate.high) / 2);
  const needs = weather ? { ...base, water: weather.water, sodium: weather.sodium } : base;
  let accLow = 0, accHigh = 0;
  const sections: Section[] = raw.map((x, i) => {
    const low = (estimate.low * x.w) / W, high = (estimate.high * x.w) / W;
    accLow += low; accHigh += high;
    const h = (low + high) / 2 / 60, km = Math.round((x.to - x.from) * 10) / 10;
    const paceMin = ((low + high) / 2) / Math.max(0.1, km);
    return {
      from: Math.round(x.from * 10) / 10, to: Math.round(x.to * 10) / 10, km, gain: x.gain, loss: x.loss,
      label: i === raw.length - 1 ? "Arrivée" : auto ? `Km ${x.to}` : named.get(x.to) || `Ravito ${i + 1}`,
      minutes: { low: r(low), high: r(high) }, arrival: { low: r(accLow), high: r(accHigh) },
      carbs: [r((needs.carbs[0] * h) / 5) * 5, r((needs.carbs[1] * h) / 5) * 5],
      water: [r((needs.water[0] * h) / 50) * 50, r((needs.water[1] * h) / 50) * 50],
      pace: `${Math.floor(paceMin)}:${String(r((paceMin % 1) * 60) % 60).padStart(2, "0")}`,
      ...cutoffOf(i === raw.length - 1 ? route.finishCutoff ?? null : cutoffAt.get(Math.round(x.to * 10) / 10) ?? null, r(accHigh)),
      gels: [Math.ceil(r((needs.carbs[0] * h) / 5) * 5 / 25), Math.ceil(r((needs.carbs[1] * h) / 5) * 5 / 25)],
      flasks: [Math.max(0, Math.ceil(r((needs.water[0] * h) / 50) * 50 / 500 - 0.15)), Math.max(1, Math.ceil(r((needs.water[1] * h) / 50) * 50 / 500 - 0.15))],
    };
  });
  const sum = (k: "carbs" | "water", j: 0 | 1) => sections.reduce((s, x) => s + x[k][j], 0);
  return { sections, total: { low: r(accLow), high: r(accHigh) }, perHour: needs, totals: { carbs: [sum("carbs", 0), sum("carbs", 1)], water: [sum("water", 0), sum("water", 1)] } };
}

const cutoffOf = (cutoff: number | null, arrivalHigh: number) => ({ cutoff, margin: cutoff ? cutoff - arrivalHigh : null });

/** « 7:30 » + 95 min → « 9:05 » (heure réelle de passage, sur 24 h). */
export function clockAt(start: string | null | undefined, minutes: number): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(start ?? "");
  if (!m) return null;
  const t = (Number(m[1]) * 60 + Number(m[2]) + Math.round(minutes)) % 1440;
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** « 4h30 », « 4:30 », « 270 » → minutes ; vide → null. */
export function parseDuration(v: string): number | null | undefined {
  const t = v.trim().toLowerCase().replace(/\s/g, "");
  if (!t) return null;
  let m = /^(\d{1,3})[h:](\d{1,2})?(?:min)?$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2] ?? 0);
  m = /^(\d{1,4})(?:min)?$/.exec(t);
  return m ? Number(m[1]) : undefined;
}

/** Simplifie un profil à environ un point tous les 100 m, et au plus 2 500 points. */
export function simplifyProfile(points: RoutePoint[]): RoutePoint[] {
  if (points.length < 3) return points;
  const total = points[points.length - 1][0];
  const step = Math.max(0.1, total / 2500);
  const out: RoutePoint[] = [points[0]];
  let next = step;
  for (const p of points) if (p[0] >= next) { out.push([Math.round(p[0] * 1000) / 1000, Math.round(p[1])]); next = p[0] + step; }
  const last = points[points.length - 1];
  if (out[out.length - 1][0] !== last[0]) out.push([Math.round(last[0] * 1000) / 1000, Math.round(last[1])]);
  return out;
}

/** Heure de passage estimée (min, fourchette) à un kilomètre donné, interpolée dans les sections. */
export function passageAt(strat: Strategy, km: number) {
  let t0 = { low: 0, high: 0 }, k0 = 0;
  for (const sec of strat.sections) {
    if (km <= sec.to) {
      const f = sec.to > k0 ? (km - k0) / (sec.to - k0) : 1;
      return { low: t0.low + (sec.arrival.low - t0.low) * f, high: t0.high + (sec.arrival.high - t0.high) * f };
    }
    t0 = sec.arrival; k0 = sec.to;
  }
  return t0;
}
