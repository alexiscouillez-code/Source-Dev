/** Réglage du fond d'herbes, gardé sur l'appareil : vivant (par défaut), calme ou fixe. */
export type GrassMode = "vivant" | "calme" | "fixe";
export const GRASS_KEY = "trail-pilot-grass";
export const GRASS_EVENT = "tp-grass";
export const grassMode = (): GrassMode => {
  try { const v = localStorage.getItem(GRASS_KEY); return v === "calme" || v === "fixe" ? v : "vivant"; } catch { return "vivant"; }
};
export function setGrassMode(m: GrassMode) {
  try { if (m === "vivant") localStorage.removeItem(GRASS_KEY); else localStorage.setItem(GRASS_KEY, m); } catch { /* navigation privée */ }
  window.dispatchEvent(new CustomEvent(GRASS_EVENT, { detail: m }));
}

/** Conditions renvoyées par /api/weather/now (pour le fond et pour la ligne d'explication du réglage). */
export interface GrassEnv {
  status: "ok" | "noplace" | "error";
  place?: { name: string; lat: number; lon: number };
  raceDay?: boolean;
  now?: { temp: number; wind: number; gust: number; dir: number; rain: number; snow: number; code: number; cloud: number; isDay: boolean; label: string };
}
const FROM = ["du nord", "du nord-est", "d’est", "du sud-est", "du sud", "du sud-ouest", "d’ouest", "du nord-ouest"];
export const windFrom = (deg: number) => FROM[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
