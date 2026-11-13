"use client";

import { useEffect, useMemo, useState } from "react";
import type { Ctx } from "./AppShell";
import InfoTip, { EXPLAIN } from "./InfoTip";
import { TargetsTable } from "./Targets";
import TrailProfile from "./TrailProfile";
import Progress from "./Progress";
import GraphCards, { type GraphData } from "./GraphCards";
import { api, dayLabel, fmtDur, fmtNum, SPORT_LABEL } from "./client";

interface Data {
  points: { date: string; load: number; atl: number; ctl: number; form: number }[];
  weeks: { week: string; minutes: number; km: number; gain: number; load: number; sessions: number }[];
  sports: Record<string, number>;
  summary: { atl: number; ctl: number; form: number; ratio: number | null; monotony: number | null; calibrated: boolean; historyDays: number };
  intensity: GraphData["intensity"];
  recovery: GraphData["recovery"];
}

export default function Analysis({ me, toast, go }: Ctx) {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { api<Data>("/api/analysis").then(setD).catch((e) => toast(e.message)); }, [toast]);
  if (!d) return <><Head /><div className="skeleton" /></>;
  const s = d.summary;
  const sportTotal = Object.values(d.sports).reduce((a, b) => a + b, 0);
  return (
    <>
      <Head />
      <h2 className="q-head" id="q-forme"><span>1</span>Suis-je en forme ?</h2>
      {d.intensity && d.recovery && <GraphCards d={d} />}
      {!s.calibrated && <p className="note" style={{ marginBottom: 14 }}>Calibrage en cours : {s.historyDays} jours d’historique sur 28. Les indicateurs se fiabilisent au fil des séances.</p>}
      <section className="card">
        <div className="card-head"><h2 className="tip-label">Forme, fatigue et fraîcheur<InfoTip title="Forme, fatigue et fraîcheur"><span className="p"><em>Forme de fond</em> (trait épais) : ta charge moyenne sur 6 semaines, ton niveau d’entraînement. <em>Fatigue</em> : ta charge des 7 derniers jours. <em>Fraîcheur</em> : la différence entre les deux.</span></InfoTip></h2></div>
        <FitnessChart points={d.points} />
        <div className="legend">
          <span><i style={{ background: "var(--snow)" }} />Forme de fond (6 sem.)</span>
          <span><i style={{ background: "var(--ember)" }} />Fatigue (7 j)</span>
          <span><i style={{ background: "var(--ok)" }} />Fraîcheur</span>
          <span><i style={{ background: "var(--ink-4)", height: 8 }} />Charge du jour</span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          {s.monotony != null && s.monotony > 2 ? "Tes séances se ressemblent beaucoup cette semaine : alterne jours faciles et jours durs, c’est ce qui fait progresser. " : ""}
          {sportTotal ? `Sur 4 semaines : ${Object.entries(d.sports).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${SPORT_LABEL[k] ?? k} ${Math.round((v / sportTotal) * 100)} %`).join(", ")}.` : ""}
        </p>
      </section>

      <h2 className="q-head" id="q-progres"><span>2</span>Est-ce que je progresse ?</h2>
      <Vo2Card go={go} targets={me.targets} />
      <Progress />

      <h2 className="q-head" id="q-pret"><span>3</span>Suis-je prêt pour ma course ?</h2>
      <Readiness go={go} />
      <TrailProfile go={go} />
    </>
  );
}

/** « Si la course était aujourd’hui » : temps estimé sur ta course, semaine après semaine. */
function Readiness({ go }: Pick<Ctx, "go">) {
  const [r, setR] = useState<{ goal: { name: string; date: string; km: number; gain: number; assumed: boolean } | null; points: { date: string; vo2: number; minutes: number }[]; current: number | null; target: { low: number; high: number } | null; watch: boolean } | null>(null);
  const [hi, setHi] = useState<number | null>(null);
  useEffect(() => { api<NonNullable<typeof r>>("/api/readiness").then(setR).catch(() => setR(null)); }, []);
  if (!r) return null;
  if (!r.goal) return <section className="card"><div className="empty">Choisis ta course dans Planning : tu verras ici le temps que tu ferais si elle avait lieu aujourd’hui, et son évolution semaine après semaine.<div><button className="btn ghost sm" onClick={() => go("plan")}>Choisir ma course</button></div></div></section>;
  const pts = r.points;
  const fmt = (m: number) => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")}`;
  const first = pts[0], last = pts[pts.length - 1];
  const gain = first && last ? first.minutes - last.minutes : 0;
  const lo = Math.min(...pts.map((p) => p.minutes)), hiV = Math.max(...pts.map((p) => p.minutes)), span = Math.max(5, hiV - lo);
  const X = (i: number) => (pts.length > 1 ? (i / (pts.length - 1)) * 300 : 150), Y = (m: number) => 10 + ((m - lo) / span) * 70; // plus rapide = plus haut
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.minutes).toFixed(1)}`).join(" ");
  const h = hi != null ? pts[hi] : null;
  return (
    <section className="card ready" aria-labelledby="ready-title">
      <div className="card-head">
        <div><span className="eyebrow">{r.goal.name} · {fmtNum(r.goal.km)} km · {fmtNum(r.goal.gain)} m D+</span><h2 id="ready-title" style={{ marginTop: 4 }}>Si la course était aujourd’hui</h2></div>
        {pts.length >= 2 && Math.abs(gain) >= 2 && <span className={`chip ${gain > 0 ? "ok" : "lite"}`}>{gain > 0 ? `${fmt(gain).replace(/^0 h /, "")} gagnées` : `${fmt(-gain).replace(/^0 h /, "")} perdues`} en {pts.length - 1} sem.</span>}
      </div>
      {r.current == null ? (
        <div className="empty">Il faut une VO2max pour estimer ton temps : renseigne celle de ta montre dans Compte, ou importe des sorties avec cardio.<div><button className="btn ghost sm" onClick={() => go("account")}>Compléter mon profil</button></div></div>
      ) : (
        <>
          <div className="ready-now"><b>{fmt(r.current)}</b><span className="muted small">avec ta forme du jour{r.target ? ` · objectif du plan au jour J : ${fmt(r.target.low)} – ${fmt(r.target.high)}` : ""}</span></div>
          {pts.length >= 2 && (
            <div className="gc-plot ready-plot" onPointerMove={(e) => { const b = e.currentTarget.getBoundingClientRect(); setHi(Math.max(0, Math.min(pts.length - 1, Math.round(((e.clientX - b.left) / b.width) * (pts.length - 1))))); }} onPointerLeave={(e) => { if (e.pointerType === "mouse") setHi(null); }} onPointerDown={(e) => { const b = e.currentTarget.getBoundingClientRect(); setHi(Math.max(0, Math.min(pts.length - 1, Math.round(((e.clientX - b.left) / b.width) * (pts.length - 1))))); }}>
              <svg viewBox="0 0 300 90" preserveAspectRatio="none" aria-hidden="true"><path className="gc-area" d={`${line} L300 90 L0 90 Z`} /><path className="gc-line" d={line} pathLength={1} vectorEffect="non-scaling-stroke" /></svg>
              {pts.map((p, i) => <i key={p.date} className={`gc-dot${hi === i ? " on" : ""}${i === pts.length - 1 ? " now" : ""}`} style={{ left: `${(X(i) / 300) * 100}%`, top: `${(Y(p.minutes) / 90) * 100}%` }} />)}
              {h && <div className="gc-tip" style={{ left: `${Math.max(14, Math.min(86, (X(hi!) / 300) * 100))}%` }}><b>{fmt(h.minutes)}</b>VO2max {String(h.vo2).replace(".", ",")}<small>sem. du {dayLabel(h.date, { day: "numeric", month: "short" })}</small></div>}
            </div>
          )}
          <p className="muted small" style={{ margin: 0 }}>Ta capacité du jour sur ce parcours, d’après l’évolution de ta VO2max{r.watch ? " (calée sur ta montre)" : ""}. La préparation (sortie longue, D+, affûtage) ajoute ce que ce chiffre ne voit pas : il sert à suivre la tendance, pas à fixer ton allure de course.{r.goal.assumed ? " Distance et D+ supposés : complète-les dans Planning." : ""}</p>
        </>
      )}
    </section>
  );
}

interface Vo2 {
  value: number | null; low: number | null; high: number | null; method: "seances" | "frequence" | null;
  sessions: { date: string; name: string | null; vo2max: number; speedKmh: number; hrPct: number }[]; used: number;
  months: { month: string; value: number; sessions: number }[]; since: string | null;
  uth: number | null; previous: number | null; hrMax: number | null; hrMaxSource: "profil" | "observée" | null; hrRest: number | null;
  races: { label: string; km: number; minutes: number }[]; notes: string[];
  watch: number | null; paceVdot: number | null;
}
const fmtRace = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`);
const dec = (n: number) => n.toFixed(1).replace(".", ",");
const monthLabel = (m: string, year = true) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("fr-FR", year ? { month: "short", year: "numeric" } : { month: "short" });

