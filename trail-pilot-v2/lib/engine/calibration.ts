/**
 * Calibrage personnel des estimations de course.
 * Chaque course débriefée compare ton vrai temps à ce que le modèle (sans calibrage) annonçait.
 * Le facteur retenu est la moyenne géométrique de ces rapports, tirée vers 1 tant qu’il y a peu de courses
 * (une course seule ne compte qu’à moitié : un jour sans ou un parcours modifié ne doit pas tout fausser),
 * limitée à ±20 %. Plus les courses sont anciennes, moins elles pèsent (demi-vie de 9 mois).
 * Seule l’estimation du temps de course change : les volumes d’entraînement conseillés ne bougent pas.
 */
export interface CalibPoint { date: string; name: string; actual: number; model: number }
export interface Calibration { factor: number; n: number; points: (CalibPoint & { ratio: number })[] }

export function calibrate(points: CalibPoint[], today: string): Calibration {
  const ok = points
    .filter((p) => p.model > 0 && p.actual > 0)
    .map((p) => ({ ...p, ratio: p.actual / p.model }))
    // Un écart de plus de 40 % tient presque toujours à autre chose que la forme (abandon, parcours changé, erreur d’enregistrement).
    .filter((p) => p.ratio > 0.6 && p.ratio < 1.4)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);
  if (!ok.length) return { factor: 1, n: 0, points: [] };
  const t = new Date(`${today}T12:00:00Z`).getTime();
  let sw = 0, sl = 0;
  for (const p of ok) {
    const months = Math.max(0, (t - new Date(`${p.date}T12:00:00Z`).getTime()) / (30.4 * 86400000));
    const w = 0.5 ** (months / 9);
    sw += w; sl += w * Math.log(p.ratio);
  }
  const raw = Math.exp(sl / sw);
  const shrink = ok.length / (ok.length + 1);
  const factor = Math.min(1.2, Math.max(0.8, 1 + (raw - 1) * shrink));
  return { factor: Math.round(factor * 1000) / 1000, n: ok.length, points: ok };
}

export const calibLabel = (c: { factor: number; n: number } | null | undefined) => {
  if (!c || !c.n || Math.abs(c.factor - 1) < 0.01) return null;
  const pct = Math.round(Math.abs(c.factor - 1) * 100);
  return `recalée sur ${c.n} course${c.n > 1 ? "s" : ""} : tu cours ${pct} % ${c.factor < 1 ? "plus vite" : "moins vite"} que le modèle`;
};
