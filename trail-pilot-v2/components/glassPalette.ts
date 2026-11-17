/**
 * Couleur de fond du mode Verre : une teinte (0 à 360°) et une intensité, d'où l'on tire toute la palette
 * (fond, taches lumineuses, boutons). Les couleurs sont calculées en OKLCH : à luminosité égale, toutes les
 * teintes donnent le même contraste avec le texte blanc. Une couleur hors de l'écran (sRGB) perd de la
 * saturation, jamais de luminosité, pour garder ce contraste.
 * Partie pure : sert à l'écran et aux tests.
 */

export interface GlassTint { h: number; k: number }
export const DEFAULT_TINT: GlassTint = { h: 280, k: 1 };
export const TINT_KEY = "trail-pilot-glass";

/** Teintes proposées. La première est celle d'origine. */
export const TINTS: { id: string; label: string; tint: GlassTint }[] = [
  { id: "indigo", label: "Indigo", tint: { h: 280, k: 1 } },
  { id: "ocean", label: "Océan", tint: { h: 248, k: 1 } },
  { id: "lagon", label: "Lagon", tint: { h: 205, k: 0.8 } },
  { id: "foret", label: "Forêt", tint: { h: 155, k: 0.7 } },
  { id: "aurore", label: "Aurore", tint: { h: 330, k: 1 } },
  { id: "braise", label: "Braise", tint: { h: 28, k: 0.85 } },
  { id: "ardoise", label: "Ardoise", tint: { h: 265, k: 0.12 } },
];

/**
 * Jetons de couleur : luminosité, saturation et décalage de teinte, relevés sur la palette indigo d'origine
 * (#0b0b2b, #2a1f6e, #3b2fa6, #5b4bd6, #b48cff, #4f5bff, #3d46e8…).
 */
const TOKENS: [name: string, L: number, C: number, dh: number][] = [
  ["--g-0", 0.174, 0.063, -2], // fond le plus sombre
  ["--g-1", 0.309, 0.13, 2], // milieu du dégradé
  ["--g-2", 0.403, 0.181, -1], // bas du dégradé
  ["--g-3", 0.514, 0.204, 2], // bas du bloc « Ma sortie du jour »
  ["--g-ink", 0.248, 0.103, 0], // texte sombre sur fond blanc
  ["--g-glow", 0.725, 0.165, 18], // taches lumineuses
  ["--g-blue", 0.566, 0.239, -7], // seconde tache
  ["--g-acc", 0.503, 0.238, -8], // boutons et choix
  ["--g-acc-b", 0.534, 0.229, -7], // fin du dégradé des boutons
  ["--g-acc-2", 0.621, 0.206, -4], // halo des boutons
];
export const TOKEN_NAMES = TOKENS.map((t) => t[0]);

function toLinear(L: number, C: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
const encode = (v: number) => { const c = Math.min(1, Math.max(0, v)); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hex = (rgb: number[]) => "#" + rgb.map((v) => Math.round(encode(v) * 255).toString(16).padStart(2, "0")).join("");

/** Couleur OKLCH vers hexadécimal sRGB, en réduisant la saturation jusqu'à entrer dans l'écran. */
export function oklchHex(L: number, C: number, h: number): string {
  let rgb = toLinear(L, C, h);
  if (!inGamut(rgb)) {
    let lo = 0, hi = C;
    for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (inGamut(toLinear(L, mid, h))) lo = mid; else hi = mid; }
    rgb = toLinear(L, lo, h);
  }
  return hex(rgb);
}

/** Teinte ramenée entre 0 et 360°, intensité entre 0 et 1. */
export const cleanTint = (t: Partial<GlassTint> | null | undefined): GlassTint => {
  const h = Number(t?.h), k = Number(t?.k);
  return { h: Number.isFinite(h) ? ((Math.round(h) % 360) + 360) % 360 : DEFAULT_TINT.h, k: Number.isFinite(k) ? Math.min(1, Math.max(0, k)) : DEFAULT_TINT.k };
};

/** Palette complète (nom de variable CSS → couleur). */
export function glassPalette(tint: GlassTint): Record<string, string> {
  const { h, k } = cleanTint(tint);
  return Object.fromEntries(TOKENS.map(([name, L, C, dh]) => [name, oklchHex(L, C * k, h + dh)]));
}

/** Luminance relative WCAG d'une couleur hexadécimale, pour vérifier le contraste. */
export function luminance(hexColor: string): number {
  const n = parseInt(hexColor.slice(1), 16);
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
