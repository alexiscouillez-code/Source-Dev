"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Tab } from "./AppShell";

const KEY = "tp-tour-v1";
const STEPS: { tab: Tab; title: string; text: string }[] = [
  { tab: "today", title: "Chaque soir, ton check-in", text: "Dix secondes pour dire comment tu te sens : Trail Pilot décide si demain on fait la séance prévue, si on allège ou si on récupère." },
  { tab: "plan", title: "Ton plan jusqu’au jour J", text: "Les semaines se recalculent avec ta forme. Maintiens une séance pour la glisser à un autre jour, touche-la pour voir le détail ou l’envoyer sur ta montre." },
  { tab: "terrains", title: "Où courir", text: "Boucles à la bonne distance, côtes, descentes, pistes et points d’eau autour de toi, prêts à télécharger en GPX." },
  { tab: "analysis", title: "Ta progression", text: "Charge, VO2max, volume mois par mois et records. Le bilan de la semaine arrive chaque dimanche soir." },
];
const GAP = 14, PAD = 6;

/** Visite guidée en 4 étapes, une seule fois par appareil. L’onglet concerné reste éclairé, le reste est voilé. */
export default function Tour({ go }: { go: (t: Tab) => void }) {
  const [i, setI] = useState<number | null>(null);
  const [box, setBox] = useState<DOMRect | null>(null);
  const [cardH, setCardH] = useState(220);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { if (!localStorage.getItem(KEY)) { window.scrollTo({ top: 0 }); setI(0); } } catch { /* stockage indisponible */ }
  }, []);

  // Position de l’onglet, remesurée après la transition de page, au redimensionnement et au défilement.
  useLayoutEffect(() => {
    if (i == null) return;
    const place = () => {
      const el = [...document.querySelectorAll<HTMLElement>(`[data-tab="${STEPS[i].tab}"]`)].find((e) => e.offsetParent !== null);
      setBox(el?.getBoundingClientRect() ?? null);
    };
    place();
    const t1 = window.setTimeout(place, 120), t2 = window.setTimeout(place, 520);
    window.addEventListener("resize", place); window.addEventListener("scroll", place, { passive: true });
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener("resize", place); window.removeEventListener("scroll", place); };
  }, [i]);
  useLayoutEffect(() => { if (card.current) setCardH(card.current.offsetHeight); }, [i, box]);

  const end = () => { try { localStorage.setItem(KEY, "1"); } catch { /* rien */ } setI(null); go("today"); };
  useEffect(() => {
    if (i == null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") end(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (i == null) return null;
  const next = () => { if (i + 1 >= STEPS.length) return end(); go(STEPS[i + 1].tab); setI(i + 1); };
  const back = () => { if (i === 0) return; go(STEPS[i - 1].tab); setI(i - 1); };
  const s = STEPS[i];

  // Placement : à droite de l’onglet dans la barre latérale (ordinateur), au-dessus ou en dessous sinon.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024, vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const W = Math.min(340, vw - 24);
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  let place: "side" | "above" | "below" = "below", left = (vw - W) / 2, top = vh * 0.3, arrow = W / 2;
  if (box) {
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    if (box.right + GAP + W < vw && box.width < vw * 0.3 && box.height < 90 && box.left < vw * 0.25 && box.bottom < vh * 0.8) {
      place = "side"; left = box.right + PAD + GAP; top = clamp(cy - 34, 12, vh - cardH - 12); arrow = clamp(cy - top, 18, cardH - 18);
    } else {
      place = box.top > vh / 2 ? "above" : "below";
      left = clamp(cx - W / 2, 12, vw - W - 12);
      top = place === "above" ? box.top - PAD - GAP - cardH : box.bottom + PAD + GAP;
      arrow = clamp(cx - left, 22, W - 22);
    }
  }

  return (
    <div className={`tour${box ? " has-spot" : ""}`} role="dialog" aria-modal="true" aria-labelledby="tour-t" aria-describedby="tour-p">
      {box && <div className="tour-spot" style={{ left: box.left - PAD, top: box.top - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 }} />}
      <div ref={card} className={`tour-card at-${place}`} style={{ left, top, width: W, ["--arrow" as string]: `${arrow}px` }} key={i}>
        <span className="eyebrow">Découverte · {i + 1} / {STEPS.length}</span>
        <b id="tour-t">{s.title}</b>
        <p id="tour-p">{s.text}</p>
        <div className="tour-foot">
          <div className="tour-dots" aria-hidden="true">{STEPS.map((_, k) => <i key={k} className={k === i ? "on" : k < i ? "done" : ""} />)}</div>
          <div className="tour-btns">
            {i === 0 ? <button className="link small" onClick={end}>Passer</button> : <button className="link small" onClick={back}>Retour</button>}
            <button className="btn sm" onClick={next} autoFocus>{i + 1 >= STEPS.length ? "C’est parti" : "Suivant"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
