"use client";

import { currentAppearance, type Appearance } from "@/components/appearance";
import { fmtDur, fmtKm, fmtNum, SPORT_LABEL } from "./client";
import { resample } from "@/lib/engine/today-run";

/**
 * Images au format story (1080 × 1920) aux couleurs de l'apparence active : une sortie, ou le bilan du mois.
 * Dessinées dans le navigateur (canvas), partagées avec la feuille de partage du téléphone (ou téléchargées).
 */
export interface StoryTheme { kind: Appearance; bg: [string, string]; fg: string; mute: string; acc: string; acc2: string; line: string }

export function storyTheme(): StoryTheme {
  const kind = currentAppearance();
  const css = getComputedStyle(document.documentElement);
  const v = (n: string, f: string) => css.getPropertyValue(n).trim() || f;
  if (kind === "glass") return { kind, bg: [v("--g-0", "#0d0b2a"), v("--g-2", "#2a1f6e")], fg: "#ffffff", mute: "rgba(255,255,255,.72)", acc: v("--g-glow", "#b48cff"), acc2: v("--g-acc-2", "#6a72ff"), line: "rgba(255,255,255,.18)" };
  const ink = v("--ink", "#0b0f14"), ink3 = v("--ink-3", "#1b2631");
  if (kind === "light") return { kind, bg: ["#f7f3ec", "#e9e0d0"], fg: "#181c21", mute: "#59626c", acc: v("--ember", "#e4561c"), acc2: "#f0a020", line: "rgba(24,28,33,.14)" };
  if (kind === "topo") return { kind, bg: [ink, ink3], fg: v("--snow", "#2a2216"), mute: v("--mute", "#5f523a"), acc: v("--ember", "#d9581f"), acc2: "#4f7a3a", line: "rgba(138,90,43,.28)" };
  if (kind === "frontale") return { kind, bg: ["#000000", "#140302"], fg: v("--snow", "#ff8a64"), mute: v("--mute", "#ec6e4a"), acc: v("--ember", "#ff3d1f"), acc2: "#ff9a3d", line: "rgba(255,61,31,.22)" };
  return { kind, bg: [ink, ink3], fg: v("--snow", "#f4efe6"), mute: v("--mute", "#8d99a5"), acc: v("--ember", "#ff6a2b"), acc2: "#ffb400", line: "rgba(244,239,230,.14)" };
}

const W = 1080, H = 1920, X0 = 90;
const fontOf = () => getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

function canvas() {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  return { c, g: c.getContext("2d")! };
}
const blobOf = (c: HTMLCanvasElement) => new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error("image"))), "image/png"));

