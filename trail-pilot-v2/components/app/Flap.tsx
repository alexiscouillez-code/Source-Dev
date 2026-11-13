"use client";

import { useEffect, useState } from "react";
import { motionOk } from "./motion";

/** Compte à rebours façon tableau d’affichage : chaque caractère bascule sur sa propre tuile, et les chiffres défilent jusqu’à la valeur à l’ouverture. */
export default function Flap({ days, className = "" }: { days: number; className?: string }) {
  const [shown, setShown] = useState(days);
  const [rolling, setRolling] = useState(false);
  useEffect(() => {
    if (days <= 0 || !motionOk()) { setShown(days); return; }
    // Le panneau part d’un peu plus haut et descend jusqu’au nombre de jours, comme un panneau de gare.
    const from = days + Math.min(40, Math.max(9, Math.round(days * 0.25))), steps = 12;
    let k = 0, t = 0;
    setRolling(true); setShown(from);
    const tick = () => {
      k++;
      const eased = 1 - Math.pow(1 - k / steps, 2);
      setShown(Math.round(from - (from - days) * eased));
      if (k < steps) t = window.setTimeout(tick, 45 + k * 9); else { setShown(days); window.setTimeout(() => setRolling(false), 400); }
    };
    t = window.setTimeout(tick, 350);
    return () => window.clearTimeout(t);
  }, [days]);
  const text = shown > 0 ? String(shown) : "";
  return (
    <span className={`flap ${rolling ? "rolling" : ""} ${className}`} role="text" aria-label={days > 0 ? `J moins ${days}` : "Jour J"}>
      <span className="flap-pre" aria-hidden="true">{days > 0 ? "J-" : "Jour J"}</span>
      {[...text].map((c, i) => <span key={`${i}${c}`} className="flap-d" aria-hidden="true" style={{ ["--i" as string]: i }}>{c}</span>)}
    </span>
  );
}
