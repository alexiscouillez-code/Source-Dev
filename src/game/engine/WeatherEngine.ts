import { WEATHER } from "@/game/engine/balance";
import type { WeatherType } from "@/game/models/types";

export function weatherMods(weather: WeatherType) {
  return WEATHER[weather];
}

export function weatherLabel(weather: WeatherType): string {
  return WEATHER[weather].label;
}
