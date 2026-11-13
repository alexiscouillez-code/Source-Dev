"use client";

import { useState, type ReactNode, type PointerEvent } from "react";
import { dayLabel, fmtDur, fmtKm, fmtNum } from "./client";

/**
 * Cartes graphiques interactives de l’onglet Analyse : volume (courbe), intensité (anneau),
 * charge (barres) et récupération (jauge). Survol ou toucher : la valeur exacte s’affiche.
 * Chaque carte passe du vert au rouge quand son indicateur est en alerte, et se retourne
 * (« Comprendre ») pour expliquer ce qu’elle mesure et quoi faire.
 */
export interface GraphData {
  weeks: { week: string; minutes: number; km: number; gain: number; load: number; sessions: number }[];
  points: { date: string; load: number }[];
  summary: { form: number; ratio: number | null; calibrated: boolean };
  intensity: { easy: number; moderate: number; hard: number };
  recovery: { date: string; score: number | null }[];
}

export default function GraphCards({ d }: { d: GraphData }) {
  return (
    <section className="gcards" aria-label="Indicateurs en un coup d’œil">
      <VolumeCard weeks={d.weeks.slice(-8)} />
      <IntensityCard v={d.intensity} />
      <LoadCard points={d.points.slice(-14)} ratio={d.summary.ratio} calibrated={d.summary.calibrated} />
      <RecoveryCard days={d.recovery} form={d.summary.form} />
    </section>
  );
}

/* ---------- Carte générique : face (graphique) et dos (explication) ---------- */
function Card({ kicker, title, status, alert, back, children }: { kicker: string; title: ReactNode; status: string; alert: boolean; back: ReactNode; children: ReactNode }) {
  const [flip, setFlip] = useState(false);
  return (
    <article className={`gcard${alert ? " is-alert" : ""}${flip ? " is-flipped" : ""}`}>
      <div className="gc-inner">
        <div className="gc-face gc-front">
          <header className="gc-head">
            <div><span className="eyebrow">{kicker}</span><h3>{title}</h3></div>
            <span className="gc-status" key={status} role="status">{status}</span>
          </header>
          {children}
          <button type="button" className="gc-more" onClick={() => setFlip(true)}>Comprendre</button>
        </div>
        <div className="gc-face gc-back">
          <header className="gc-head"><div><span className="eyebrow">{kicker}</span><h3>Comment la lire</h3></div><span className="gc-status">{status}</span></header>
          <div className="gc-text">{back}</div>
          <button type="button" className="gc-more" onClick={() => setFlip(false)}>Retour au graphique</button>
        </div>
      </div>
    </article>
  );
}

/**
 * Index survolé / touché. Souris : la valeur suit le survol et s’efface à la sortie.
 * Doigt : un toucher affiche la valeur, un second toucher au même endroit l’efface.
 */
type PE = { pointerType: string };
function useHover() {
  const [i, setI] = useState<number | null>(null);
  return {
    i, set: setI,
    on: (k: number) => (e?: PE) => { if (!e || e.pointerType === "mouse") setI(k); },
    off: (e?: PE) => { if (!e || e.pointerType === "mouse") setI(null); },
    tap: (k: number) => (e: { nativeEvent: Event }) => { const t = (e.nativeEvent as unknown as PE).pointerType; setI((c) => (t && t !== "mouse" && c === k ? null : k)); },
  };
}
const Tip = ({ x, children }: { x: number; children: ReactNode }) => (
  <div className="gc-tip" style={{ left: `${Math.max(14, Math.min(86, x))}%` }}>{children}</div>
);
const Empty = ({ children }: { children: ReactNode }) => <div className="gc-empty">{children}</div>;

