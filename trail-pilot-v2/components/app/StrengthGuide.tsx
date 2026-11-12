"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dose, strengthProgram, type Exercise } from "@/lib/engine/strength";

/**
 * Renforcement guidé : la fiche des exercices de la séance, puis un mode pas à pas avec minuteur
 * (exercice, récupération, tour suivant). Les exercices en répétitions attendent un « Fait ».
 */
type Step = { kind: "work"; ex: Exercise; round: number; side?: "gauche" | "droite" } | { kind: "rest"; seconds: number; next: string; round: number };

export default function StrengthGuide({ phase, minutes, onClose, onDone }: { phase: string; minutes: number; onClose: () => void; onDone?: () => void }) {
  const p = useMemo(() => strengthProgram(phase, minutes), [phase, minutes]);
  const [mode, setMode] = useState<"fiche" | "guide" | "fin">("fiche");
  const [open, setOpen] = useState<string | null>(null);
  const steps = useMemo(() => {
    const out: Step[] = [];
    for (let r = 1; r <= p.rounds; r++) {
      p.exercises.forEach((ex, i) => {
        // Exercice chronométré par côté : deux étapes ; en répétitions, une seule (les deux côtés à la suite).
        if (ex.sides && ex.seconds) { out.push({ kind: "work", ex, round: r, side: "gauche" }, { kind: "work", ex, round: r, side: "droite" }); }
        else out.push({ kind: "work", ex, round: r });
        const last = i === p.exercises.length - 1;
        if (!(last && r === p.rounds)) out.push({ kind: "rest", seconds: last ? p.roundRest : p.rest, next: last ? p.exercises[0].name : p.exercises[i + 1].name, round: r });
      });
    }
    return out;
  }, [p]);
  const [i, setI] = useState(0);
  const [left, setLeft] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const step = steps[i];
  const secondsOf = (s: Step) => (s.kind === "rest" ? s.seconds : s.ex.seconds ?? null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  useEffect(() => { ref.current?.querySelector<HTMLElement>("button")?.focus(); }, [mode]);
  // Le minuteur démarre à chaque nouvelle étape chronométrée.
  useEffect(() => { if (mode === "guide" && step) { setLeft(secondsOf(step)); setPaused(false); } }, [i, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mode !== "guide" || left == null || paused) return;
    if (left <= 0) { beep(); next(); return; }
    const t = window.setTimeout(() => { setLeft((x) => (x == null ? x : x - 1)); if (left <= 4 && left > 1) tick(); }, 1000);
    return () => window.clearTimeout(t);
  }, [left, paused, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  function next() { if (i + 1 >= steps.length) { setMode("fin"); buzz(); } else setI(i + 1); }
  const total = Math.round(steps.reduce((t, s) => t + (s.kind === "rest" ? s.seconds : (s.ex.seconds ?? 45)), 0) / 60);
  const progress = Math.round((i / steps.length) * 100);

  // Rendue à la racine de la page : la fiche couvre l’écran même ouverte depuis une liste ou une carte animée.
  return createPortal(
    <div className="sheet-back" role="dialog" aria-modal="true" aria-labelledby="sg-title" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet sg" ref={ref}>
        <div className="row between"><h2 id="sg-title" style={{ margin: 0 }}>{p.title}</h2><button className="iconbtn" aria-label="Fermer" onClick={onClose}>×</button></div>
        {mode === "fiche" && (
          <>
            <p className="soft small" style={{ margin: 0 }}>{p.why}</p>
            <p className="muted small" style={{ margin: 0 }}>{p.rounds} tours · {p.exercises.length} exercices · récupération {p.rest} s entre exercices, {p.roundRest} s entre tours · environ {total} min. Échauffe-toi 5 min avant (footing léger, montées de genoux).</p>
            <ol className="sg-list">
              {p.exercises.map((e) => (
                <li key={e.id}>
                  <button className="sg-ex" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}><b>{e.name}</b><span className="mono">{dose(e)}</span></button>
                  {open === e.id && (
                    <div className="sg-detail">
                      <ul>{e.cues.map((c) => <li key={c}>{c}</li>)}</ul>
                      <p><b>À éviter :</b> {e.avoid}</p>
                      <p><b>Plus facile :</b> {e.easier} · <b>Plus dur :</b> {e.harder}</p>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <p className="muted small" style={{ margin: 0 }}>Une douleur vive (pas une simple brûlure musculaire) : arrête l’exercice et passe au suivant.</p>
            <button className="btn" onClick={() => { setI(0); setMode("guide"); }}>Démarrer le mode guidé</button>
          </>
        )}
        {mode === "guide" && step && (
          <div className="sg-run" aria-live="polite">
            <div className="sg-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Avancement de la séance"><i style={{ width: `${progress}%` }} /></div>
            <small className="muted">Tour {step.round} sur {p.rounds}</small>
            {step.kind === "work" ? (
              <>
                <h3 className="sg-name">{step.ex.name}{step.side ? ` · côté ${step.side}` : ""}</h3>
                {left != null ? <b className="sg-time mono">{left}</b> : <b className="sg-time mono">{step.ex.reps}{step.ex.sides ? " × 2" : ""}<small> répétitions{step.ex.sides ? " (chaque côté)" : ""}</small></b>}
                <ul className="sg-cues">{step.ex.cues.map((c) => <li key={c}>{c}</li>)}</ul>
              </>
            ) : (
              <>
                <h3 className="sg-name">Récupération</h3>
                <b className="sg-time mono">{left}</b>
                <p className="muted" style={{ margin: 0 }}>Ensuite : {step.next}</p>
              </>
            )}
            <div className="row" style={{ gap: 8, justifyContent: "center" }}>
              {left != null ? <button className="btn ghost" onClick={() => setPaused(!paused)}>{paused ? "Reprendre" : "Pause"}</button> : null}
              <button className="btn" onClick={next}>{left == null ? "Fait" : step.kind === "rest" ? "Passer" : "Suivant"}</button>
            </div>
            <button className="link small" onClick={() => setMode("fiche")}>Revoir la fiche</button>
          </div>
        )}
        {mode === "fin" && (
          <div className="sg-run">
            <h3 className="sg-name">Séance terminée</h3>
            <p className="soft" style={{ margin: 0 }}>Bien joué. Étire doucement mollets, ischios et fessiers 5 min si tu en as envie.</p>
            <div className="row" style={{ gap: 8, justifyContent: "center" }}>
              {onDone && <button className="btn" onClick={() => { onDone(); onClose(); }}>Marquer la séance comme faite</button>}
              <button className="btn ghost" onClick={onClose}>Fermer</button>
            </div>
          </div>
        )}
      </div>
    </div>, document.body);
}

// Petits signaux sonores et vibrations : le téléphone est souvent posé au sol pendant le gainage.
let ctx: AudioContext | null = null;
function tone(freq: number, ms: number) {
  try {
    ctx = ctx ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + ms / 1000);
  } catch { /* son indisponible */ }
}
const tick = () => tone(660, 80);
const beep = () => { tone(990, 220); buzz(); };
const buzz = () => { try { navigator.vibrate?.([120, 60, 120]); } catch { /* vibration indisponible */ } };
