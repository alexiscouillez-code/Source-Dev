"use client";

import { useEffect, useRef, useState } from "react";

const STATES = [
  {
    key: "ok", cls: "s-ok", label: "OK", color: "#5fd39a", angle: -58,
    title: "Bien dormi, jambes fraîches.",
    text: "Feu vert : ta séance prévue tient. Tu pars sur ton fractionné en côte comme prévu.",
    v: { sommeil: 86, jambes: 82, motivation: 90, douleur: 6 },
    advice: "Séance maintenue · 1 h 10",
  },
  {
    key: "lite", cls: "s-lite", label: "Allège", color: "#f5c451", angle: 0,
    title: "Semaine chargée, un peu lourd.",
    text: "Tu sors quand même, mais on retire l’intensité : endurance fondamentale, 30 % de volume en moins.",
    v: { sommeil: 58, jambes: 44, motivation: 66, douleur: 28 },
    advice: "Endurance douce · 45 min",
  },
  {
    key: "rest", cls: "s-rest", label: "Récup", color: "#7fb6ff", angle: 58,
    title: "Nuit courte, mollet qui tire.",
    text: "Aujourd’hui le meilleur entraînement, c’est le repos. Marche, mobilité, et on repart demain.",
    v: { sommeil: 30, jambes: 24, motivation: 38, douleur: 64 },
    advice: "Repos actif · mobilité 15 min",
  },
] as const;

export default function Decision() {
  const sec = useRef<HTMLElement>(null);
  const [idx, setIdx] = useState(0);
  const rail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sec.current!;
    const stage = el.querySelector<HTMLElement>(".decide-stage")!;
    let raf = 0;
    const update = () => {
      const r = el.getBoundingClientRect();
      const span = el.offsetHeight - window.innerHeight;
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, span)));
      stage.style.setProperty("--p", p.toFixed(3));
      const i = p < 0.34 ? 0 : p < 0.68 ? 1 : 2;
      setIdx((prev) => (prev === i ? prev : i));
      rail.current?.querySelectorAll<HTMLElement>("b").forEach((b, k) => {
        const f = Math.min(1, Math.max(0, (p - k / 3) * 3));
        b.style.setProperty("--f", f.toFixed(3));
      });
    };
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const s = STATES[idx];

  return (
    <section className="decide" id="decision" ref={sec} aria-labelledby="decide-title">
      <div className="decide-stage">
        <div className="wrap decide-grid">
          <div>
            <span className="kicker" id="decide-title">Le check-in du soir</span>
            <div className="decide-states" aria-live="polite">
              {STATES.map((st, i) => (
                <div key={st.key} className={`dstate ${st.cls} ${i === idx ? "on" : ""}`} aria-hidden={i !== idx}>
                  <div className="big">{st.label}.</div>
                  <p><strong>{st.title}</strong> {st.text}</p>
                </div>
              ))}
              <div className="progress-rail" ref={rail} aria-hidden="true">
                <i><b /></i><i><b /></i><i><b /></i>
              </div>
            </div>
          </div>

          <div className="phone" style={{ ["--glow" as string]: `${s.color}55` }} aria-hidden="true">
            <div className="screen" style={{ ["--accent" as string]: s.color }}>
              <div className="notch" />
              <span className="mono" style={{ color: "var(--mute)" }}>Mardi · 21:42</span>
              <h4>Comment tu te sens&nbsp;?</h4>
              {(
                [
                  ["Sommeil", s.v.sommeil],
                  ["Jambes", s.v.jambes],
                  ["Motivation", s.v.motivation],
                  ["Douleur", s.v.douleur],
                ] as const
              ).map(([lab, val]) => (
                <div className="slider" key={lab}>
                  <label><span>{lab}</span><span>{val}</span></label>
                  <div className="track" style={{ ["--v" as string]: `${val}%` }}>
                    <div className="fill" />
                    <div className="knob" />
                  </div>
                </div>
              ))}
              <svg className="gauge" viewBox="0 0 200 100">
                <path d="M20 90 A80 80 0 0 1 180 90" fill="none" stroke="#1b2631" strokeWidth="14" strokeLinecap="round" />
                <path d="M20 90 A80 80 0 0 1 66 24" fill="none" stroke="#5fd39a" strokeWidth="14" strokeLinecap="round" opacity=".9" />
                <path d="M74 19 A80 80 0 0 1 126 19" fill="none" stroke="#f5c451" strokeWidth="14" opacity=".9" />
                <path d="M134 24 A80 80 0 0 1 180 90" fill="none" stroke="#7fb6ff" strokeWidth="14" strokeLinecap="round" opacity=".9" />
                <g className="needle" style={{ transform: `rotate(${s.angle}deg)` }}>
                  <line x1="100" y1="90" x2="100" y2="26" stroke="#f4efe6" strokeWidth="4" strokeLinecap="round" />
                </g>
                <circle cx="100" cy="90" r="8" fill="#f4efe6" />
              </svg>
              <div className="verdict">
                <small className="mono">Demain</small>
                <b>{s.label}</b>
                <small>{s.advice}</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
