/** Dates civiles au format AAAA-MM-JJ, calculées à midi UTC pour éviter les pièges d’heure d’été. */
const DAY = 86400000;
const at = (d: string) => Date.parse(`${d}T12:00:00Z`);
export const addDays = (d: string, n: number) => new Date(at(d) + n * DAY).toISOString().slice(0, 10);
export const diffDays = (from: string, to: string) => Math.round((at(to) - at(from)) / DAY);
/** 0 = lundi … 6 = dimanche */
export const weekday = (d: string) => (new Date(at(d)).getUTCDay() + 6) % 7;
export const mondayOf = (d: string) => addDays(d, -weekday(d));
export const range = (start: string, count: number) => Array.from({ length: count }, (_, i) => addDays(start, i));
export const WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
export function todayIn(timeZone = "Europe/Paris", now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
