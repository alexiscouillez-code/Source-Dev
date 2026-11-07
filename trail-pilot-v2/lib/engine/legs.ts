import { diffDays } from "./dates";
import type { ActivityLike, Sport } from "./load";

/**
 * Sollicitation mécanique du bas du corps, zone par zone.
 *
 * Chaque séance est décomposée en montée (D+), descente (D−) et distance à plat. Une matrice
 * attribue ces trois efforts aux zones (la descente, excentrique, charge surtout quadriceps,
 * genoux et tibias ; la montée, fessiers et mollets). La valeur affichée est RELATIVE : la
 * période récente comparée à ta propre moyenne des semaines précédentes.
 *
 * C’est une estimation à partir de trois chiffres, pas une mesure musculaire ni un diagnostic.
 */
export const ZONES = {
  glutes: "Fessiers",
  hipflex: "Fléchisseurs de hanche",
  adductors: "Adducteurs",
  quads: "Quadriceps",
  hamstrings: "Ischio-jambiers",
  knees: "Genoux",
  shins: "Tibias",
  calves: "Mollets",
  ankles: "Chevilles",
  feet: "Pieds",
  lumbar: "Lombaires",
  core: "Sangle abdominale",
} as const;
export type Zone = keyof typeof ZONES;
export type Factor = "climb" | "descent" | "flat";

// Poids par 100 m de D+, par 100 m de D− et par km.
const MATRIX: Record<Zone, Record<Factor, number>> = {
  glutes:     { climb: 1.0, descent: 0.3, flat: 0.2 },
  hipflex:    { climb: 0.9, descent: 0.2, flat: 0.4 },
  adductors:  { climb: 0.3, descent: 0.5, flat: 0.3 },
  quads:      { climb: 0.7, descent: 1.2, flat: 0.3 },
  hamstrings: { climb: 0.5, descent: 0.2, flat: 0.3 },
  knees:      { climb: 0.2, descent: 1.0, flat: 0.3 },
  shins:      { climb: 0.2, descent: 0.6, flat: 0.4 },
  calves:     { climb: 1.0, descent: 0.4, flat: 0.5 },
  ankles:     { climb: 0.3, descent: 0.5, flat: 0.3 },
  feet:       { climb: 0.3, descent: 0.5, flat: 0.5 },
  lumbar:     { climb: 0.4, descent: 0.4, flat: 0.2 },
  core:       { climb: 0.3, descent: 0.4, flat: 0.2 },
};
const SPORT_FACTOR: Partial<Record<Sport, number>> = { trail: 1, course: 1, rando: 0.6, autre: 0.4 };

export interface ZoneSession { date: string; name: string | null; sport: Sport; value: number }
export interface ZoneReading {
  zone: Zone; label: string;
  recent: number; baseline: number | null; ratio: number | null;
  level: "faible" | "habituel" | "élevé" | "très élevé" | "inconnu";
  intensity: number; // 0..1 pour la couleur
  factors: Record<Factor, number>; // part en %
  sessions: ZoneSession[];
}
export interface LegsReading {
  period: 7 | 28; zones: ZoneReading[]; confidence: number; activities: number; withElevation: number;
  baselineWeeks: number; notes: string[];
}

type Act = ActivityLike & { name?: string | null };

function split(a: Act): Record<Factor, number> {
  const f = SPORT_FACTOR[a.sport] ?? 0;
  const gain = a.gainM ?? 0;
  const loss = a.lossM ?? (a.sport === "trail" || a.sport === "rando" ? gain : 0); // boucle : autant de D− que de D+
  const km = a.distanceKm ?? (a.durationMin / (a.sport === "rando" ? 13 : 6.5));
  if (a.sport === "velo") return { climb: (a.durationMin / 60) * 0.8, descent: 0, flat: 0 }; // pédalage : surtout fessiers / quadriceps
  return { climb: (gain / 100) * f, descent: (loss / 100) * f * (a.sport === "rando" ? 1.4 : 1), flat: km * f };
}

function zoneValue(z: Zone, s: Record<Factor, number>, sport: Sport) {
  if (sport === "velo") return z === "quads" ? s.climb * 3 : z === "glutes" ? s.climb * 2 : z === "hamstrings" || z === "hipflex" ? s.climb : z === "calves" ? s.climb * 0.5 : 0;
  const m = MATRIX[z];
  return s.climb * m.climb + s.descent * m.descent + s.flat * m.flat;
}

