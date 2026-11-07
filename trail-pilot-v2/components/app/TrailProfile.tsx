"use client";

import { useEffect, useState } from "react";
import type { Ctx } from "./AppShell";
import { api } from "./client";
import InfoTip from "./InfoTip";

type Axis = "endurance" | "volume" | "climb" | "descent" | "speed" | "consistency";
interface AxisScore { key: Axis; label: string; score: number; value: string; target: number | null; targetText: string | null }
interface Data {
  enough: boolean; sessions: number; weeks: number;
  axes: AxisScore[]; strengths: AxisScore[]; weaknesses: AxisScore[];
  advice: { key: Axis; title: string; why: string; sessions: string[] }[];
  type: { name: string; line: string } | null; race: { name: string } | null;
}

/** Profil trail : radar des qualités, points forts, points faibles et séances à travailler. */
export default function TrailProfile({ go }: Pick<Ctx, "go">) {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { api<Data>("/api/trail-profile").then(setD).catch(() => setD(null)); }, []);
  if (!d) return <div className="skeleton" style={{ marginBottom: 14 }} />;
  if (!d.enough) {
    return (
      <section className="card tprofile" style={{ marginBottom: 14 }}>
        <div className="card-head"><h2>Ton profil trail</h2></div>
        <p className="empty">Il faut au moins 4 sorties sur les 8 dernières semaines pour dresser ton profil. <button className="link" onClick={() => go("runs")}>Ajouter des séances</button></p>
      </section>
    );
  }
  return (
    <section className="card tprofile" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <div><span className="eyebrow">{d.sessions} sorties sur {d.weeks} semaines</span>
          <h2 className="tip-label" style={{ marginTop: 4 }}>Ton profil trail<InfoTip title="Comment c’est noté">
            <span className="p">Six qualités notées de 0 à 100 sur tes 8 dernières semaines : <em>endurance</em> (plus longue sortie, 100 = 4 h), <em>volume</em> (100 = 8 h par semaine), <em>montée</em> (D+ par semaine et vitesse en côte), <em>descente</em> (D− par semaine), <em>vitesse</em> (VO2max) et <em>régularité</em> (semaines à 3 sorties ou plus).</span>
            {d.race && <span className="p">La zone pointillée montre ce que demande <em>{d.race.name}</em> : tes points faibles sont choisis par rapport à elle.</span>}
          </InfoTip></h2>
        </div>
        {d.type && <span className="chip ember"><span className="dot" />{d.type.name}</span>}
      </div>
      <div className="tp-grid">
        <Radar axes={d.axes} />
        <div className="tp-side">
          {d.type && <p className="soft" style={{ margin: 0 }}>{d.type.line}</p>}
          {d.strengths.length > 0 && (
            <div><h3>Où tu es bon</h3>
              <ul className="tp-list ok">{d.strengths.map((a) => <li key={a.key}><b>{a.label}</b><span className="mono">{a.score}</span><small>{a.value}</small></li>)}</ul>
            </div>
          )}
          {d.weaknesses.length > 0 && (
            <div><h3>Où tu l’es moins</h3>
              <ul className="tp-list low">{d.weaknesses.map((a) => <li key={a.key}><b>{a.label}</b><span className="mono">{a.score}</span><small>{a.value}{a.targetText ? ` · ${a.targetText}` : ""}</small></li>)}</ul>
            </div>
          )}
        </div>
      </div>
      {d.advice.length > 0 && (
        <div className="tp-advice">
          <h3>Quoi travailler</h3>
          <div className="tp-cards">
            {d.advice.map((a) => (
              <div key={a.key} className="tp-card">
                <b>{a.title}</b>
                <p className="muted small" style={{ margin: 0 }}>{a.why}</p>
                <ul>{a.sessions.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            ))}
          </div>
          <p className="muted small" style={{ margin: 0 }}>Ton plan intègre déjà ces séances au fil des phases. Pour en ajouter, garde au moins une journée facile entre deux séances dures.</p>
        </div>
      )}
    </section>
  );
}

function Radar({ axes }: { axes: AxisScore[] }) {
  const S = 300, c = S / 2, R = 108, n = axes.length;
  const pt = (i: number, v: number) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [c + Math.cos(a) * R * (v / 100), c + Math.sin(a) * R * (v / 100)]; };
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, Math.max(4, v)).map((x) => x.toFixed(1)).join(",")).join(" ");
  const hasTarget = axes.some((a) => a.target != null);
  return (
    <svg className="radar" viewBox={`-78 -4 ${S + 156} ${S + 8}`} role="img" aria-label={`Profil : ${axes.map((a) => `${a.label} ${a.score} sur 100`).join(", ")}`}>
      {[25, 50, 75, 100].map((r) => <polygon key={r} points={poly(axes.map(() => r))} className="radar-ring" />)}
      {axes.map((_, i) => { const [x, y] = pt(i, 100); return <line key={i} x1={c} y1={c} x2={x} y2={y} className="radar-ring" />; })}
      {hasTarget && <polygon points={poly(axes.map((a) => a.target ?? a.score))} className="radar-target" />}
      <polygon points={poly(axes.map((a) => a.score))} className="radar-you" />
      {axes.map((a, i) => { const [x, y] = pt(i, a.score); return <circle key={a.key} cx={x} cy={y} r={3.5} className="radar-dot" />; })}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 124);
        return <text key={a.key} x={x} y={y} textAnchor={Math.abs(x - c) < 10 ? "middle" : x > c ? "start" : "end"} dominantBaseline="middle" className="radar-label">{a.label} <tspan className="radar-num">{a.score}</tspan></text>;
      })}
    </svg>
  );
}
