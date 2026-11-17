"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";

/**
 * Pourcentage en grille de 10 × 10 points : un point plein par pour-cent atteint, des points creux pour le reste.
 * Au-delà de 100 %, la grille est pleine et c'est le texte qui donne la valeur.
 *
 * Interaction : chaque point vaut 1 % de la semaine prévue. On les parcourt du doigt, à la souris ou aux flèches ;
 * `onPick` reçoit le pourcentage visé (null en sortant) et les points jusqu'à lui s'allument. Un toucher fait
 * partir une onde de points depuis le point touché.
 */
export default function DotGrid({ pct, label, onPick }: { pct: number; label: string; onPick?: (n: number | null) => void }) {
  const filled = Math.max(0, Math.min(100, Math.round(pct)));
  const G = 10, R = 3;
  const [hi, setHi] = useState<number | null>(null);
  const [wave, setWave] = useState<{ k: number; c: number; r: number } | null>(null);
  const pos = (i: number) => ({ col: i % 10, row: 9 - Math.floor(i / 10) });
  const pick = (n: number | null) => { setHi(n); onPick?.(n == null ? null : n + 1); };
  const at = (e: PointerEvent<SVGSVGElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const col = Math.max(0, Math.min(9, Math.floor(((e.clientX - b.left) / b.width) * 10)));
    const row = Math.max(0, Math.min(9, Math.floor(((e.clientY - b.top) / b.height) * 10)));
    return (9 - row) * 10 + col;
  };
  const key = (e: KeyboardEvent<SVGSVGElement>) => {
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: 10, ArrowDown: -10 }[e.key];
    if (e.key === "Escape") { pick(null); return; }
    if (!d) return;
    e.preventDefault();
    pick(Math.max(0, Math.min(99, (hi ?? Math.max(0, filled - 1)) + d)));
  };
  return (
    <svg className={`dotgrid${hi != null ? " is-scrub" : ""}`} viewBox={`0 0 ${G * 10} ${G * 10}`} tabIndex={0}
      role="slider" aria-label={label} aria-valuemin={1} aria-valuemax={100} aria-valuenow={hi != null ? hi + 1 : filled} aria-valuetext={hi != null ? `${hi + 1} % de la semaine prévue` : label}
      onPointerDown={(e) => {
        const i = at(e), p = pos(i), k = Date.now();
        pick(i); setWave({ k, c: p.col, r: p.row });
        window.setTimeout(() => setWave((w) => (w?.k === k ? null : w)), 1300);
      }}
      onPointerMove={(e) => { if (e.pointerType === "mouse" || e.buttons) pick(at(e)); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") pick(null); }} onBlur={() => pick(null)} onKeyDown={key}
      style={{ touchAction: "pan-y" }}>
      <g className="dg-all">
        {Array.from({ length: 100 }, (_, i) => {
          // Remplissage ligne par ligne en partant du bas, de gauche à droite.
          const { row, col } = pos(i), on = i < filled;
          // --i : ordre de remplissage, pour allumer les points un à un (voir night.css).
          const st = { ["--i" as string]: i };
          return on
            ? <circle key={i} className="dg-on" style={st} cx={col * G + G / 2} cy={row * G + G / 2} r={R} fill="#fff" />
            : <circle key={i} className="dg-off" style={st} cx={col * G + G / 2} cy={row * G + G / 2} r={R - 0.6} fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.1" />;
        })}
      </g>
      {hi != null && (
        // Points jusqu'au pourcentage visé : allumés ; le point visé est cerclé.
        <g className="dg-hi">
          {Array.from({ length: hi + 1 }, (_, i) => { const { row, col } = pos(i); return <circle key={i} cx={col * G + G / 2} cy={row * G + G / 2} r={R} fill="#fff" />; })}
          <circle className="dg-ring" cx={pos(hi).col * G + G / 2} cy={pos(hi).row * G + G / 2} r={R + 2.2} fill="none" stroke="#fff" strokeWidth="1.2" />
        </g>
      )}
      {wave && (
        <g className="dg-wave" key={wave.k} aria-hidden="true">
          {Array.from({ length: 100 }, (_, i) => {
            const { row, col } = pos(i), d = Math.hypot(col - wave.c, row - wave.r);
            return <circle key={i} style={{ ["--d" as string]: d.toFixed(2) }} cx={col * G + G / 2} cy={row * G + G / 2} r={R} fill="none" stroke="#fff" strokeWidth="1" />;
          })}
        </g>
      )}
    </svg>
  );
}
