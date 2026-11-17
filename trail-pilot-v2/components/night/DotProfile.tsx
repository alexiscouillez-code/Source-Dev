"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { dotHeights, fmtKm1, resample } from "@/lib/engine/today-run";

/**
 * Profil d'altitude en grille de points : une colonne par tronçon, d'autant plus haute que l'altitude.
 * Les points du haut de chaque colonne sont les plus lumineux ; le dernier point de la sortie est mis en avant.
 *
 * Interaction : on parcourt le profil du doigt ou à la souris (ou aux flèches du clavier) ; la colonne visée
 * s'allume et grossit, les autres s'estompent, et une étiquette donne le kilomètre et l'altitude.
 * Seulement en mode Verre (`interactive`) ; en Jour et en Nuit, le profil reste une image fixe, comme à l'origine.
 */
export default function DotProfile({ profile, km, cols = 40, rows = 12, label, interactive = false }: { profile: number[]; km: number; cols?: number; rows?: number; label?: string; interactive?: boolean }) {
  const values = resample(profile, cols);
  const heights = dotHeights(values, rows);
  const [hi, setHi] = useState<number | null>(null);
  const G = 10, R = 1.9, W = cols * G, H = rows * G;
  const lo = Math.round(Math.min(...values)), top = Math.round(Math.max(...values));
  const desc = label ?? `Profil d'altitude sur ${fmtKm1(km)} kilomètres, de ${lo} à ${top} mètres d'altitude, arrivée à ${Math.round(values[values.length - 1])} mètres.`;
  const lastC = cols - 1, lastR = heights[lastC] - 1;
  const kmAt = (c: number) => ((c + 0.5) / cols) * km;
  const at = (e: PointerEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); return Math.max(0, Math.min(cols - 1, Math.floor(((e.clientX - r.left) / r.width) * cols))); };
  const key = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "End" ? cols : e.key === "Home" ? -cols : 0;
    if (!step) { if (e.key === "Escape") setHi(null); return; }
    e.preventDefault();
    setHi((h) => Math.max(0, Math.min(cols - 1, (h ?? (step > 0 ? -1 : cols)) + step)));
  };
  const text = hi != null ? `${fmtKm1(kmAt(hi))} km, ${Math.round(values[hi])} mètres` : desc;
  return (
    <figure className={`dotprofile${interactive ? " is-live" : ""}${hi != null && interactive ? " is-scrub" : ""}`}>
      <div className="dp-plot">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax meet"
        {...(interactive ? {
          tabIndex: 0, role: "slider", "aria-label": desc, "aria-valuemin": 0, "aria-valuemax": cols - 1, "aria-valuenow": hi ?? cols - 1, "aria-valuetext": text,
          onPointerDown: (e: PointerEvent<SVGSVGElement>) => setHi(at(e)),
          onPointerMove: (e: PointerEvent<SVGSVGElement>) => { if (e.pointerType === "mouse" || e.buttons) setHi(at(e)); },
          onPointerLeave: (e: PointerEvent<SVGSVGElement>) => { if (e.pointerType === "mouse") setHi(null); },
          onKeyDown: key, onBlur: () => setHi(null), style: { touchAction: "pan-y" },
        } : { role: "img", "aria-label": desc })}>
        <g className="dp-all">
          {heights.map((h, c) => Array.from({ length: h }, (_, r) => {
            // r = 0 en bas de la colonne. Le sommet de la colonne est le plus lumineux.
            const peak = r === h - 1;
            const op = peak ? 0.95 : 0.22 + 0.5 * (r / Math.max(1, h - 1));
            // --c / --r : colonne et rangée, pour faire monter le profil colonne par colonne (voir night.css).
            return <circle key={`${c}-${r}`} className="dp-dot" style={{ ["--c" as string]: c, ["--r" as string]: r }} cx={c * G + G / 2} cy={H - (r * G + G / 2)} r={R} fill="currentColor" opacity={op.toFixed(2)} />;
          }))}
          <circle className="dp-glow" cx={lastC * G + G / 2} cy={H - (lastR * G + G / 2)} r={6} fill="currentColor" opacity="0.25" />
          <circle className="dp-last" cx={lastC * G + G / 2} cy={H - (lastR * G + G / 2)} r={3.2} fill="currentColor" />
        </g>
        {interactive && hi != null && (
          // Colonne visée : ses points s'allument (rangée par rangée), un repère pointillé monte jusqu'en haut.
          <g className="dp-hi" key={hi}>
            {Array.from({ length: rows }, (_, r) => r < heights[hi]
              ? <circle key={r} className="dp-hi-dot" style={{ ["--r" as string]: r }} cx={hi * G + G / 2} cy={H - (r * G + G / 2)} r={r === heights[hi] - 1 ? 3.6 : 2.6} fill="currentColor" />
              : <circle key={r} className="dp-hi-guide" style={{ ["--r" as string]: r }} cx={hi * G + G / 2} cy={H - (r * G + G / 2)} r={1} fill="currentColor" opacity="0.5" />)}
          </g>
        )}
      </svg>
      {interactive && hi != null && (
        <span className="dp-tip" aria-hidden="true" style={{ left: `${((hi + 0.5) / cols) * 100}%`, bottom: `${(heights[hi] / rows) * 100}%` }}>
          <b>{Math.round(values[hi])} m</b>{fmtKm1(kmAt(hi))} km
        </span>
      )}
      </div>
      <figcaption className="dp-axis" aria-hidden="true"><span>0 KM</span><span>{fmtKm1(km)} KM</span></figcaption>
    </figure>
  );
}