/** Fond et décor propres à chaque apparence : trame de points (Verre), courbes de niveau (Topo), faisceau (Frontale), halo (Jour, Nuit). */
function backdrop(g: CanvasRenderingContext2D, t: StoryTheme) {
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, t.bg[0]); bg.addColorStop(1, t.bg[1]);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.save();
  if (t.kind === "glass") {
    // Trame en demi-teinte : les points grossissent vers la lumière (en haut à droite).
    for (let y = 18; y < H; y += 36) for (let x = 18; x < W; x += 36) {
      const d = Math.hypot(x - W * 0.85, y - H * 0.12) / 1400;
      const r = Math.max(0, 6.5 * (1 - d));
      if (r < 0.6) continue;
      g.globalAlpha = 0.08 + 0.32 * (1 - d); g.fillStyle = t.acc;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  } else if (t.kind === "topo") {
    // Courbes de niveau autour d'un sommet, comme sur une carte de randonnée.
    g.strokeStyle = t.line; g.lineWidth = 3;
    for (let k = 1; k <= 14; k++) {
      g.beginPath();
      for (let i = 0; i <= 120; i++) {
        const a = (i / 120) * Math.PI * 2, w = 1 + 0.08 * Math.sin(3 * a + k) + 0.05 * Math.sin(5 * a - k * 0.7);
        const x = W * 0.78 + Math.cos(a) * k * 64 * w, y = H * 0.2 + Math.sin(a) * k * 52 * w;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.lineWidth = k % 4 === 0 ? 5 : 2.5; g.stroke();
    }
  } else if (t.kind === "frontale") {
    // Faisceau de la lampe depuis le coin haut gauche.
    const beam = g.createRadialGradient(0, 0, 40, 0, 0, 1500);
    beam.addColorStop(0, "rgba(255,90,40,.42)"); beam.addColorStop(1, "rgba(255,40,20,0)");
    g.fillStyle = beam; g.beginPath(); g.moveTo(0, 0); g.lineTo(W * 1.1, H * 0.18); g.lineTo(W * 0.55, H * 0.78); g.closePath(); g.fill();
  } else {
    const glow = g.createRadialGradient(W * 0.86, H * 0.1, 0, W * 0.86, H * 0.1, 760);
    glow.addColorStop(0, t.kind === "light" ? "rgba(228,86,28,.18)" : "rgba(255,106,43,.36)"); glow.addColorStop(1, "rgba(255,106,43,0)");
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
  }
  g.restore();
}

function header(g: CanvasRenderingContext2D, t: StoryTheme, eyebrow: string) {
  const font = fontOf();
  // Petite montagne du logo, puis le nom en capitales espacées.
  g.strokeStyle = t.acc; g.lineWidth = 7; g.lineJoin = "round"; g.lineCap = "round";
  g.beginPath(); g.moveTo(X0, 172); g.lineTo(X0 + 26, 132); g.lineTo(X0 + 42, 154); g.lineTo(X0 + 58, 124); g.lineTo(X0 + 86, 172); g.stroke();
  g.fillStyle = t.fg; g.font = `700 36px ${font}`; g.letterSpacing = "9px"; g.fillText("TRAIL PILOT", X0 + 110, 168);
  g.letterSpacing = "6px"; g.fillStyle = t.acc; g.font = `600 30px ${MONO}`; g.fillText(eyebrow.toUpperCase(), X0, 268);
  g.letterSpacing = "0px";
}
function footer(g: CanvasRenderingContext2D, t: StoryTheme) {
  g.fillStyle = t.mute; g.font = `500 30px ${MONO}`; g.globalAlpha = 0.8; g.fillText("trail-pilot-v2.vercel.app", X0, H - 80); g.globalAlpha = 1;
}
/** Texte sur plusieurs lignes (au plus `max`), coupé aux mots. */
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lh: number, max = 2) {
  const words = text.split(/\s+/), lines: string[] = [];
  let cur = "";
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (g.measureText(t).width > width && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  const out = lines.slice(0, max);
  if (lines.length > max) out[max - 1] = `${out[max - 1].replace(/\s*\S*$/, "")}…`;
  out.forEach((l, i) => g.fillText(l, x, y + i * lh));
  return out.length;
}
/** Profil en grille de points (la charte du site) : une colonne par tronçon, le sommet de chaque colonne plus lumineux. */
function dotProfile(g: CanvasRenderingContext2D, t: StoryTheme, profile: number[], x: number, y: number, w: number, h: number) {
  const cols = 34, rows = 15, gx = w / cols, gy = h / rows, r = Math.min(gx, gy) * 0.24;
  const v = resample(profile, cols), lo = Math.min(...v), hi = Math.max(...v), span = Math.max(1, hi - lo);
  v.forEach((z, c) => {
    const n = 1 + Math.round(((z - lo) / span) * (rows - 1));
    for (let k = 0; k < n; k++) {
      const peak = k === n - 1;
      g.globalAlpha = peak ? 1 : 0.2 + 0.5 * (k / Math.max(1, n - 1));
      g.fillStyle = peak ? t.acc : t.fg;
      g.beginPath(); g.arc(x + c * gx + gx / 2, y + h - (k * gy + gy / 2), peak ? r * 1.25 : r, 0, Math.PI * 2); g.fill();
    }
  });
  g.globalAlpha = 1;
  g.fillStyle = t.mute; g.font = `500 28px ${MONO}`;
  g.fillText(`${Math.round(lo)} m`, x, y + h + 52);
  const top = `${Math.round(hi)} m`; g.fillText(top, x + w - g.measureText(top).width, y + h + 52);
}

/** Partage une image (feuille de partage du téléphone) ou la télécharge. */
export async function shareImage(blob: Blob, filename: string, title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return "shared"; } catch { return "cancelled"; }
  }
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}

// ---------- Une sortie ----------
export interface RunStory { name: string; date: string; dateLabel: string; sport: string; km: number | null; gain: number | null; minutes: number; paceSec: number | null; profile: number[] | null; avgHr: number | null }
export const paceText = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export async function runStory(r: RunStory): Promise<Blob> {
  const { c, g } = canvas(), t = storyTheme(), font = fontOf();
  backdrop(g, t);
  header(g, t, `${SPORT_LABEL[r.sport] ?? "Sortie"} · ${r.dateLabel}`);
  g.fillStyle = t.fg; g.font = `700 84px ${font}`;
  const lines = wrap(g, r.name, X0, 380, W - X0 * 2, 96);
  // Distance en très gros, puis D+, durée et allure.
  let y = 380 + lines * 96 + 260;
  const big = r.km != null ? fmtKm(r.km) : fmtDur(r.minutes);
  g.font = `800 300px ${font}`; g.fillStyle = t.fg; g.fillText(big, X0 - 8, y);
  if (r.km != null) { const bw = measure(g, big, `800 300px ${font}`); g.font = `600 64px ${font}`; g.fillStyle = t.mute; g.fillText("km", X0 + bw + 18, y); }
  y += 150;
  const stats: [string, string][] = [];
  if (r.gain) stats.push([fmtNum(r.gain), "m D+"]);
  if (r.km != null) stats.push([fmtDur(r.minutes), "durée"]);
  if (r.paceSec) stats.push([paceText(r.paceSec), "/km"]);
  else if (r.avgHr) stats.push([String(Math.round(r.avgHr)), "bpm"]);
  const colW = (W - X0 * 2) / Math.max(1, stats.length);
  stats.forEach(([v, u], i) => {
    const x = X0 + i * colW;
    g.fillStyle = t.fg; g.font = `700 76px ${font}`; g.fillText(v, x, y);
    g.fillStyle = t.mute; g.font = `500 32px ${MONO}`; g.fillText(u.toUpperCase(), x, y + 52);
  });
  // Trait de séparation pointillé.
  g.fillStyle = t.line;
  for (let x = X0; x < W - X0; x += 18) { g.beginPath(); g.arc(x, y + 120, 3, 0, Math.PI * 2); g.fill(); }
  if (r.profile && r.profile.length > 2) dotProfile(g, t, r.profile, X0, y + 200, W - X0 * 2, Math.min(470, H - (y + 200) - 230));
  footer(g, t);
  return blobOf(c);
}
const measure = (g: CanvasRenderingContext2D, text: string, font: string) => { const f = g.font; g.font = font; const w = g.measureText(text).width; g.font = f; return w; };

