import "server-only";
import { one, run } from "@/db/client";
import { addDays, diffDays } from "./engine/dates";

/**
 * Météo du jour de course par Open-Meteo (gratuit, sans clé) : prévision quotidienne au point de départ,
 * disponible 16 jours avant. Mise en cache 3 h pour ménager le service.
 */
export interface RaceWeather {
  date: string; tMin: number; tMax: number; feelsMax: number; rainProb: number | null; rainMm: number; windMax: number; code: number; label: string;
}
export const FORECAST_DAYS = 15;

const LABELS: [number[], string][] = [
  [[0], "Ciel dégagé"], [[1, 2], "Éclaircies"], [[3], "Couvert"], [[45, 48], "Brouillard"],
  [[51, 53, 55, 56, 57], "Bruine"], [[61, 63, 65, 66, 67, 80, 81, 82], "Pluie"], [[71, 73, 75, 77, 85, 86], "Neige"], [[95, 96, 99], "Orages"],
];
const labelOf = (c: number) => LABELS.find(([cs]) => cs.includes(c))?.[1] ?? "Variable";

export async function raceWeather(lat: number, lon: number, date: string, today: string): Promise<{ status: "ok"; weather: RaceWeather } | { status: "later"; from: string } | { status: "past" } | { status: "error" }> {
  const d = diffDays(today, date);
  if (d < 0) return { status: "past" };
  if (d > FORECAST_DAYS) return { status: "later", from: addDays(date, -FORECAST_DAYS) };
  const key = `wx:${lat.toFixed(2)},${lon.toFixed(2)},${date}`;
  const cached = await one<{ value: string; updated_at: number }>("SELECT value, updated_at FROM app_kv WHERE key = ?", [key]);
  if (cached && Date.now() - cached.updated_at < 3 * 3600000) return { status: "ok", weather: JSON.parse(cached.value) };
  try {
    const q = new URLSearchParams({
      latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: "auto", start_date: date, end_date: date,
      daily: "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_probability_max,precipitation_sum,wind_speed_10m_max",
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const j = (await res.json()) as { daily?: Record<string, (number | null)[]> };
    const v = (k: string) => j.daily?.[k]?.[0] ?? null;
    if (v("temperature_2m_max") == null) throw new Error("Prévision vide");
    const w: RaceWeather = {
      date, tMin: Math.round(v("temperature_2m_min")!), tMax: Math.round(v("temperature_2m_max")!), feelsMax: Math.round(v("apparent_temperature_max") ?? v("temperature_2m_max")!),
      rainProb: v("precipitation_probability_max"), rainMm: Math.round((v("precipitation_sum") ?? 0) * 10) / 10, windMax: Math.round(v("wind_speed_10m_max") ?? 0),
      code: v("weather_code") ?? 0, label: labelOf(v("weather_code") ?? 0),
    };
    await run("INSERT OR REPLACE INTO app_kv(key, value, updated_at) VALUES (?, ?, ?)", [key, JSON.stringify(w), Date.now()]);
    return { status: "ok", weather: w };
  } catch {
    return cached ? { status: "ok", weather: JSON.parse(cached.value) } : { status: "error" };
  }
}

export interface Place { name: string; lat: number; lon: number }
export async function searchPlaces(query: string): Promise<Place[]> {
  const q = new URLSearchParams({ name: query, count: "6", language: "fr", format: "json" });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${q}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const j = (await res.json()) as { results?: { name: string; latitude: number; longitude: number; admin1?: string; country?: string }[] };
  return (j.results ?? []).map((r) => ({ name: [r.name, r.admin1, r.country].filter(Boolean).join(", ").slice(0, 120), lat: r.latitude, lon: r.longitude }));
}

/** Prévision jour par jour (15 jours) au lieu d’entraînement, pour corriger les allures des séances. Cache 3 h. */
export async function trainingForecast(lat: number, lon: number, today: string): Promise<RaceWeather[] | null> {
  const key = `wxt:${lat.toFixed(2)},${lon.toFixed(2)},${today}`;
  const cached = await one<{ value: string; updated_at: number }>("SELECT value, updated_at FROM app_kv WHERE key = ?", [key]);
  if (cached && Date.now() - cached.updated_at < 3 * 3600000) return JSON.parse(cached.value);
  try {
    const q = new URLSearchParams({
      latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: "auto", start_date: today, end_date: addDays(today, FORECAST_DAYS - 1),
      daily: "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_probability_max,precipitation_sum,wind_speed_10m_max",
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const j = (await res.json()) as { daily?: Record<string, (number | string | null)[]> };
    const d = j.daily;
    if (!d?.time?.length) throw new Error("Prévision vide");
    const days: RaceWeather[] = [];
    d.time.forEach((date, i) => {
      const v = (k: string) => (d[k]?.[i] as number | null) ?? null;
      if (v("temperature_2m_max") == null) return;
      const code = v("weather_code") ?? 0;
      days.push({ date: String(date), tMin: Math.round(v("temperature_2m_min")!), tMax: Math.round(v("temperature_2m_max")!), feelsMax: Math.round(v("apparent_temperature_max") ?? v("temperature_2m_max")!),
        rainProb: v("precipitation_probability_max"), rainMm: Math.round((v("precipitation_sum") ?? 0) * 10) / 10, windMax: Math.round(v("wind_speed_10m_max") ?? 0), code, label: labelOf(code) });
    });
    await run("INSERT OR REPLACE INTO app_kv(key, value, updated_at) VALUES (?, ?, ?)", [key, JSON.stringify(days), Date.now()]);
    return days;
  } catch {
    return cached ? JSON.parse(cached.value) : null;
  }
}
