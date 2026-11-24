"use client";

import { useCallback, useRef, useState } from "react";
import { usePull } from "./gestures";
import { haptic } from "@/components/haptics";

const THRESHOLD = 72;

/**
 * Tirer pour actualiser (téléphone) : en haut de page, on tire vers le bas ; au-delà du seuil, le relâché lance
 * `onRefresh` (synchro Strava ou rechargement des données). Le témoin change avec l'apparence du site :
 * un arc (Jour, Nuit), une ronde de points (Verre), des courbes de niveau (Topo), une lampe frontale (Frontale).
 */
export default function PullRefresh({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [px, setPx] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false), readyRef = useRef(false);
  const change = useCallback((v: number) => {
    if (busyRef.current) return;
    setPx(v);
    // Petit tic quand on passe le seuil (et quand on revient en deçà, rien).
    if (v >= THRESHOLD && !readyRef.current) { readyRef.current = true; haptic("tap"); }
    else if (v < THRESHOLD) readyRef.current = false;
  }, []);
  const release = useCallback((v: number) => {
    if (busyRef.current) return;
    if (v < THRESHOLD) { setPx(0); return; }
    busyRef.current = true; setBusy(true); setPx(56);
    readyRef.current = false;
    haptic("select");
    onRefresh().finally(() => { busyRef.current = false; setBusy(false); setPx(0); });
  }, [onRefresh]);
  usePull(change, release);

  const p = Math.min(1, px / THRESHOLD);
  const ring = (r: number, k: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 36; i++) {
      const a = (i / 36) * Math.PI * 2, w = 1 + 0.08 * Math.sin(3 * a + k) + 0.05 * Math.sin(5 * a - k);
      pts.push(`${(20 + Math.cos(a) * r * w).toFixed(1)} ${(20 + Math.sin(a) * r * w).toFixed(1)}`);
    }
    return `M${pts.join(" L")}Z`;
  };
  return (
    <div className={`ptr${px > 0 || busy ? " is-on" : ""}${busy ? " is-busy" : ""}${p >= 1 ? " is-ready" : ""}`} aria-hidden={!busy}
      style={{ ["--pull" as string]: `${px}px`, ["--p" as string]: p.toFixed(3) }}>
      <div className="ptr-disc">
        <svg viewBox="0 0 40 40">
          {/* Jour et Nuit : un arc qui se remplit. */}
          <g className="ptr-arc"><circle cx="20" cy="20" r="13" className="ptr-track" /><circle cx="20" cy="20" r="13" pathLength="1" className="ptr-fill" /></g>
          {/* Verre : une ronde de points qui s'allument un à un. */}
          <g className="ptr-dots">{Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2 - Math.PI / 2; return <circle key={i} cx={20 + Math.cos(a) * 13} cy={20 + Math.sin(a) * 13} r="2.1" style={{ ["--i" as string]: i }} />; })}</g>
          {/* Topo : trois courbes de niveau qui se dessinent autour d'un sommet. */}
          <g className="ptr-topo">{[6, 10, 14].map((r, i) => <path key={r} d={ring(r, i * 1.7)} pathLength="1" style={{ ["--i" as string]: i }} />)}<circle cx="20" cy="20" r="1.8" /></g>
          {/* Frontale : la lampe et son faisceau qui s'élargit. */}
          <g className="ptr-lamp"><path className="ptr-beam" d="M14 20 L38 8 L38 32 Z" /><rect x="3" y="15" width="11" height="10" rx="3.2" /><circle cx="8.5" cy="20" r="2" className="ptr-led" /></g>
        </svg>
      </div>
      <span className="ptr-label">{busy ? "Actualisation…" : p >= 1 ? "Relâche pour actualiser" : "Tire pour actualiser"}</span>
    </div>
  );
}