// ---------- Le bilan du mois ----------
export interface RecapStory { label: string; partial: boolean; km: number; gain: number; minutes: number; count: number; activeDays: number; streak: number;
  days: { date: string; minutes: number }[]; longest: string | null; climb: string | null; form: { start: number; end: number } | null }

export async function recapStory(r: RecapStory): Promise<Blob> {
  const { c, g } = canvas(), t = storyTheme(), font = fontOf();
  backdrop(g, t);
  header(g, t, r.partial ? `Mon mois · jusqu’ici` : "Mon mois");
  g.fillStyle = t.fg; g.font = `700 96px ${font}`;
  const label = r.label.charAt(0).toUpperCase() + r.label.slice(1);
  g.fillText(label, X0, 400);
  g.font = `800 260px ${font}`; g.fillText(fmtKm(r.km), X0 - 8, 690);
  g.font = `600 64px ${font}`; g.fillStyle = t.mute; g.fillText("km", X0 + measure(g, fmtKm(r.km), `800 260px ${font}`) + 22, 690);
  const stats: [string, string][] = [[fmtNum(r.gain), "m D+"], [fmtDur(r.minutes), "d’effort"], [String(r.count), r.count > 1 ? "sorties" : "sortie"]];
  const colW = (W - X0 * 2) / 3;
  stats.forEach(([v, u], i) => {
    const x = X0 + i * colW;
    g.fillStyle = t.fg; g.font = `700 70px ${font}`; g.fillText(v, x, 830);
    g.fillStyle = t.mute; g.font = `500 30px ${MONO}`; g.fillText(u.toUpperCase(), x, 880);
  });
  // Calendrier du mois en points : plus la journée a été longue, plus le point est gros.
  const first = new Date(`${r.days[0]?.date ?? "2026-01-01"}T12:00:00Z`), lead = (first.getUTCDay() + 6) % 7;
  const max = Math.max(30, ...r.days.map((d) => d.minutes));
  const cw = (W - X0 * 2) / 7, top = 1010;
  ["L", "M", "M", "J", "V", "S", "D"].forEach((d, i) => { g.fillStyle = t.mute; g.font = `600 28px ${MONO}`; g.textAlign = "center"; g.fillText(d, X0 + i * cw + cw / 2, top); });
  r.days.forEach((d, i) => {
    const k = lead + i, col = k % 7, row = Math.floor(k / 7);
    const x = X0 + col * cw + cw / 2, y = top + 70 + row * 92;
    if (d.minutes > 0) {
      const rad = 12 + 26 * Math.sqrt(d.minutes / max);
      g.fillStyle = t.acc; g.globalAlpha = 0.95; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    } else {
      g.strokeStyle = t.line; g.lineWidth = 3; g.globalAlpha = 1; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.stroke();
    }
    g.globalAlpha = 1;
  });
  g.textAlign = "left";
  let y = top + 70 + 6 * 92 + 40;
  const facts = [
    `${r.activeDays} jour${r.activeDays > 1 ? "s" : ""} actif${r.activeDays > 1 ? "s" : ""}${r.streak > 1 ? ` · série de ${r.streak} jours` : ""}`,
    r.longest, r.climb,
    r.form && r.form.end !== r.form.start ? `Forme de fond ${r.form.end > r.form.start ? "+" : ""}${r.form.end - r.form.start} (${r.form.start} → ${r.form.end})` : null,
  ].filter((x): x is string => !!x);
  g.font = `500 40px ${font}`;
  for (const f of facts.slice(0, 4)) {
    g.fillStyle = t.acc; g.beginPath(); g.arc(X0 + 8, y - 13, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = t.fg; wrap(g, f, X0 + 36, y, W - X0 * 2 - 36, 50, 1); y += 70;
  }
  footer(g, t);
  return blobOf(c);
}
