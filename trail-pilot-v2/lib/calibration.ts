import "server-only";
import { all } from "@/db/client";
import { calibrate, type CalibPoint, type Calibration } from "./engine/calibration";

/** Temps médian du modèle (sans calibrage) d’un « prévu » de débrief, retrouvé depuis sa fourchette si besoin. */
export function modelMidOf(p: { modelMid?: number | null; estimate: { low: number; high: number } | null; calib?: number | null }): number | null {
  if (p.modelMid && p.modelMid > 0) return p.modelMid;
  if (!p.estimate) return null;
  // Fourchette = médiane × [0,94 ; 1,10] (VO2) ou [0,92 ; 1,15] (niveau) : son milieu vaut environ 1,03 × la médiane.
  return ((p.estimate.low + p.estimate.high) / 2 / 1.03) / (p.calib && p.calib > 0 ? p.calib : 1);
}

/** Facteur personnel tiré des courses débriefées (tous les débriefs, pas seulement les 90 derniers jours). */
export async function loadCalibration(userId: number, today: string, exceptKey?: string): Promise<Calibration> {
  const rows = await all<{ race_key: string; planned: string | null; duration_min: number | null; distance_km: number | null }>(
    `SELECT d.race_key, d.planned,
       (SELECT a.duration_min FROM activities a WHERE a.user_id = d.user_id AND a.date = json_extract(d.planned, '$.date') AND a.sport IN ('trail', 'course') ORDER BY a.duration_min DESC LIMIT 1) AS duration_min,
       (SELECT a.distance_km FROM activities a WHERE a.user_id = d.user_id AND a.date = json_extract(d.planned, '$.date') AND a.sport IN ('trail', 'course') ORDER BY a.duration_min DESC LIMIT 1) AS distance_km
     FROM race_debriefs d WHERE d.user_id = ? AND d.planned IS NOT NULL`, [userId]);
  const pts: CalibPoint[] = [];
  for (const r of rows) {
    if (r.race_key === exceptKey || !r.duration_min) continue;
    try {
      const p = JSON.parse(r.planned!) as { name: string; date: string; distanceKm: number | null; estimate: { low: number; high: number } | null; modelMid?: number; calib?: number };
      if (p.date >= today) continue;
      // Seules les courses dont la sortie correspond au parcours prévu (±12 % de distance) servent au calibrage.
      if (p.distanceKm && r.distance_km && Math.abs(r.distance_km / p.distanceKm - 1) > 0.12) continue;
      const model = modelMidOf(p);
      if (model) pts.push({ date: p.date, name: p.name, actual: r.duration_min, model });
    } catch { /* instantané illisible */ }
  }
  return calibrate(pts, today);
}
