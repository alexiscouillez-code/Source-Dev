"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { Ctx } from "./AppShell";
import { api, dayLabel, SPORT_LABEL } from "./client";
import type { ZoneKey } from "./Body3D";

const Body3D = dynamic(() => import("./Body3D"), { ssr: false, loading: () => <div className="body3d"><div className="body3d-loading"><span>Chargement de la 3D…</span></div></div> });

type Level = "faible" | "habituel" | "élevé" | "très élevé" | "inconnu";
interface Zone { zone: ZoneKey; label: string; recent: number; baseline: number | null; ratio: number | null; level: Level; intensity: number; factors: { climb: number; descent: number; flat: number }; sessions: { date: string; name: string | null; sport: string; value: number }[] }
interface Data {
  today: string;
  reading: { period: 7 | 28; zones: Zone[]; confidence: number; activities: number; withElevation: number; baselineWeeks: number; notes: string[] };
  race: { name: string; date: string; gap: { raceGainPerKm: number; trainGainPerKm: number; raceLossPerKm: number; trainLossPerKm: number } | null } | null;
  pains?: Record<string, { date: string; level: number; count: number }>;
}

const LEVEL_CHIP: Record<Level, string> = { faible: "dim", habituel: "", "élevé": "lite", "très élevé": "rest-hot", inconnu: "dim" };
const LEVEL_TEXT: Record<Level, string> = { faible: "Moins que d’habitude", habituel: "Dans ta moyenne", "élevé": "Au-dessus de ta moyenne", "très élevé": "Nettement au-dessus", inconnu: "Pas encore de référence" };

function webglOk() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