/* ---------- Volume : courbe des 8 dernières semaines ---------- */
function VolumeCard({ weeks }: { weeks: GraphData["weeks"] }) {
  const [hi, setHi] = useState<number | null>(null);
  const n = weeks.length, max = Math.max(1, ...weeks.map((w) => w.km));
  const cur = weeks[n - 1], last = weeks[n - 2];
  const base = weeks.slice(Math.max(0, n - 6), n - 2), avg = base.length ? base.reduce((t, w) => t + w.km, 0) / base.length : 0;
  const delta = last && avg > 5 ? Math.round(((last.km - avg) / avg) * 100) : null;
  const alert = delta != null && delta > 30;
  const X = (i: number) => (n > 1 ? (i / (n - 1)) * 300 : 150), Y = (v: number) => 96 - (v / max) * 84;
  const line = weeks.map((w, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(w.km).toFixed(1)}`).join(" ");
  const move = (e: PointerEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); setHi(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))))); };
  const h = hi != null ? weeks[hi] : null;
  return (
    <Card kicker="Volume · 8 semaines" title={<><b className="gc-big">{fmtKm(cur?.km ?? 0)}</b> km cette semaine</>} alert={alert}
      status={alert ? "Surcharge" : delta == null ? "À construire" : `${delta > 0 ? "+" : ""}${delta} %`}
      back={<><p>Tes kilomètres à pied, semaine par semaine. Le pourcentage compare ta dernière semaine complète à la moyenne des quatre précédentes.</p><p><b>Repère :</b> au-delà de +30 % d’un coup, le risque de blessure grimpe. Vise plutôt +10 % par semaine, avec une semaine allégée toutes les trois ou quatre.</p></>}>
      {max <= 1 && !weeks.some((w) => w.km) ? <Empty>Ajoute tes sorties pour voir ton volume.</Empty> : (
        <div className="gc-plot" onPointerMove={move} onPointerDown={move} onPointerLeave={(e) => { if (e.pointerType === "mouse") setHi(null); }}>
          <svg viewBox="0 0 300 100" preserveAspectRatio="none" aria-hidden="true">
            <path className="gc-area" d={`${line} L300 100 L0 100 Z`} />
            <path className="gc-line" d={line} pathLength={1} vectorEffect="non-scaling-stroke" />
            {h && <line className="gc-rule" x1={X(hi!)} x2={X(hi!)} y1="0" y2="100" vectorEffect="non-scaling-stroke" />}
          </svg>
          {weeks.map((w, i) => <i key={w.week} className={`gc-dot${hi === i ? " on" : ""}${i === n - 1 ? " now" : ""}`} style={{ left: `${(X(i) / 300) * 100}%`, top: `${Y(w.km)}%` }} />)}
          {h && <Tip x={(X(hi!) / 300) * 100}><b>{fmtKm(h.km)} km</b>{fmtDur(h.minutes)} · {fmtNum(h.gain)} m D+<small>sem. du {dayLabel(h.week, { day: "numeric", month: "short" })}</small></Tip>}
        </div>
      )}
      <div className="gc-axis"><span>{weeks[0] ? dayLabel(weeks[0].week, { day: "numeric", month: "short" }) : ""}</span><span>cette sem.</span></div>
    </Card>
  );
}

/* ---------- Intensité : anneau facile / modéré / intense sur 28 jours ---------- */
function IntensityCard({ v }: { v: GraphData["intensity"] }) {
  const hov = useHover();
  const segs = [
    { key: "Facile", note: "effort 1 à 4", minutes: v.easy, cls: "s-easy" },
    { key: "Modéré", note: "effort 5 à 6", minutes: v.moderate, cls: "s-mod" },
    { key: "Intense", note: "effort 7 à 10", minutes: v.hard, cls: "s-hard" },
  ];
  const total = segs.reduce((t, s) => t + s.minutes, 0);
  const pct = (m: number) => (total ? Math.round((m / total) * 100) : 0);
  const alert = total >= 120 && pct(v.hard) > 25;
  const C = 2 * Math.PI * 40;
  let acc = 0;
  const sel = hov.i != null ? segs[hov.i] : null;
  return (
    <Card kicker="Intensité · 28 jours" title={<><b className="gc-big">{pct(v.easy)} %</b> en facile</>} alert={alert}
      status={!total ? "À construire" : alert ? "Trop d’intense" : "Équilibrée"}
      back={<><p>La part de ton temps d’entraînement passée en facile, modéré et intense, d’après l’effort de chaque séance.</p><p><b>Repère :</b> environ 80 % en facile et 20 % plus dur. Au-delà de 25 % en intense, la fatigue s’installe sans faire progresser davantage.</p></>}>
      {!total ? <Empty>Pas encore de séance sur 28 jours.</Empty> : (
        <div className="gc-ring">
          <svg viewBox="0 0 100 100" role="img" aria-label={segs.map((s) => `${s.key} ${pct(s.minutes)} %`).join(", ")}>
            <circle className="gc-track" cx="50" cy="50" r="40" />
            {segs.map((s, i) => {
              const len = (s.minutes / total) * C, off = acc; acc += len;
              return len > 0.5 ? <circle key={s.key} className={`gc-seg ${s.cls}${hov.i === i ? " on" : ""}`} cx="50" cy="50" r="40" strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-off} style={{ ["--C" as string]: C, ["--i" as string]: i }} onPointerEnter={hov.on(i)} onPointerLeave={hov.off} onClick={hov.tap(i)} /> : null;
            })}
          </svg>
          <div className="gc-ring-mid"><b>{sel ? `${pct(sel.minutes)} %` : fmtDur(total)}</b><small>{sel ? `${sel.key} · ${fmtDur(sel.minutes)}` : "au total"}</small></div>
          <ul className="gc-legend">
            {segs.map((s, i) => <li key={s.key} className={hov.i === i ? "on" : ""} onPointerEnter={hov.on(i)} onPointerLeave={hov.off} onClick={hov.tap(i)}><i className={s.cls} /><span>{s.key}<small>{s.note}</small></span><b>{pct(s.minutes)} %</b></li>)}
          </ul>
        </div>
      )}
    </Card>
  );
}

/* ---------- Charge : barres des 14 derniers jours ---------- */
function LoadCard({ points, ratio, calibrated }: { points: GraphData["points"]; ratio: number | null; calibrated: boolean }) {
  const hov = useHover();
  const max = Math.max(1, ...points.map((p) => p.load));
  const alert = calibrated && ratio != null && ratio > 1.3;
  const low = calibrated && ratio != null && ratio < 0.8;
  const h = hov.i != null ? points[hov.i] : null;
  return (
    <Card kicker="Charge · 14 jours" title={<><b className="gc-big">{ratio != null ? ratio.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</b> rythme de progression</>} alert={alert}
      status={!calibrated ? "Calibrage" : alert ? "Pic de charge" : low ? "En retrait" : "Maîtrisée"}
      back={<><p>La charge de chaque jour (durée × intensité). Le ratio compare tes 7 derniers jours à ta moyenne sur 6 semaines.</p><p><b>Repère :</b> entre 0,8 et 1,3 tu progresses sans te mettre en danger. Au-dessus de 1,3, tu en fais nettement plus que ce que ton corps a l’habitude d’encaisser : allège deux ou trois jours.</p></>}>
      {!points.some((p) => p.load) ? <Empty>Aucune charge enregistrée sur 14 jours.</Empty> : (
        <div className="gc-plot gc-bars" onPointerLeave={hov.off}>
          {points.map((p, i) => (
            <button type="button" key={p.date} className={hov.i === i ? "on" : ""} onPointerEnter={hov.on(i)} onFocus={() => hov.set(i)} onBlur={() => hov.set(null)} onClick={() => hov.set(i)} aria-label={`${dayLabel(p.date, { weekday: "long", day: "numeric", month: "long" })} : charge ${fmtNum(p.load)}`}>
              <i style={{ height: `${Math.max(p.load ? 4 : 1.5, (p.load / max) * 100)}%`, ["--d" as string]: `${i * 30}ms` }} />
            </button>
          ))}
          {h && <Tip x={((hov.i! + 0.5) / points.length) * 100}><b>Charge {fmtNum(h.load)}</b><small>{dayLabel(h.date, { weekday: "short", day: "numeric", month: "short" })}</small></Tip>}
        </div>
      )}
      <div className="gc-axis"><span>il y a 14 j</span><span>aujourd’hui</span></div>
    </Card>
  );
}

/* ---------- Récupération : jauge du ressenti + 7 derniers check-ins ---------- */
function RecoveryCard({ days, form }: { days: GraphData["recovery"]; form: number }) {
  const hov = useHover();
  const done = days.filter((x) => x.score != null) as { date: string; score: number }[];
  const recent = done.slice(-3), score = recent.length ? Math.round(recent.reduce((t, x) => t + x.score, 0) / recent.length) : null;
  const alert = (score != null && score < 50) || form <= -25;
  const c = Math.PI * 40, off = c * (1 - (score ?? 0) / 100);
  const h = hov.i != null ? days[hov.i] : null;
  return (
    <Card kicker="Récupération · 7 jours" title={<><b className="gc-big">{score ?? "—"}</b>{score != null ? " / 100 de ressenti" : " pas de check-in"}</>} alert={alert}
      status={score == null && !alert ? "À renseigner" : alert ? "À surveiller" : score != null && score >= 70 ? "Bonne" : "Correcte"}
      back={<><p>Le ressenti de tes trois derniers check-ins (sommeil, jambes, motivation, douleur), noté sur 100. La fraîcheur compare ta fatigue récente à ta forme de fond.</p><p><b>Repère :</b> sous 50 de ressenti ou sous −25 de fraîcheur, la fatigue domine. Remplace la prochaine séance dure par du facile ou du repos.</p></>}>
      <div className="gc-gauge">
        <svg viewBox="0 0 100 58" aria-hidden="true">
          <path className="gc-track" d="M10 52 A40 40 0 0 1 90 52" />
          <path className="gc-gauge-val" d="M10 52 A40 40 0 0 1 90 52" strokeDasharray={c} strokeDashoffset={off} style={{ ["--off" as string]: off, ["--c" as string]: c }} />
          {score != null && <g className="gc-needle" style={{ ["--a" as string]: `${-90 + (180 * score) / 100}deg` }}><line x1="50" y1="52" x2="50" y2="20" /><circle cx="50" cy="52" r="3.2" /></g>}
        </svg>
        <div className="gc-gauge-mid"><b>{form > 0 ? "+" : ""}{fmtNum(form)}</b><small>fraîcheur</small></div>
      </div>
      <div className="gc-plot gc-days" onPointerLeave={hov.off}>
        {days.map((x, i) => (
          <button type="button" key={x.date} className={`${x.score == null ? "none" : x.score < 50 ? "bad" : ""}${hov.i === i ? " on" : ""}`} onPointerEnter={hov.on(i)} onFocus={() => hov.set(i)} onBlur={() => hov.set(null)} onClick={() => hov.set(i)}
            aria-label={`${dayLabel(x.date, { weekday: "long", day: "numeric" })} : ${x.score == null ? "pas de check-in" : `ressenti ${x.score} sur 100`}`}>
            <i style={{ height: `${x.score == null ? 8 : Math.max(12, x.score)}%` }} /><small>{dayLabel(x.date, { weekday: "narrow" })}</small>
          </button>
        ))}
        {h && <Tip x={((hov.i! + 0.5) / days.length) * 100}><b>{h.score == null ? "Pas de check-in" : `${h.score} / 100`}</b><small>{dayLabel(h.date, { weekday: "long", day: "numeric" })}</small></Tip>}
      </div>
    </Card>
  );
}
