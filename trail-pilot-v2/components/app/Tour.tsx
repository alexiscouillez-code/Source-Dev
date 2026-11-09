"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import type { Tab } from "./AppShell";

const KEY = "tp-tour-v1";
const STEPS: { tab: Tab; title: string; text: string }[] = [
  { tab: "today", title: "Chaque soir, ton check-in", text: "Dix secondes pour dire comment tu te sens : Trail Pilot décide si demain on fait la séance prévue, si on allège ou si on récupère." },
  { tab: "plan", title: "Ton plan jusqu’au jour J", text: "Les semaines se recalculent avec ta forme. Maintiens une séance pour la glisser à un autre jour, et touche-la pour voir le détail ou l’envoyer sur ta montre." },
  { tab: "terrains", title: "Où courir", text: "Boucles à la bonne distance, côtes, descentes, pistes, escaliers et points d’eau autour de toi, prêts à télécharger en GPX." },
  { tab: "analysis", title: "Ta progression", text: "Charge, VO2max, volume mois par mois et records sur tes boucles habituelles. Le bilan de la semaine arrive chaque dimanche soir." },
];

/** Visite guidée en 4 étapes, une seule fois par appareil. */
export default function Tour({ go }: { go: (t: Tab) => void }) {
  const [i, setI] = useState<number | null>(null);
  const [box, setBox] = useState<DOMRect | null>(null);
  useEffect(() => { try { if (!localStorage.getItem(KEY)) setI(0); } catch { /* stockage indisponible */ } }, []);
  useLayoutEffect(() => {
    if (i == null) return;
    const place = () => {
      const els = [...document.querySelectorAll<HTMLElement>(`[data-tab="${STEPS[i].tab}"]`)].filter((e) => e.offsetParent !== null);
      setBox(els[0]?.getBoundingClientRect() ?? null);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [i]);
  if (i == null) return null;
  const end = () => { try { localStorage.setItem(KEY, "1"); } catch { /* rien */ } setI(null); go("today"); };
  const next = () => { if (i + 1 >= STEPS.length) return end(); go(STEPS[i + 1].tab); setI(i + 1); };
  const s = STEPS[i];
  const below = box ? box.top < window.innerHeight / 2 : true;
  const style: React.CSSProperties = box
    ? { left: Math.max(12, Math.min(window.innerWidth - 332, box.left + box.width / 2 - 160)), ...(below ? { top: box.bottom + 14 } : { bottom: window.innerHeight - box.top + 14 }) }
    : { left: "50%", top: "40%", transform: "translateX(-50%)" };
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-t">
      {box && <div className="tour-spot" style={{ left: box.left - 6, top: box.top - 6, width: box.width + 12, height: box.height + 12 }} />}
      <div className={`tour-card ${below ? "below" : "above"}`} style={style} key={i}>
        <span className="eyebrow">{i + 1} / {STEPS.length}</span>
        <b id="tour-t">{s.title}</b>
        <p>{s.text}</p>
        <div className="row between">
          <button className="link small" onClick={end}>Passer</button>
          <div className="tour-dots" aria-hidden="true">{STEPS.map((_, k) => <i key={k} className={k === i ? "on" : ""} />)}</div>
          <button className="btn sm" onClick={next} autoFocus>{i + 1 >= STEPS.length ? "C’est parti" : "Suivant"}</button>
        </div>
      </div>
    </div>
  );
}
