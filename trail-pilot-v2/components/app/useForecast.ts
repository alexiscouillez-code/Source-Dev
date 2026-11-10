"use client";

import { useEffect, useState } from "react";
import { api } from "./client";
import type { DayWeather } from "@/lib/engine/conditions";

export interface Forecast { status: "ok" | "noplace" | "error" | "loading"; place?: { name: string; lat: number; lon: number }; chosen?: boolean; days?: DayWeather[] }

// Une seule requête par jour et par onglet : la prévision est partagée par tous les écrans.
let cache: { today: string; p: Promise<Forecast> } | null = null;
const listeners = new Set<(f: Forecast) => void>();

export function refreshForecast(today: string) {
  cache = { today, p: api<Forecast>(`/api/weather/training?today=${today}`).catch(() => ({ status: "error" as const })) };
  cache.p.then((f) => listeners.forEach((l) => l(f)));
  return cache.p;
}

export function useForecast(today: string | undefined) {
  const [f, setF] = useState<Forecast>({ status: "loading" });
  useEffect(() => {
    if (!today) return;
    let live = true;
    const on = (x: Forecast) => { if (live) setF(x); };
    listeners.add(on);
    (cache?.today === today ? cache.p : refreshForecast(today)).then(on);
    return () => { live = false; listeners.delete(on); };
  }, [today]);
  return f;
}

export const dayOf = (f: Forecast, date: string) => f.days?.find((d) => d.date === date) ?? null;
