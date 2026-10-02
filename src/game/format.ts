export function signed(value: number): string {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours <= 0) return `${mins} min`;
  return `${hours} h ${mins.toString().padStart(2, "0")}`;
}

export function formatPace(minPerKm: number): string {
  if (!Number.isFinite(minPerKm) || minPerKm <= 0) return "—";
  const minutes = Math.floor(minPerKm);
  let seconds = Math.round((minPerKm - minutes) * 60);
  let shownMinutes = minutes;
  if (seconds === 60) {
    shownMinutes += 1;
    seconds = 0;
  }
  return `${shownMinutes}:${seconds.toString().padStart(2, "0")}/km`;
}

export function formatKm(km: number): string {
  const rounded = Math.round(km * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

export function formatMeters(meters: number): string {
  return `${Math.round(meters).toLocaleString("fr-FR")} m`;
}

export const DIFFICULTY_LABEL = [
  "",
  "Facile",
  "Modéré",
  "Soutenu",
  "Difficile",
  "Extrême",
] as const;

export function segmentDistance(startKm: number, endKm: number): number {
  return Math.round((endKm - startKm) * 10) / 10;
}