export default function XRay({ toast, go }: Ctx) {
  const [period, setPeriod] = useState<7 | 28>(7);
  const [d, setD] = useState<Data | null>(null);
  const [sel, setSel] = useState<ZoneKey | null>(null);
  const [view, setView] = useState<"front" | "back">("front");
  const [gl, setGl] = useState(true);
  const [skin, setSkin] = useState(true);

  useEffect(() => { setGl(webglOk()); }, []);
  useEffect(() => { api<Data>(`/api/xray?period=${period}`).then(setD).catch((e) => toast(e.message)); }, [period, toast]);

  const intensity = useMemo(() => Object.fromEntries((d?.reading.zones ?? []).map((z) => [z.zone, z.intensity])) as Record<ZoneKey, number>, [d]);
  const sorted = useMemo(() => [...(d?.reading.zones ?? [])].sort((a, b) => b.intensity - a.intensity), [d]);
  const zone = d?.reading.zones.find((z) => z.zone === sel) ?? null;
  const BACK: ZoneKey[] = ["glutes", "hamstrings", "calves", "lumbar"];
  const choose = (z: ZoneKey | null) => { setSel(z); if (z) setView(BACK.includes(z) ? "back" : "front"); };

  return (
    <>
      <header className="head">
        <div><span className="eyebrow">Sollicitation du corps</span><h1>X-Ray</h1></div>
        <div className="seg" role="group" aria-label="Période">
          {[7, 28].map((p) => <button key={p} className={period === p ? "on" : ""} onClick={() => setPeriod(p as 7 | 28)}>{p} jours</button>)}
        </div>
      </header>

      <div className="xray-grid">
        <section className="card xray-stage">
          {gl ? <Body3D intensity={intensity} selected={sel} onSelect={choose} view={view} skin={skin} /> : <div className="body3d"><div className="body3d-loading"><span>La 3D n’est pas disponible sur cet appareil. Le détail par zone reste disponible.</span></div></div>}
          <div className="xray-overlay">
            <div className="seg sm" role="group" aria-label="Vue">
              <button className={view === "front" ? "on" : ""} onClick={() => setView("front")}>Face</button>
              <button className={view === "back" ? "on" : ""} onClick={() => setView("back")}>Dos</button>
              <button className={skin ? "on" : ""} onClick={() => setSkin(!skin)} aria-pressed={skin}>Peau</button>
            </div>
            <div className="xray-scale" aria-hidden="true"><span>Moins</span><i /><span>Plus que d’habitude</span></div>
          </div>
          {zone && <div className="xray-tag"><b>{zone.label}</b><span>{zone.ratio != null ? `${zone.ratio >= 1 ? "+" : ""}${Math.round((zone.ratio - 1) * 100)} % vs ta moyenne` : LEVEL_TEXT[zone.level]}</span></div>}
          <p className="xray-hint small muted">Glisse pour tourner · pince ou molette pour zoomer · touche un muscle</p>
        </section>

        <div className="xray-side">
          {!d ? <div className="skeleton" /> : zone ? (
            <ZoneDetail z={zone} period={d.reading.period} pain={d.pains?.[zone.zone]} onClose={() => setSel(null)} />
          ) : (
            <section className="card">
              <div className="card-head"><h2>Zones</h2><span className="chip">{d.reading.activities} séance(s)</span></div>
              {d.reading.activities === 0 ? (
                <p className="empty">Aucune sortie sur cette période. <button className="link" onClick={() => go("runs")}>Ajouter une séance</button></p>
              ) : (
                <ul className="zlist">
                  {sorted.map((z) => (
                    <li key={z.zone}>
                      <button onClick={() => choose(z.zone)}>
                        <span className="zdot" style={{ background: heat(z.intensity) }} />
                        <span className="zname">{z.label}</span>
                        <span className="small muted">{z.ratio != null ? `${z.ratio >= 1 ? "+" : ""}${Math.round((z.ratio - 1) * 100)} %` : "—"}</span>
                        {d.pains?.[z.zone] ? <span className="chip pain" title="Douleur signalée au check-in">douleur</span> : <span className={`chip ${LEVEL_CHIP[z.level]}`}>{z.level}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="row between small muted"><span>Fiabilité de la lecture</span><span className="mono">{d.reading.confidence} %</span></div>
              <div className="meter"><i style={{ width: `${d.reading.confidence}%`, background: d.reading.confidence >= 60 ? "var(--ok)" : "var(--lite)" }} /></div>
            </section>
          )}

          {d?.pains && Object.keys(d.pains).length > 0 && !zone && (
            <p className="note small pain-note" style={{ margin: 0 }}>Douleur signalée ces 14 derniers jours : {Object.keys(d.pains).map((k) => d.reading.zones.find((z) => z.zone === k)?.label ?? k).join(", ").toLowerCase()}. Touche la zone pour le détail.</p>
          )}
          {d?.race?.gap && <RaceGap r={d.race} />}

          {d && d.reading.notes.length > 0 && <ul className="reasons small">{d.reading.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          <p className="muted small" style={{ margin: 0 }}>
            Estimation à partir du dénivelé positif, du dénivelé négatif et de la distance de tes sorties, comparés à tes {d?.reading.baselineWeeks ?? 4} semaines précédentes.
            Ce n’est ni une mesure musculaire ni un avis médical : en cas de douleur qui persiste, consulte un professionnel.
          </p>
          <p className="muted" style={{ margin: 0, fontSize: 11.5 }}>
            Modèle anatomique : <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/" target="_blank" rel="noopener noreferrer">BodyParts3D</a> © The Database Center for Life Science, licence <a href="https://creativecommons.org/licenses/by/4.0/deed.fr" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>, préparé par le projet Human Atlas, simplifié et regroupé par zones pour Trail Pilot.
          </p>
        </div>
      </div>
    </>
  );
}

function ZoneDetail({ z, period, pain, onClose }: { z: Zone; period: number; pain?: { date: string; level: number; count: number }; onClose: () => void }) {
  const f = [
    { k: "Descente · D−", v: z.factors.descent, c: "var(--ember)" },
    { k: "Montée · D+", v: z.factors.climb, c: "var(--ember-2)" },
    { k: "Distance", v: z.factors.flat, c: "var(--chart-bar-2)" },
  ];
  return (
    <section className="card zdetail">
      <div className="card-head"><div><span className="eyebrow">{period} derniers jours</span><h2 style={{ marginTop: 4, fontSize: 26, letterSpacing: "-.03em" }}>{z.label}</h2></div><button className="link small" onClick={onClose}>Toutes les zones</button></div>
      <div className="zbig" style={{ color: heat(z.intensity) }}>{z.ratio != null ? `${z.ratio >= 1 ? "+" : ""}${Math.round((z.ratio - 1) * 100)} %` : "—"}</div>
      {pain && <p className="note small pain-note" style={{ margin: 0 }}>Douleur {pain.level === 2 ? "marquée" : "légère"} signalée le {dayLabel(pain.date, { weekday: "long", day: "numeric", month: "long" })}{pain.count > 1 ? ` (${pain.count} check-in sur 14 jours)` : ""}. Si elle persiste ou s’aggrave, consulte un professionnel de santé.</p>}
      <p className="soft" style={{ margin: 0 }}>{LEVEL_TEXT[z.level]}{z.ratio != null ? " (charge hebdomadaire de la zone comparée à tes semaines précédentes)." : "."}</p>
      <h3>Ce qui l’a chargée</h3>
      {f.map((x) => (
        <div key={x.k} style={{ display: "grid", gap: 4 }}>
          <div className="row between small"><span>{x.k}</span><span className="mono muted">{x.v} %</span></div>
          <div className="meter"><i style={{ width: `${x.v}%`, background: x.c }} /></div>
        </div>
      ))}
      {z.sessions.length > 0 && (
        <>
          <h3>Séances qui ont le plus compté</h3>
          <ul className="list">
            {z.sessions.map((s, i) => (
              <li key={i} className="item" style={{ gridTemplateColumns: "1fr auto", padding: "10px 0" }}>
                <div style={{ minWidth: 0 }}><div className="t">{s.name ?? SPORT_LABEL[s.sport]}</div><div className="s">{dayLabel(s.date, { weekday: "short", day: "numeric", month: "short" })} · {SPORT_LABEL[s.sport]}</div></div>
                <span className="chip">{s.value} pts</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {(z.zone === "quads" || z.zone === "knees") && z.factors.descent >= 40 && <p className="note small">Les descentes travaillent le muscle en freinant : c’est souvent ce qui fatigue le plus les cuisses en trail. Garde des appuis courts et un buste relâché.</p>}
    </section>
  );
}

function RaceGap({ r }: { r: NonNullable<Data["race"]> }) {
  const g = r.gap!;
  const ratio = g.trainLossPerKm > 0 ? g.raceLossPerKm / g.trainLossPerKm : 2;
  const ok = ratio <= 1.25;
  return (
    <section className="card">
      <div className="card-head"><h2>Prêt pour {r.name} ?</h2><span className={`chip ${ok ? "ok" : "lite"}`}><span className="dot" />{ok ? "Terrain travaillé" : "À travailler"}</span></div>
      <div className="specs">
        <div><b>{g.raceGainPerKm} m/km</b><small>D+ de la course</small></div>
        <div><b>{g.trainGainPerKm} m/km</b><small>Tes 4 dernières semaines</small></div>
      </div>
      <p className="soft small" style={{ margin: 0 }}>
        {ok ? "Ton entraînement récent est aussi vallonné que la course : quadriceps et genoux sont habitués à ce dénivelé."
          : `La course est ${ratio >= 2 ? "deux fois" : "nettement"} plus pentue que tes sorties récentes. Quadriceps et genoux vont encaisser beaucoup de descente : ton plan intègre des séances de montée et de descente technique pour les y préparer.`}
      </p>
    </section>
  );
}

export function heat(v: number) {
  // Froid (sous ta moyenne) → braise → rouge (nettement au-dessus)
  return v < 0.5 ? `color-mix(in srgb, var(--ember) ${Math.round(v * 200)}%, var(--rest))` : `color-mix(in srgb, #e5383b ${Math.round((v - 0.5) * 200)}%, var(--ember))`;
}