function Vo2Card({ go, targets }: Pick<Ctx, "go"> & { targets: Ctx["me"]["targets"] }) {
  const [v, setV] = useState<Vo2 | null>(null);
  useEffect(() => { api<Vo2>("/api/vo2").then(setV).catch(() => setV(null)); }, []);
  if (!v) return null;
  const pos = (x: number) => `${Math.min(100, Math.max(0, ((x - 30) / 45) * 100))}%`;
  const delta = v.value != null && v.previous != null ? Math.round((v.value - v.previous) * 10) / 10 : null;
  return (
    <section className="card vo2" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div><span className="eyebrow">Capacité aérobie</span><h2 className="tip-label" style={{ marginTop: 4 }}>VO2max estimée<InfoTip title="VO2max">{EXPLAIN.vo2}</InfoTip></h2></div>
        {v.method && <span className="chip">{v.method === "seances" ? `${v.used} sortie${v.used > 1 ? "s" : ""}${v.since ? ` · depuis ${monthLabel(v.since.slice(0, 7))}` : ""}` : "Fréquences cardiaques"}</span>}
      </div>
      {v.value == null ? (
        <div className="empty">
          {v.notes[0] ?? "Pas encore assez de données."}
          <div><button className="btn ghost sm" onClick={() => go("account")}>Compléter mon profil</button></div>
        </div>
      ) : (
        <div className="vo2-grid">
          <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
            <div className="row" style={{ alignItems: "baseline", gap: 10 }}>
              <b className="vo2-big">{dec(v.value)}</b><span className="muted">ml/kg/min</span>
              {delta != null && delta !== 0 && <span className={`chip ${delta > 0 ? "ok" : "lite"}`}>{delta > 0 ? "+" : ""}{dec(delta)} sur 2 mois</span>}
            </div>
            {v.watch != null && (
              <div className="vo2-watch"><span>Ta montre</span><b>{dec(v.watch)}</b><span className="muted small">utilisée pour tes allures</span></div>
            )}
            <p className="soft small" style={{ margin: 0 }}>Fourchette probable : {dec(v.low!)} à {dec(v.high!)}{v.uth != null && v.method === "seances" ? ` · repère par la FC seule : ${dec(v.uth)}` : ""}.</p>
            <div className="vo2-scale" role="img" aria-label={`VO2max estimée ${dec(v.value)} ml/kg/min`}>
              <i className="range" style={{ left: pos(v.low!), width: `calc(${pos(v.high!)} - ${pos(v.low!)})` }} />
              <b style={{ left: pos(v.value) }} />
              <div className="vo2-ticks"><span>30</span><span>45</span><span>60</span><span>75</span></div>
            </div>
            {v.months.length >= 2 && <Vo2History months={v.months} />}
            {v.sessions.length > 0 && (
              <div className="small muted">
                Meilleures sorties récentes : {v.sessions.map((s) => `${s.name ?? "sortie"} du ${dayLabel(s.date, { day: "numeric", month: "short" })} (${dec(s.speedKmh)} km/h à ${s.hrPct} % de FC max)`).join(" · ")}.
              </div>
            )}
          </div>
          <div>
            <h3 style={{ marginBottom: 8 }}>Équivalences sur route plate{v.watch != null ? " (VO2max de la montre)" : ""}</h3>
            <div className="vo2-races">
              {v.races.map((r) => <div key={r.label}><small>{r.label}</small><b>{fmtRace(r.minutes)}</b></div>)}
            </div>
            <p className="muted small" style={{ margin: "10px 0 0" }}>Temps théoriques à effort maximal, en forme et bien affûté. En trail, le dénivelé et le terrain allongent nettement ces temps.</p>
          </div>
        </div>
      )}
      {v.value != null && <TargetsTable targets={targets} />}
      {v.value != null && v.notes.length > 0 && <ul className="reasons small">{v.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      <p className="muted" style={{ margin: 0, fontSize: 11.5 }}>Estimation de terrain, précise à environ 5 à 10 %. Quand une sortie a été analysée seconde par seconde (Strava ou fichier de montre), le calcul part de ses passages d’effort stable, pente par pente, comme le font les montres. Sinon il part des moyennes de la sortie : coût de la pente sur route (Minetti), km-effort sur sentier, coût de l’allure (Daniels), réserve cardiaque (Swain). Seul un test d’effort en laboratoire mesure vraiment la VO2max.</p>
      {v.watch == null && v.value != null && <p className="muted small" style={{ margin: 0 }}>Ta montre affiche une autre valeur ? Renseigne-la dans <button className="link small" onClick={() => go("account")}>ton profil</button> : elle servira à calculer tes allures.</p>}
    </section>
  );
}

function Vo2History({ months }: { months: Vo2["months"] }) {
  const W = 320, H = 92, P = { l: 4, r: 4, t: 10, b: 20 };
  const vals = months.map((m) => m.value);
  const lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
  const x = (i: number) => P.l + (i / Math.max(1, months.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - P.t - P.b);
  const d = months.map((m, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(m.value).toFixed(1)}`).join(" ");
  const ticks = months.length <= 4 ? months.map((_, i) => i) : [0, Math.floor((months.length - 1) / 2), months.length - 1];
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div className="row between small"><span className="muted">Mois par mois, sur tout ton historique</span><span className="mono muted">{dec(Math.min(...vals))} – {dec(Math.max(...vals))}</span></div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Évolution de ta VO2max sur ${months.length} mois`}>
        <path className="ch-area" d={`${d} L${x(months.length - 1).toFixed(1)} ${H - P.b} L${x(0).toFixed(1)} ${H - P.b} Z`} fill="color-mix(in srgb, var(--ember) 14%, transparent)" />
        <path className="ch-line ch-glow" pathLength={1} d={d} fill="none" stroke="var(--ember)" strokeWidth={2} strokeLinejoin="round" />
        <circle className="ch-beacon" cx={x(months.length - 1)} cy={y(months[months.length - 1].value)} r={7} fill="var(--ember)" />
        {months.map((m, i) => <circle key={m.month} className="ch-dot" style={{ ["--d" as string]: (i / Math.max(1, months.length - 1)).toFixed(3) }} cx={x(i)} cy={y(m.value)} r={months.length > 24 ? 1.6 : 2.6} fill="var(--ember)"><title>{`${monthLabel(m.month)} : ${dec(m.value)} (${m.sessions} sortie(s))`}</title></circle>)}
        {ticks.map((i) => <text key={i} x={x(i)} y={H - 5} textAnchor={i === 0 ? "start" : i === months.length - 1 ? "end" : "middle"}>{monthLabel(months[i].month)}</text>)}
      </svg>
    </div>
  );
}

const Head = () => <header className="head"><div><span className="eyebrow">Moteur de charge</span><h1>Analyse</h1></div></header>;


function FitnessChart({ points }: { points: Data["points"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 240, P = { l: 34, r: 8, t: 10, b: 22 };
  const { max, min, path, x, y, loadMax } = useMemo(() => {
    const max = Math.max(10, ...points.map((p) => Math.max(p.ctl, p.atl)));
    const min = Math.min(0, ...points.map((p) => p.form));
    const loadMax = Math.max(1, ...points.map((p) => p.load));
    const x = (i: number) => P.l + (i / Math.max(1, points.length - 1)) * (W - P.l - P.r);
    const y = (v: number) => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b);
    const path = (k: "ctl" | "atl" | "form") => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(" ");
    return { max, min, path, x, y, loadMax };
  }, [points]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!points.length) return <p className="empty">Pas encore de données.</p>;
  const ticks = [min, 0, max / 2, max].filter((v, i, a) => a.indexOf(v) === i);
  const h = hover != null ? points[hover] : null;
  return (
    <div className="chart-wrap">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Évolution de la forme, de la fatigue et de la fraîcheur"
        onPointerMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(points.length - 1, Math.round(((px - P.l) / (W - P.l - P.r)) * (points.length - 1))))); }}
        onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => <g key={t}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#ffffff30" : "#ffffff12"} /><text x={P.l - 6} y={y(t) + 3} textAnchor="end">{Math.round(t)}</text></g>)}
        <rect className="ch-scan" x={P.l} y={P.t} width={46} height={H - P.t - P.b} style={{ ["--w" as string]: `${W - P.l - P.r - 46}px` }} />
        {points.map((p, i) => p.load > 0 && <rect key={p.date} className="ch-bar" style={{ ["--d" as string]: (i / Math.max(1, points.length - 1)).toFixed(3) }} x={x(i) - 1.5} width={3} y={H - P.b - (p.load / loadMax) * 46} height={(p.load / loadMax) * 46} fill="#243241" rx={1} />)}
        <path className="ch-line l1" pathLength={1} d={path("form")} fill="none" stroke="var(--ok)" strokeWidth={1.5} opacity={0.85} />
        <path className="ch-line l2" pathLength={1} d={path("atl")} fill="none" stroke="var(--ember)" strokeWidth={1.8} />
        <path className="ch-line l3 ch-glow" pathLength={1} d={path("ctl")} fill="none" stroke="var(--snow)" strokeWidth={2.4} />
        <circle className="ch-beacon late" cx={x(points.length - 1)} cy={y(points[points.length - 1].ctl)} r={8} fill="var(--snow)" />
        <circle className="ch-end" cx={x(points.length - 1)} cy={y(points[points.length - 1].ctl)} r={3.5} fill="var(--snow)" />
        {[0, Math.floor(points.length / 2), points.length - 1].map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}>{dayLabel(points[i].date, { day: "numeric", month: "short" })}</text>)}
        {h && <g><line x1={x(hover!)} x2={x(hover!)} y1={P.t} y2={H - P.b} stroke="#ffffff40" /><circle cx={x(hover!)} cy={y(h.ctl)} r={3.5} fill="var(--snow)" /><circle cx={x(hover!)} cy={y(h.atl)} r={3.5} fill="var(--ember)" /></g>}
      </svg>
      {h && <div className="tip" style={{ left: `${(x(hover!) / W) * 100}%`, top: `${(y(Math.max(h.ctl, h.atl)) / H) * 100}%` }}>
        {dayLabel(h.date, { weekday: "short", day: "numeric", month: "short" })}<br />Forme {h.ctl} · Fatigue {h.atl}<br />Fraîcheur {h.form > 0 ? "+" : ""}{h.form} · Charge {h.load}
      </div>}
    </div>
  );
}

