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
      {d.intensity && d.recovery && <GraphCards d={d} />}
      <TrailProfile go={go} />
      {!s.calibrated && <p className="note" style={{ marginBottom: 14 }}>Calibrage en cours : {s.historyDays} jours d’historique sur 28. Les indicateurs se fiabilisent au fil des séances.</p>}
      <section className="card">
        <div className="card-head"><h2 className="tip-label">Forme, fatigue et fraîcheur<InfoTip title="Forme, fatigue et fraîcheur"><span className="p"><em>Forme de fond</em> (trait épais) : ta charge moyenne sur 6 semaines, ton endurance.</span><span className="p"><em>Fatigue</em> (orange) : ta charge moyenne sur 7 jours.</span><span className="p"><em>Fraîcheur</em> (vert) : la différence entre les deux. Au-dessus de zéro, tu as de la réserve ; très en dessous plusieurs jours, il faut alléger.</span><span className="p">Les barres grises montrent la charge de chaque jour.</span></InfoTip></h2><span className="chip">120 jours</span></div>
        <FitnessChart points={d.points} />
        <div className="legend">
          <span><i style={{ background: "var(--snow)" }} />Forme de fond (6 sem.)</span>
          <span><i style={{ background: "var(--ember)" }} />Fatigue (7 j)</span>
          <span><i style={{ background: "var(--ok)" }} />Fraîcheur</span>
          <span><i style={{ background: "var(--ink-4)", height: 8 }} />Charge du jour</span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>La forme de fond monte lentement quand tu t’entraînes régulièrement. La fatigue réagit vite. Quand la fraîcheur est très négative plusieurs jours, il est temps d’alléger.</p>
      </section>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <section className="card">
          <div className="card-head"><h2>Volume par semaine</h2><span className="chip">12 sem.</span></div>
          <WeekBars weeks={d.weeks} />
        </section>
        <section className="card">
          <div className="card-head"><h2>Repères</h2></div>
          <dl className="grid" style={{ gridTemplateColumns: "1fr 1fr", margin: 0, gap: 10 }}>
            <Stat k="Ratio 7 j / 6 sem." v={s.ratio != null ? s.ratio.toFixed(2).replace(".", ",") : "—"} h="Entre 0,8 et 1,3 : progression maîtrisée" info={EXPLAIN.ratio} />
            <Stat k="Monotonie" v={s.monotony != null ? s.monotony.toFixed(1).replace(".", ",") : "—"} h="Au-delà de 2 : varie davantage les séances" info={EXPLAIN.monotony} />
            <Stat k="Forme de fond" v={fmtNum(s.ctl)} h="UA par jour, moyenne 42 j" info={EXPLAIN.ctl} />
            <Stat k="Fatigue" v={fmtNum(s.atl)} h="UA par jour, moyenne 7 j" info={EXPLAIN.atl} />
          </dl>
          <hr className="sep" />
          <h3>Répartition sur 4 semaines</h3>
          {sportTotal ? Object.entries(d.sports).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <div key={k} style={{ display: "grid", gap: 4 }}>
              <div className="row between small"><span>{SPORT_LABEL[k] ?? k}</span><span className="mono muted">{fmtDur(v)} · {Math.round((v / sportTotal) * 100)} %</span></div>
              <div className="meter"><i style={{ width: `${(v / sportTotal) * 100}%`, background: k === "trail" ? "var(--ember)" : k === "course" ? "var(--ember-2)" : "var(--soft)" }} /></div>
            </div>
          )) : <p className="muted small" style={{ margin: 0 }}>Pas de séance sur les 4 dernières semaines.</p>}
        </section>
      </div>
      <Vo2Card go={go} targets={me.targets} />
      <Progress />
    </>
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
        <path d={`${d} L${x(months.length - 1).toFixed(1)} ${H - P.b} L${x(0).toFixed(1)} ${H - P.b} Z`} fill="color-mix(in srgb, var(--ember) 14%, transparent)" />
        <path d={d} fill="none" stroke="var(--ember)" strokeWidth={2} strokeLinejoin="round" />
        {months.map((m, i) => <circle key={m.month} cx={x(i)} cy={y(m.value)} r={months.length > 24 ? 1.6 : 2.6} fill="var(--ember)"><title>{`${monthLabel(m.month)} : ${dec(m.value)} (${m.sessions} sortie(s))`}</title></circle>)}
        {ticks.map((i) => <text key={i} x={x(i)} y={H - 5} textAnchor={i === 0 ? "start" : i === months.length - 1 ? "end" : "middle"}>{monthLabel(months[i].month)}</text>)}
      </svg>
    </div>
  );
}

