import { HttpError, isoDate, num, text } from "./api";
import { SPORTS, type Sport } from "./engine/load";
import { cleanPolyline } from "./polyline";

export function parseActivity(b: Record<string, unknown>, today: string) {
  const sport = String(b.sport ?? "") as Sport;
  if (!(sport in SPORTS)) throw new HttpError(400, "Activité inconnue.");
  const date = isoDate(b.date);
  if (date > today) throw new HttpError(400, "La date ne peut pas être dans le futur.");
  return {
    date, sport, name: text(b.name, 120),
    duration: num(b.durationMin, 3, 2880, "Durée")!,
    distance: num(b.distanceKm, 0, 400, "Distance", true),
    gain: num(b.gainM, 0, 15000, "D+", true),
    loss: num(b.lossM, 0, 15000, "D−", true),
    avgHr: num(b.avgHr, 60, 230, "FC moyenne", true),
    maxHr: num(b.maxHr, 60, 240, "FC max", true),
    rpe: num(b.rpe, 1, 10, "Ressenti", true),
    track: cleanPolyline(b.track),
  };
}
