"use client";

import { useRef, useState, type PointerEvent } from "react";
import GlassCard from "./GlassCard";
import { fmtKm1 } from "@/lib/engine/today-run";

/**
 * Carte radar (variante accent) : cercles concentriques, toi au centre, la cible placée dans sa direction et reliée en pointillés.
 * La distance au centre suit une échelle racine (proche = près du centre, 20 km et plus = bord).
 *
 * Interaction : un faisceau suit le doigt ou la souris autour du centre ; quand il passe sur la cible, elle
 * s'accroche (onde plus forte) et la direction s'affiche. Un glissé ne déclenche pas l'ouverture des terrains.
 * Seulement en mode Verre (`interactive`) ; en Jour et en Nuit, la carte reste celle d'origine.
 */
const DIRS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
const dirOf = (deg: number) => DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
export default function RadarCard({ title, name, km, bearing, from, example, onOpen, interactive = false }: { title: string; name: string; km: number; bearing: number; from: string; example?: boolean; onOpen?: () => void; interactive?: boolean }) {
  const S = 100, C = S / 2, Rmax = 40;
  const r = Math.min(Rmax, Math.max(10, Math.sqrt(Math.min(km, 20) / 20) * Rmax));
  const a = ((bearing - 90) * Math.PI) / 180;
  const tx = C + r * Math.cos(a), ty = C + r * Math.sin(a);
  const label = `${title} : ${name}, à ${fmtKm1(km)} kilomètres de ${from}${example ? " (exemple)" : ""}, direction ${dirOf(bearing)}.`;
  const [beam, setBeam] = useState<number | null>(null);
  const moved = useRef(0), start = useRef<[number, number] | null>(null);
  const aim = (e: PointerEvent<HTMLElement>) => {
    const svg = e.currentTarget.querySelector("svg.radar-dots");
    if (!svg) return;
    const b = svg.getBoundingClientRect(), dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height / 2);
    setBeam(((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360);
    if (start.current) moved.current = Math.max(moved.current, Math.hypot(e.clientX - start.current[0], e.clientY - start.current[1]));
  };
  const diff = beam == null ? 180 : Math.abs((((beam - bearing) % 360) + 540) % 360 - 180);
  const locked = diff < 20;
  const ba = beam == null ? 0 : ((beam - 90) * Math.PI) / 180;
  const handlers = !interactive ? {} : {
    onPointerMove: (e: PointerEvent<HTMLElement>) => { if (e.pointerType === "mouse" || e.buttons) aim(e); },
    onPointerDown: (e: PointerEvent<HTMLElement>) => { start.current = [e.clientX, e.clientY]; moved.current = 0; aim(e); },
    onPointerLeave: () => setBeam(null),
    onPointerUp: (e: PointerEvent<HTMLElement>) => { start.current = null; if (e.pointerType !== "mouse") window.setTimeout(() => setBeam(null), 900); },
  };
  const body = (
    <>
      <span className="g-row"><span className="g-top">{title}</span>{example && <span className="g-example">Exemple</span>}</span>
      <svg className="radar-dots" viewBox={`0 0 ${S} ${S}`} role="img" aria-label={label}>
        {[14, 27, 40].map((rr, i) => <circle key={rr} className="rd-ring" style={{ ["--i" as string]: i }} cx={C} cy={C} r={rr} fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="0.6" />)}
        <circle className="rd-sweep" cx={C} cy={C} r={40} fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="0.8" />
        <line className="rd-line" x1={C} y1={C} x2={tx} y2={ty} stroke="#fff" strokeOpacity="0.85" strokeWidth="1" strokeDasharray="2 2.4" />
        {beam != null && (
          // Faisceau : une ligne de points du centre vers le bord, dans la direction du pointeur.
          <g className="rd-beam" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => { const d = 6 + i * 4.3; return <circle key={i} cx={C + d * Math.cos(ba)} cy={C + d * Math.sin(ba)} r={1.5 - i * 0.07} fill="#fff" opacity={(0.95 - i * 0.08).toFixed(2)} />; })}
          </g>
        )}
        <circle className="rd-center" cx={C} cy={C} r={2.6} fill="#fff" />
        {/* La cible part du centre et glisse jusqu'à sa place (--dx / --dy : décalage depuis le centre). */}
        <g className={`rd-target${locked ? " is-locked" : ""}`} style={{ ["--dx" as string]: `${(C - tx).toFixed(1)}px`, ["--dy" as string]: `${(C - ty).toFixed(1)}px` }}>
          <circle className="rd-ping" cx={tx} cy={ty} r={6} fill="#fff" opacity="0.25" />
          <circle cx={tx} cy={ty} r={3.4} fill="#fff" />
        </g>
      </svg>
      <span className="g-num g-num-sm" aria-hidden="true">{fmtKm1(km)}<small> KM</small></span>
      <span className="g-sub" aria-hidden="true">{name}</span>
      {interactive && <span className={`rd-dir${beam != null ? " on" : ""}`} aria-hidden="true">{locked ? `Cap ${dirOf(bearing)} · trouvé` : beam != null ? `Cap ${dirOf(beam)}` : `Cap ${dirOf(bearing)}`}</span>}
    </>
  );
  return onOpen
    ? <GlassCard as="button" type="button" accent className="radar-card" {...handlers}
        onClick={() => { if (moved.current < 8) onOpen(); }} aria-label={`${label} Ouvrir les terrains.`}>{body}</GlassCard>
    : <GlassCard accent className="radar-card" {...handlers}>{body}</GlassCard>;
}