const Head = () => <header className="head"><div><span className="eyebrow">Moteur de charge</span><h1>Analyse</h1></div></header>;

function Stat({ k, v, h, info }: { k: string; v: string; h: string; info?: React.ReactNode }) {
  return <div className="kpi" style={{ padding: 12 }}><small>{k}{info && <InfoTip title={k}>{info}</InfoTip>}</small><b style={{ fontSize: 22 }}>{v}</b><span>{h}</span></div>;
}

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
        {points.map((p, i) => p.load > 0 && <rect key={p.date} x={x(i) - 1.5} width={3} y={H - P.b - (p.load / loadMax) * 46} height={(p.load / loadMax) * 46} fill="#243241" rx={1} />)}
        <path d={path("form")} fill="none" stroke="var(--ok)" strokeWidth={1.5} opacity={0.85} />
        <path d={path("atl")} fill="none" stroke="var(--ember)" strokeWidth={1.8} />
        <path d={path("ctl")} fill="none" stroke="var(--snow)" strokeWidth={2.4} />
        {[0, Math.floor(points.length / 2), points.length - 1].map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}>{dayLabel(points[i].date, { day: "numeric", month: "short" })}</text>)}
        {h && <g><line x1={x(hover!)} x2={x(hover!)} y1={P.t} y2={H - P.b} stroke="#ffffff40" /><circle cx={x(hover!)} cy={y(h.ctl)} r={3.5} fill="var(--snow)" /><circle cx={x(hover!)} cy={y(h.atl)} r={3.5} fill="var(--ember)" /></g>}
      </svg>
      {h && <div className="tip" style={{ left: `${(x(hover!) / W) * 100}%`, top: `${(y(Math.max(h.ctl, h.atl)) / H) * 100}%` }}>
        {dayLabel(h.date, { weekday: "short", day: "numeric", month: "short" })}<br />Forme {h.ctl} · Fatigue {h.atl}<br />Fraîcheur {h.form > 0 ? "+" : ""}{h.form} · Charge {h.load}
      </div>}
    </div>
  );
}

function WeekBars({ weeks }: { weeks: Data["weeks"] }) {
  const W = 360, H = 180, P = { l: 4, r: 4, t: 18, b: 22 };
  const max = Math.max(60, ...weeks.map((w) => w.minutes));
  const bw = (W - P.l - P.r) / weeks.length;
  const last = weeks[weeks.length - 1];
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Minutes d’entraînement par semaine">
        {weeks.map((w, i) => {
          const h = (w.minutes / max) * (H - P.t - P.b);
          return (
            <g key={w.week}>
              <rect x={P.l + i * bw + 3} width={bw - 6} y={H - P.b - h} height={Math.max(h, 1)} rx={3} fill={i === weeks.length - 1 ? "var(--ember)" : "#2c3b4a"}><title>{`${dayLabel(w.week, { day: "numeric", month: "short" })} : ${fmtDur(w.minutes)}, ${w.km} km, ${w.gain} m D+`}</title></rect>
              {i % 3 === 0 && <text x={P.l + i * bw + bw / 2} y={H - 6} textAnchor="middle">{dayLabel(w.week, { day: "numeric", month: "short" })}</text>}
            </g>
          );
        })}
      </svg>
      <div className="row small muted"><span>Cette semaine :</span><b className="mono" style={{ color: "var(--snow)" }}>{fmtDur(last?.minutes ?? 0)}</b><span>· {last?.km ?? 0} km · {fmtNum(last?.gain ?? 0)} m D+ · {last?.sessions ?? 0} séance(s)</span></div>
    </>
  );
}