export function legsReading(activities: Act[], today: string, period: 7 | 28 = 7): LegsReading {
  const inRange = (a: Act, from: number, to: number) => { const d = diffDays(a.date, today); return d >= from && d < to; };
  const recent = activities.filter((a) => inRange(a, 0, period));
  const baseWindow = period === 7 ? 28 : 56; // 4 semaines (ou 8) avant la période
  const base = activities.filter((a) => inRange(a, period, period + baseWindow));
  const weeksBase = baseWindow / 7, weeksRecent = period / 7;
  const relevant = (a: Act) => (SPORT_FACTOR[a.sport] ?? 0) > 0 || a.sport === "velo";
  const recentFoot = recent.filter(relevant);
  const withElevation = recentFoot.filter((a) => a.gainM != null).length;
  const hasBase = base.filter(relevant).length >= 3;

  const zones: ZoneReading[] = (Object.keys(ZONES) as Zone[]).map((zone) => {
    const factors: Record<Factor, number> = { climb: 0, descent: 0, flat: 0 };
    const sessions: ZoneSession[] = [];
    let r = 0;
    for (const a of recentFoot) {
      const s = split(a);
      const v = zoneValue(zone, s, a.sport);
      r += v;
      if (a.sport === "velo") factors.climb += v;
      else for (const k of Object.keys(factors) as Factor[]) factors[k] += s[k] * MATRIX[zone][k];
      if (v > 0) sessions.push({ date: a.date, name: a.name ?? null, sport: a.sport, value: v });
    }
    let b = 0;
    for (const a of base) if (relevant(a)) b += zoneValue(zone, split(a), a.sport);
    const recentWeekly = r / weeksRecent;
    const baseWeekly = hasBase ? b / weeksBase : null;
    const ratio = baseWeekly && baseWeekly > 0.5 ? recentWeekly / baseWeekly : null;
    const level: ZoneReading["level"] = ratio == null ? (r > 0 ? "inconnu" : "faible") : ratio < 0.8 ? "faible" : ratio <= 1.3 ? "habituel" : ratio <= 1.6 ? "élevé" : "très élevé";
    const sum = factors.climb + factors.descent + factors.flat || 1;
    return {
      zone, label: ZONES[zone], recent: round1(recentWeekly), baseline: baseWeekly == null ? null : round1(baseWeekly), ratio: ratio == null ? null : Math.round(ratio * 100) / 100,
      level, intensity: 0,
      factors: { climb: Math.round((factors.climb / sum) * 100), descent: Math.round((factors.descent / sum) * 100), flat: Math.round((factors.flat / sum) * 100) },
      sessions: sessions.sort((x, y) => y.value - x.value).slice(0, 3).map((s) => ({ ...s, value: round1(s.value) })),
    };
  });

  // Couleur : relative à ta moyenne si on la connaît, sinon à la zone la plus sollicitée.
  const maxRecent = Math.max(...zones.map((z) => z.recent), 0.001);
  // Les deux comptent : ta moyenne (est-ce inhabituel ?) et la répartition (où ça a chargé ?).
  for (const z of zones) {
    const share = clamp(z.recent / maxRecent, 0, 1);
    z.intensity = Math.round((z.ratio != null ? clamp((z.ratio - 0.6) / 1.4, 0, 1) * 0.6 + share * 0.4 : share * 0.6) * 100) / 100;
  }

  const confidence = recentFoot.length === 0 ? 0 : Math.round(Math.min(1, recentFoot.length / (period === 7 ? 3 : 10)) * (0.4 + 0.6 * (withElevation / recentFoot.length)) * (hasBase ? 1 : 0.6) * 100);
  const notes: string[] = [];
  if (!hasBase) notes.push("Pas assez de séances avant cette période pour te comparer à ta moyenne : les couleurs montrent seulement la répartition entre les zones.");
  if (recentFoot.length && withElevation < recentFoot.length) notes.push(`${recentFoot.length - withElevation} séance(s) sans dénivelé renseigné : la montée et la descente y sont sous-estimées.`);
  return { period, zones, confidence, activities: recentFoot.length, withElevation, baselineWeeks: weeksBase, notes };
}

/** La course à venir sollicite-t-elle les zones plus que l’entraînement actuel ? */
export function raceGap(activities: Act[], today: string, race: { distanceKm: number | null; gainM: number | null } | null) {
  if (!race?.distanceKm) return null;
  const last28 = activities.filter((a) => { const d = diffDays(a.date, today); return d >= 0 && d < 28 && (a.sport === "trail" || a.sport === "course" || a.sport === "rando"); });
  const km = last28.reduce((s, a) => s + (a.distanceKm ?? 0), 0);
  if (km < 10) return null;
  const gain = last28.reduce((s, a) => s + (a.gainM ?? 0), 0);
  const loss = last28.reduce((s, a) => s + (a.lossM ?? a.gainM ?? 0), 0);
  const raceGainKm = (race.gainM ?? 0) / race.distanceKm;
  return { raceGainPerKm: Math.round(raceGainKm), trainGainPerKm: Math.round(gain / km), raceLossPerKm: Math.round(raceGainKm), trainLossPerKm: Math.round(loss / km) };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
