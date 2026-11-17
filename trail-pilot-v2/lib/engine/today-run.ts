/**
 * Bloc « Ma sortie du jour » : forme des données, et données d'exemple quand une donnée réelle manque.
 * Partie pure, partagée par le serveur et l'écran.
 */
export interface TodayRun {
  run: { id: number; date: string; isToday: boolean; sport: string; name: string; distanceKm: number; gainM: number | null; paceSec: number; profile: number[] | null } | null;
  /** D+ moyen des sorties à pied de la semaine dernière. */
  gainRef: { avg: number; count: number } | null;
  /** Temps réalisé depuis lundi sur le temps prévu par le plan pour la semaine. */
  week: { doneMin: number; plannedMin: number; pct: number } | null;
  trailhead: { name: string; km: number; bearing: number; from: string } | null;
  hasTerrains: boolean;
}

/*
 * ⚠ DONNÉES D'EXEMPLE ⚠
 * Utilisées seulement quand la donnée réelle manque (pas de sortie récente, sortie analysée avant l'ajout du profil
 * d'altitude, pas de plan, pas de terrain enregistré). L'écran affiche alors la mention « Exemple » sur la partie concernée.
 * Ne jamais les présenter comme des données du coureur.
 */
export const EXAMPLE_RUN: NonNullable<TodayRun["run"]> = {
  id: 0, date: "", isToday: true, sport: "trail", name: "Boucle des crêtes",
  distanceKm: 24.6, gainM: 1180, paceSec: 342, profile: null,
};
export const EXAMPLE_PROFILE: number[] = [
  412, 418, 431, 452, 480, 511, 547, 590, 634, 671, 702, 728, 744, 751, 748, 736, 719, 702, 694, 701,
  722, 756, 798, 841, 879, 905, 918, 921, 910, 884, 846, 801, 752, 703, 655, 607, 561, 512, 468, 431,
];
export const EXAMPLE_GAIN_REF = { avg: 960, count: 3 };
export const EXAMPLE_WEEK = { doneMin: 248, plannedMin: 380, pct: 65 };
export const EXAMPLE_TRAILHEAD = { name: "Col de la Croix", km: 6.4, bearing: 52, from: "ta dernière sortie" };

/** Allure en minutes et secondes : 342 s → « 5'42 ». */
export const fmtPace = (sec: number) => { const m = Math.floor(sec / 60), s = Math.round(sec % 60); return s === 60 ? `${m + 1}'00` : `${m}'${String(s).padStart(2, "0")}`; };
/** Nombre à la française avec une décimale : 24.6 → « 24,6 ». */
export const fmtKm1 = (km: number) => (Math.round(km * 10) / 10).toFixed(1).replace(".", ",");

/** Rééchantillonne une série en `cols` colonnes (moyenne par tronçon) : sert aux profils plus longs ou plus courts que la grille. */
export function resample(values: number[], cols: number): number[] {
  if (values.length === cols) return values;
  if (values.length < 2) return new Array(cols).fill(values[0] ?? 0);
  return Array.from({ length: cols }, (_, c) => {
    const a = (c / cols) * values.length, b = ((c + 1) / cols) * values.length;
    const i0 = Math.floor(a), i1 = Math.max(i0 + 1, Math.ceil(b));
    const part = values.slice(i0, Math.min(values.length, i1));
    return part.length ? part.reduce((t, v) => t + v, 0) / part.length : values[values.length - 1];
  });
}

/** Hauteur de chaque colonne en nombre de points (1 à rows) d'après l'altitude, en gardant au moins un point par colonne. */
export function dotHeights(profile: number[], rows: number): number[] {
  const lo = Math.min(...profile), hi = Math.max(...profile), span = hi - lo;
  if (!Number.isFinite(span) || span < 1) return profile.map(() => Math.ceil(rows / 2));
  return profile.map((v) => 1 + Math.round(((v - lo) / span) * (rows - 1)));
}
