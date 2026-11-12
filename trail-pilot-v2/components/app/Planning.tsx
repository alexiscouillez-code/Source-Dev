"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { buzz, withTransition } from "./motion";
import { downloadWorkout } from "./workout";
import type { Ctx } from "./AppShell";
import { api, dayLabel, dayNum, fmtDur, fmtKm, fmtNum, localToday, PRESET_KEY, shortDay, type PlanSession, type Absence, type Review } from "./client";
import { IconCheck, IconSkip, IconTerrain, IconUndo, IconWatch } from "./icons";
import Flap from "./Flap";
import { StatusChip } from "./Today";
import { SessionTarget } from "./Targets";
import { dayOf, useForecast } from "./useForecast";
import type { Targets } from "./client";
import RaceStrategy from "./RaceStrategy";
import RaceWeather from "./RaceWeather";
import SideRaces, { type SideRaceRow } from "./SideRaces";
import PlanCalendar from "./PlanCalendar";
import Fold, { useFold } from "./Fold";
import type { RaceRoute, WeatherAdjust } from "@/lib/engine/strategy";

type Verdict = "solide" | "ambitieux" | "risque" | "court";
interface PlanWeek { monday: string; phase: string; minutes: number; longMin: number; gainM: number; focus: string; light: boolean }
interface RacePlan {
  generatedOn: string;
  race: { name: string; date: string; distanceKm: number; gainM: number; effortKm: number; daysTo: number; assumed: boolean };
  estimate: { low: number; high: number }; estimateFrom?: "vo2" | "niveau";
  demands: { weeklyMin: number; longMin: number; weeklyGain: number; backToBack: boolean };
  current: { weeklyMin: number; longestMin: number; weeklyGain: number; hasHistory: boolean };
  reach: { weeklyMin: number; longMin: number };
  verdict: Verdict; headline: string; notes: string[]; weeks: PlanWeek[];
  diagnosis?: { causes: string[]; fixes: string[]; gaps?: { key: string; label: string; reach: number; need: number; unit: "min" | "m" }[]; options?: { title: string; text: string }[]; keep?: string };
}
type Session = PlanSession;
interface View { today: string; goal: { name: string; date: string; distance_km: number | null; gain_m: number | null; route?: RaceRoute | null } | null; plan: RacePlan | null; sessions: Session[]; doneByWeek: Record<string, number>; races: SideRaceRow[]; absence?: Absence | null; learning?: { items: { kind: string; text: string; changes: boolean }[]; off: boolean } }

const VERDICT: Record<Verdict, { label: string; color: string }> = {
  solide: { label: "Objectif solide", color: "var(--ok)" },
  ambitieux: { label: "Ambitieux mais jouable", color: "var(--lite)" },
  risque: { label: "Objectif risqué", color: "var(--danger)" },
  court: { label: "Course très proche", color: "var(--rest)" },
};
const PHASE_COLOR: Record<string, string> = {
  Fondation: "var(--chart-bar-2)", "Développement": "var(--ember-2)", "Spécifique": "var(--ember)",
  "Affûtage": "var(--ok)", "Semaine de course": "var(--snow)", Entretien: "var(--chart-bar-2)",
};
const monday = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

export default function Planning({ me, refresh, toast, go }: Ctx) {
  // Ouvre l’onglet Terrains avec les réglages de la séance.
  const whereTo = (s: Pick<PlanSession, "title" | "date" | "template" | "duration_min" | "gain_m">) => {
    try { sessionStorage.setItem(PRESET_KEY, JSON.stringify({ title: s.title, date: s.date, template: s.template, durationMin: s.duration_min, gainM: s.gain_m })); } catch { /* stockage indisponible */ }
    go("terrains");
  };
  const [v, setV] = useState<View | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wx, setWx] = useState<WeatherAdjust | null>(null);

  // Avec `morph`, la liste se réorganise en transition de vue : chaque séance glisse vers sa nouvelle place.
  const [rev, setRev] = useState(0);
  const load = useCallback(async (morph = false) => { const d = await api<View>("/api/plan"); if (morph) withTransition(() => flushSync(() => setV(d))); else setV(d); setRev((n) => n + 1); }, []);
  useEffect(() => { load().catch((e) => toast(e.message)); }, [load, toast]);
  useEffect(() => { const on = () => { load().catch(() => {}); }; window.addEventListener("tp-synced", on); return () => window.removeEventListener("tp-synced", on); }, [load]);

  async function recalc() {
    setBusy(true);
    try { await api("/api/plan", { method: "POST" }); await Promise.all([load(), refresh()]); toast("Plan recalculé avec ta charge actuelle."); }
    catch (e) { toast(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); }
  }
  async function setStatus(s: Session, status: string) {
    try {
      const flight = status === "done" ? flyCheck(s.id) : null;
      if (status === "done") buzz(18);
      await api(`/api/plan/${s.id}`, { method: "PATCH", body: { status } });
      await flight;
      await Promise.all([load(true), refresh()]);
    }
    catch (e) { toast(e instanceof Error ? e.message : "Erreur"); }
  }
  // Glisser-déposer : la séance prend le jour visé ; celle qui s’y trouvait (si elle est déplaçable) prend l’ancien jour.
  async function move(a: Session, b: Session) {
    try {
      await api(`/api/plan/${a.id}`, { method: "PATCH", body: { date: b.date } });
      if (movable(b, v!.today)) await api(`/api/plan/${b.id}`, { method: "PATCH", body: { date: a.date } });
      buzz([10, 40, 10]);
      await Promise.all([load(true), refresh()]);
      toast(`${a.title} déplacée au ${dayLabel(b.date, { weekday: "long", day: "numeric", month: "long" })}.`);
    } catch (e) { toast(e instanceof Error ? e.message : "Erreur"); }
  }
  // Calendrier : la séance va au jour touché ; si une séance déplaçable s’y trouve, elles échangent leurs jours.
  async function moveTo(a: Session, date: string, swap: Session | null) {
    try {
      await api(`/api/plan/${a.id}`, { method: "PATCH", body: { date } });
      if (swap) await api(`/api/plan/${swap.id}`, { method: "PATCH", body: { date: a.date } });
      buzz([10, 40, 10]);
      await Promise.all([load(), refresh()]);
      toast(`${a.title} déplacée au ${dayLabel(date, { weekday: "long", day: "numeric", month: "long" })}.`);
    } catch (e) { toast(e instanceof Error ? e.message : "Erreur"); }
  }
  async function restore(s: Session) {
    try { await api(`/api/plan/${s.id}`, { method: "PATCH", body: { restore: true } }); await Promise.all([load(), refresh()]); toast("Séance prévue rétablie."); }
    catch (e) { toast(e instanceof Error ? e.message : "Erreur"); }
  }
  const noted = async () => { await Promise.all([load(), refresh()]); };
  const [away, setAway] = useState(false);
  const saved = async (msg: string) => { setEditing(false); await Promise.all([load(), refresh()]); toast(msg); };

  if (!v) return <><Head /><div className="skeleton" /></>;

  if (!v.goal || !v.plan || editing) {
    return (
      <>
        <Head sub={v.goal && !editing ? "Course passée" : undefined} />
        <RaceForm goal={v.goal} today={v.today} onSaved={saved} onCancel={editing ? () => setEditing(false) : undefined} />
        {!v.goal && v.sessions.length > 0 && (
          <section className="card" style={{ marginTop: 14 }}>
            <div className="card-head"><h2>En attendant : entretien</h2><div className="row"><button className="btn ghost sm" onClick={() => setAway(true)}>Imprévu</button><button className="btn ghost sm" onClick={recalc} disabled={busy}>Recalculer</button></div></div>
            <AbsenceBanner a={v.absence ?? null} today={v.today} onEdit={() => setAway(true)} onCancel={async () => { try { await api(`/api/absence?today=${v.today}`, { method: "DELETE" }); await Promise.all([load(), refresh()]); toast("Imprévu annulé."); } catch (e) { toast(e instanceof Error ? e.message : "Erreur"); } }} />
            <LearningCard l={v.learning} onToggle={async (off) => { try { await api("/api/plan", { method: "PATCH", body: { learningOff: off, today: v.today } }); await Promise.all([load(), refresh()]); toast(off ? "Plan d’origine rétabli, sans ajustement." : "Ajustements réactivés."); } catch (e) { toast(e instanceof Error ? e.message : "Erreur"); } }} />
      {away && <AbsenceSheet a={v.absence ?? null} today={v.today} onClose={() => setAway(false)} onSaved={async (msg) => { setAway(false); await Promise.all([load(), refresh()]); toast(msg); }} />}
            <p className="muted small" style={{ margin: 0 }}>Sans course choisie, Trail Pilot te propose 3 semaines pour garder ta forme, à partir de ce que tu fais en ce moment.</p>
            <PlanBoard today={v.today} rev={rev} targets={me.targets} onStatus={setStatus} onWhere={whereTo} onMoveTo={moveTo} onRestore={restore} onChanged={noted}>
              <WeekList sessions={v.sessions} weeks={[]} today={me.today} doneByWeek={v.doneByWeek} onStatus={setStatus} targets={me.targets} onWhere={whereTo} onMove={move} />
            </PlanBoard>
          </section>
        )}
        {!editing && <SideRaces races={v.races} today={v.today} mainDate={null} toast={toast} onChanged={async () => { await Promise.all([load(), refresh()]); }} />}
      </>
    );
  }

  const p = v.plan;
  return (
    <>
      <Head sub={`${p.weeks.length} semaines · recalculé chaque lundi`} action={
        <div className="row">
          <button className="btn ghost sm" onClick={() => setAway(true)}>Imprévu</button>
          <button className="btn ghost sm" onClick={recalc} disabled={busy}>{busy ? "Calcul…" : "Recalculer avec ma forme"}</button>
          <button className="btn ghost sm" onClick={() => setEditing(true)}>Changer de course</button>
        </div>
      } />
      <AbsenceBanner a={v.absence ?? null} today={v.today} onEdit={() => setAway(true)} onCancel={async () => { try { await api(`/api/absence?today=${v.today}`, { method: "DELETE" }); await Promise.all([load(), refresh()]); toast("Imprévu annulé : ton plan reprend son cours."); } catch (e) { toast(e instanceof Error ? e.message : "Erreur"); } }} />
      <LearningCard l={v.learning} onToggle={async (off) => { try { await api("/api/plan", { method: "PATCH", body: { learningOff: off, today: v.today } }); await Promise.all([load(), refresh()]); toast(off ? "Plan d’origine rétabli, sans ajustement." : "Ajustements réactivés."); } catch (e) { toast(e instanceof Error ? e.message : "Erreur"); } }} />
      {away && <AbsenceSheet a={v.absence ?? null} today={v.today} onClose={() => setAway(false)} onSaved={async (msg) => { setAway(false); await Promise.all([load(), refresh()]); toast(msg); }} />}
      <RaceHeader p={p} />
      <section className="card plan-board" style={{ marginTop: 14 }}>
        <PlanBoard today={v.today} rev={rev} targets={me.targets} onStatus={setStatus} onWhere={whereTo} onMoveTo={moveTo} onRestore={restore} onChanged={noted}>
          <WeekList sessions={v.sessions} weeks={p.weeks} today={v.today} doneByWeek={v.doneByWeek} onStatus={setStatus} targets={me.targets} onWhere={whereTo} onMove={move} />
        </PlanBoard>
      </section>
      <RaceWeather key={v.goal.route?.uploadedAt ?? 0} toast={toast} onAdjust={setWx} />
      <RaceStrategy raceName={v.goal.name} raceDate={v.goal.date} route={v.goal.route ?? null} estimate={p.estimate} weather={wx} toast={toast} onChanged={async () => { await Promise.all([load(), refresh()]); }} />
      <SideRaces races={v.races} today={v.today} mainDate={v.goal.date} toast={toast} onChanged={async () => { await Promise.all([load(), refresh()]); }} />
      <div className="grid g2 folds" style={{ marginTop: 14 }}>
        <Needs p={p} />
        <Fold id="plan-volume" title="Volume semaine par semaine" aside={<span className="chip">{p.weeks.length} semaines</span>}>
          <WeekChart weeks={p.weeks} done={v.doneByWeek} today={v.today} />
          <div className="legend">
            {["Fondation", "Développement", "Spécifique", "Affûtage"].filter((ph) => p.weeks.some((w) => w.phase === ph)).map((ph) => <span key={ph}><i style={{ background: PHASE_COLOR[ph], height: 8 }} />{ph}</span>)}
            <span><i style={{ background: "var(--snow)", height: 3 }} />Réalisé</span>
          </div>
        </Fold>
      </div>
      <p className="muted small" style={{ marginTop: 12, maxWidth: "75ch" }}>
        Le plan part de ta charge réelle (séances des 4 dernières semaines, fatigue et forme de fond) et se recalcule chaque lundi.
        Chaque check-in du matin adapte la séance du jour. Une sortie enregistrée (Strava ou fichier) valide automatiquement la séance prévue ce jour-là. Progression de {me.profile.level === "debutant" ? "6" : me.profile.level === "confirme" ? "10" : "8"} % par semaine au plus, une semaine plus légère toutes les quatre.
      </p>
    </>
  );
}

/** Le planning en deux vues : calendrier du mois (par défaut) ou liste des semaines. Le choix est retenu sur l’appareil. */
function PlanBoard({ children, ...cal }: { children: React.ReactNode } & React.ComponentProps<typeof PlanCalendar>) {
  const [view, setView] = useState<"cal" | "list">("cal");
  useEffect(() => { try { if (localStorage.getItem("tp-plan-view") === "list") setView("list"); } catch { /* stockage indisponible */ } }, []);
  const choose = (x: "cal" | "list") => { setView(x); try { localStorage.setItem("tp-plan-view", x); } catch { /* stockage indisponible */ } };
  return (
    <>
      <div className="view-switch" role="tablist" aria-label="Affichage du planning">
        <button role="tab" aria-selected={view === "cal"} className={view === "cal" ? "on" : ""} onClick={() => choose("cal")}>Calendrier</button>
        <button role="tab" aria-selected={view === "list"} className={view === "list" ? "on" : ""} onClick={() => choose("list")}>Liste</button>
      </div>
      {view === "cal" ? <PlanCalendar {...cal} /> : children}
    </>
  );
}

function Head({ sub, action }: { sub?: string; action?: React.ReactNode }) {
  return <header className="head"><div><span className="eyebrow">{sub ?? "Plan d’entraînement"}</span><h1>Planning</h1></div>{action}</header>;
}

// ---------- En-tête de course ----------
function RaceHeader({ p }: { p: RacePlan }) {
  const vd = VERDICT[p.verdict];
  const g = p.diagnosis?.gaps, opts = p.diagnosis?.options;
  const [fixOpen, setFixOpen] = useFold("plan-risk-fix", false);
  return (
    <section className="card race" style={{ ["--accent" as string]: vd.color }}>
      <div className="race-top">
        <div style={{ minWidth: 0 }}>
          <span className="eyebrow">Ma course · {dayLabel(p.race.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
          <h2 className="race-name">{p.race.name}</h2>
          <div className="specs">
            <div><b><Flap days={p.race.daysTo} className="flap-lg" /></b><small>Compte à rebours</small></div>
            <div><b>{fmtKm(p.race.distanceKm)} km</b><small>Distance</small></div>
            <div><b>{fmtNum(p.race.gainM)} m</b><small>D+</small></div>
            <div><b>{p.race.effortKm}</b><small>Km-effort</small></div>
          </div>
        </div>
        <div className="race-time">
          <small>Temps estimé pour finir</small>
          <b>{fmtDur(p.estimate.low)} – {fmtDur(p.estimate.high)}</b>
          <span>{p.estimateFrom === "vo2" ? "d’après ta VO2max" : "à ton niveau actuel"}</span>
        </div>
      </div>
      <div className="race-verdict">
        <span className="chip" style={{ color: vd.color, borderColor: `color-mix(in srgb, ${vd.color} 45%, transparent)` }}><span className="dot" />{vd.label}</span>
        <p>{p.headline}</p>
        {g && g.length > 0 && (
          <ul className="gaps" aria-label="Ce que le plan atteint par rapport à ce que demande la course">
            {g.map((x) => {
              const pct = Math.round((x.reach / Math.max(1, x.need)) * 100), f = (n: number) => (x.unit === "min" ? fmtDur(n) : `${fmtNum(n)} m`);
              return (
                <li key={x.key}>
                  <span className="gap-k">{x.label}</span>
                  <span className="gap-v"><b>{f(x.reach)}</b> sur {f(x.need)} · {pct} %</span>
                  <i className="gap-bar" role="img" aria-label={`${pct} % de ce que demande la course`}><i style={{ width: `${Math.min(100, pct)}%` }} /></i>
                </li>
              );
            })}
          </ul>
        )}
        {p.notes.length > 0 && <ul className="race-notes">{p.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        {opts && opts.length > 0 && (
          <div className="risk-fix">
            <button className="btn ghost sm" aria-expanded={fixOpen} onClick={() => setFixOpen(!fixOpen)}>{fixOpen ? "Masquer les pistes" : `Comment ${p.verdict === "risque" ? "réduire le risque" : "gagner de la marge"} · ${opts.length} piste${opts.length > 1 ? "s" : ""}`}</button>
            {fixOpen && (
              <>
                <ol className="fix-list">{opts.map((o) => <li key={o.title}><b>{o.title}</b><span>{o.text}</span></li>)}</ol>
                {p.diagnosis?.keep && <p className="fix-keep"><b>Si tu gardes cette course.</b> {p.diagnosis.keep}</p>}
              </>
            )}
          </div>
        )}
      </div>
      {!g && p.diagnosis && (p.diagnosis.causes.length > 0 || p.diagnosis.fixes.length > 0) && (
        <div className="diag">
          {p.diagnosis.causes.length > 0 && (
            <div><h3>Pourquoi c’est {p.verdict === "risque" ? "risqué" : "ambitieux"}</h3><ul>{p.diagnosis.causes.map((c) => <li key={c}>{c}</li>)}</ul></div>
          )}
          <div><h3>Comment le corriger</h3><ol>{p.diagnosis.fixes.map((f) => <li key={f}>{f}</li>)}</ol></div>
        </div>
      )}
    </section>
  );
}

// ---------- Ce qu’il faut pour finir ----------
function Needs({ p }: { p: RacePlan }) {
  const rows = [
    { k: "Volume par semaine", now: p.current.weeklyMin, reach: p.reach.weeklyMin, need: p.demands.weeklyMin, fmt: fmtDur },
    { k: "Sortie longue", now: p.current.longestMin, reach: p.reach.longMin, need: p.demands.longMin, fmt: fmtDur },
    { k: "Dénivelé par semaine", now: p.current.weeklyGain, reach: Math.max(...p.weeks.map((w) => w.gainM)), need: p.demands.weeklyGain, fmt: (n: number) => `${fmtNum(n)} m` },
  ];
  return (
    <Fold id="plan-needs" title="Ce qu’il faut pour finir" aside={<span className="chip dim">{rows.filter((r) => r.reach >= r.need * 0.95).length}/{rows.length} repères atteints</span>}>
      {rows.map((r) => {
        const max = Math.max(r.need, r.reach, r.now) || 1;
        return (
          <div key={r.k} className="need">
            <div className="row between small"><span className="soft">{r.k}</span><span className="mono">{r.fmt(r.now)} <span className="muted">→</span> <b>{r.fmt(r.reach)}</b> <span className="muted">/ {r.fmt(r.need)}</span></span></div>
            <div className="need-bar" role="img" aria-label={`${r.k} : aujourd’hui ${r.fmt(r.now)}, atteint par le plan ${r.fmt(r.reach)}, conseillé ${r.fmt(r.need)}`}>
              <i className="reach" style={{ width: `${(r.reach / max) * 100}%`, background: r.reach >= r.need * 0.95 ? "var(--ok)" : "var(--lite)" }} />
              <i className="now" style={{ width: `${(r.now / max) * 100}%` }} />
              <b style={{ left: `${(r.need / max) * 100}%` }} />
            </div>
          </div>
        );
      })}
      <div className="row small muted" style={{ gap: 14 }}>
        <span><i className="key now" />Aujourd’hui</span><span><i className="key reach" />Atteint par le plan</span><span><i className="key need" />Conseillé pour finir</span>
      </div>
      {p.demands.backToBack && <p className="muted small" style={{ margin: 0 }}>Au-delà de 6 h de course, les sorties longues sont complétées par des enchaînements sur deux jours plutôt que rallongées sans fin.</p>}
    </Fold>
  );
}

// ---------- Graphique des semaines ----------
function WeekChart({ weeks, done, today }: { weeks: PlanWeek[]; done: Record<string, number>; today: string }) {
  const W = 360, H = 170, P = { l: 4, r: 4, t: 14, b: 20 };
  const max = Math.max(60, ...weeks.map((w) => Math.max(w.minutes, done[w.monday] ?? 0)));
  const bw = (W - P.l - P.r) / weeks.length;
  const y = (m: number) => H - P.b - (m / max) * (H - P.t - P.b);
  const cur = monday(today);
  const every = Math.max(1, Math.ceil(weeks.length / 6));
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Volume prévu et réalisé par semaine jusqu’à la course">
      {weeks.map((w, i) => {
        const x = P.l + i * bw;
        const d = done[w.monday];
        const isCur = w.monday === cur;
        return (
          <g key={w.monday}>
            <rect x={x + bw * 0.12} width={bw * 0.76} y={y(w.minutes)} height={Math.max(1, H - P.b - y(w.minutes))} rx={Math.min(3, bw / 4)}
              style={{ fill: PHASE_COLOR[w.phase] ?? "var(--chart-bar-2)", opacity: w.monday < cur ? 0.45 : w.light ? 0.6 : 1 }}>
              <title>{`Semaine du ${dayLabel(w.monday, { day: "numeric", month: "short" })} · ${w.phase} · ${fmtDur(w.minutes)} prévues${d ? `, ${fmtDur(d)} faites` : ""}`}</title>
            </rect>
            {d != null && w.monday <= cur && <rect x={x + bw * 0.38} width={bw * 0.24} y={y(d)} height={Math.max(1, H - P.b - y(d))} rx={1} style={{ fill: "var(--snow)" }} />}
            {isCur && <rect x={x + 1} y={P.t - 6} width={bw - 2} height={H - P.b - P.t + 6} rx={4} fill="none" style={{ stroke: "var(--ember)" }} strokeDasharray="3 3" />}
            {i % every === 0 && <text x={x + bw / 2} y={H - 5} textAnchor="middle">{dayLabel(w.monday, { day: "numeric", month: "short" })}</text>}
          </g>
        );
      })}
      <text x={W - P.r} y={10} textAnchor="end" style={{ fill: "var(--ember)" }}>Jour J ⚑</text>
    </svg>
  );
}

// ---------- Liste des semaines ----------
const movable = (s: Session, today: string) => s.template !== "race" && s.date >= today && (s.status === "planned" || s.status === "adapted");

/** Maintenir une séance (ou la saisir à la souris) puis la lâcher sur un autre jour. */
function useDragMove(sessions: Session[], today: string, onMove: (a: Session, b: Session) => void) {
  const st = useRef<{ s: Session; li: HTMLElement; ghost: HTMLElement | null; x0: number; y0: number; timer: number; target: HTMLElement | null } | null>(null);
  useEffect(() => () => { if (st.current) { clearTimeout(st.current.timer); st.current.ghost?.remove(); } }, []);
  return (s: Session) => (e: React.PointerEvent<HTMLElement>) => {
    if (!movable(s, today) || e.button > 0) return;
    const li = (e.currentTarget as HTMLElement).closest("li") as HTMLElement;
    const cleanup = () => {
      const c = st.current; if (!c) return;
      clearTimeout(c.timer); c.li.classList.remove("drag-src"); c.target?.classList.remove("drop-on");
      if (c.ghost) { const g = c.ghost; g.classList.add("drag-drop"); setTimeout(() => g.remove(), 260); }
      st.current = null;
      window.removeEventListener("pointermove", onMoveEv); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", cleanup);
    };
    const begin = () => {
      const c = st.current; if (!c) return;
      const r = c.li.getBoundingClientRect(), g = c.li.cloneNode(true) as HTMLElement;
      g.classList.add("drag-ghost"); g.removeAttribute("data-sid"); Object.assign(g.style, { viewTransitionName: "none",  left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` });
      document.body.appendChild(g); c.ghost = g; c.li.classList.add("drag-src"); buzz(10);
    };
    const onMoveEv = (ev: PointerEvent) => {
      const c = st.current; if (!c) return;
      if (!c.ghost) { if (Math.hypot(ev.clientX - c.x0, ev.clientY - c.y0) > 8) cleanup(); return; }
      ev.preventDefault();
      c.ghost.style.transform = `translate(${(ev.clientX - c.x0) * 0.15}px, ${ev.clientY - c.y0}px) rotate(-1.5deg) scale(1.03)`;
      const over = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>("li[data-sid]") ?? null;
      const ok = over && over !== c.li && over.dataset.date! >= today ? over : null;
      if (ok !== c.target) { c.target?.classList.remove("drop-on"); ok?.classList.add("drop-on"); c.target = ok; if (ok) buzz(6); }
    };
    const onUp = () => {
      const c = st.current; if (!c) return;
      const tgt = c.target ? sessions.find((x) => String(x.id) === c.target!.dataset.sid) : null;
      cleanup();
      if (tgt && tgt.date !== s.date) onMove(s, tgt);
    };
    st.current = { s, li, ghost: null, x0: e.clientX, y0: e.clientY, timer: window.setTimeout(begin, e.pointerType === "mouse" ? 150 : 380), target: null };
    window.addEventListener("pointermove", onMoveEv, { passive: false }); window.addEventListener("pointerup", onUp); window.addEventListener("pointercancel", cleanup);
  };
}

function WeekList({ sessions, weeks, today, doneByWeek, onStatus, targets, onWhere, onMove }: { sessions: Session[]; weeks: PlanWeek[]; today: string; doneByWeek: Record<string, number>; onStatus: (s: Session, st: string) => void; targets?: Targets; onWhere: (s: Session) => void; onMove: (a: Session, b: Session) => void }) {
  const drag = useDragMove(sessions, today, onMove);
  const fc = useForecast(today);
  const cur = monday(today);
  const groups = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of sessions) { const k = monday(s.date); m.set(k, [...(m.get(k) ?? []), s]); }
    return [...m.entries()];
  }, [sessions]);
  const [open, setOpen] = useState<Set<string>>(() => new Set([cur, groups.find(([k]) => k > cur)?.[0] ?? ""]));
  const [detail, setDetail] = useState<number | null>(null);
  const toggle = (k: string) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const openDetail = (id: number) => withTransition(() => flushSync(() => setDetail(detail === id ? null : id)));

  return (
    <div>
      {groups.map(([wk, list]) => {
        const meta = weeks.find((w) => w.monday === wk);
        const minutes = meta?.minutes ?? list.filter((s) => s.status !== "skipped").reduce((t, s) => t + s.duration_min, 0);
        const gain = meta?.gainM ?? list.reduce((t, s) => t + (s.gain_m ?? 0), 0);
        const isOpen = open.has(wk);
        const n = weeks.findIndex((w) => w.monday === wk);
        // Avancement de la semaine : séances faites sur séances prévues (hors courses et séances sautées).
        const counted = list.filter((s) => s.template !== "race" && s.status !== "skipped");
        const done = counted.filter((s) => s.status === "done").length;
        const complete = counted.length > 0 && done === counted.length;
        return (
          <div key={wk} className={`wk ${wk === cur ? "is-cur" : ""} ${wk < cur ? "is-past" : ""} ${complete ? "is-complete" : ""}`}>
            <button className="week-head" onClick={() => toggle(wk)} aria-expanded={isOpen}>
              <span className="wk-dot" style={{ background: PHASE_COLOR[meta?.phase ?? list[0].phase] ?? "var(--chart-bar-2)" }} />
              <span style={{ minWidth: 0 }}>
                <b>{n >= 0 ? `Semaine ${n + 1} · ` : ""}{wk === cur ? "Cette semaine" : `du ${dayLabel(wk, { day: "numeric", month: "long" })}`}</b>
                <span className="small muted wk-focus">{meta?.phase ?? list[0].phase}{meta ? ` — ${meta.focus}` : ""}</span>
              </span>
              <span className="small mono muted wk-sum">{fmtDur(minutes)}{gain ? ` · ${fmtNum(gain)} m` : ""}{doneByWeek[wk] ? ` · fait ${fmtDur(doneByWeek[wk])}` : ""}</span>
              <span className={`chev ${isOpen ? "on" : ""}`} aria-hidden="true">›</span>
              {counted.length > 0 && wk <= cur && (
                <span className="wk-prog" role="img" aria-label={`${done} séance${done > 1 ? "s" : ""} faite${done > 1 ? "s" : ""} sur ${counted.length}`}>
                  <i style={{ ["--p" as string]: done / counted.length }} />
                  {complete && <span className="wk-done">Semaine bouclée<span className="burst" aria-hidden="true">{Array.from({ length: 8 }, (_, k) => <i key={k} style={{ ["--a" as string]: `${k * 45}deg` }} />)}</span></span>}
                </span>
              )}
            </button>
            {isOpen && (
              <ul className="list">
                {list.map((s) => (
                  <li key={s.id} data-sid={s.id} data-date={s.date} style={{ viewTransitionName: `sess-${s.id}` }} className={`item ${s.date === today ? "today" : ""} is-${s.status} ${s.template === "race" ? "is-race" : ""} ${movable(s, today) ? "is-movable" : ""}`}>
                    <div className="date" onPointerDown={drag(s)} title={movable(s, today) ? "Maintiens pour déplacer la séance" : undefined}><small>{shortDay(s.date)}</small><b>{dayNum(s.date)}</b></div>
                    <button onClick={() => openDetail(s.id)} style={{ all: "unset", cursor: "pointer", minWidth: 0 }} aria-expanded={detail === s.id}>
                      <div className="t">{s.template === "race" ? "⚑ " : ""}{s.title}</div>
                      <div className="s">
                        {fmtDur(s.duration_min)}{s.gain_m ? ` · ${fmtNum(s.gain_m)} m D+` : ""}{s.template !== "race" ? ` · effort ${s.rpe_target}/10` : ""}
                        {s.status === "done" && s.a_duration ? ` — réalisé ${fmtDur(s.a_duration)}${s.a_distance ? `, ${fmtKm(s.a_distance)} km` : ""}` : ""}
                      </div>
                      {s.review && <ReviewLine r={s.review} />}
                    </button>
                    <div className="item-actions">
                      {s.template !== "race" && <StatusChip status={s.status} />}
                      {s.template !== "race" && s.date >= today && (s.status === "planned" || s.status === "adapted") && (
                        <>
                          <button className="iconbtn" title="Marquer comme faite" aria-label="Marquer comme faite" onClick={() => onStatus(s, "done")}><IconCheck /></button>
                          <button className="iconbtn" title="Sauter" aria-label="Sauter cette séance" onClick={() => onStatus(s, "skipped")}><IconSkip /></button>
                        </>
                      )}
                      {(s.status === "skipped" || (s.status === "done" && !s.activity_id)) && (
                        <button className="iconbtn" title="Rétablir" aria-label="Rétablir la séance" onClick={() => onStatus(s, "planned")}><IconUndo /></button>
                      )}
                    </div>
                    {detail === s.id && <div className="details"><SessionTarget targets={targets} template={s.template} rpe={s.rpe_target} duration={s.duration_min} title={s.title} gain={s.gain_m} sport={s.sport} day={s.date >= today ? dayOf(fc, s.date) : null} /><p style={{ margin: 0 }}>{s.description}</p>{s.template !== "race" && s.date >= today && <div className="row" style={{ gap: 8 }}><button className="btn ghost sm where" onClick={() => onWhere(s)}><IconTerrain />Où la faire ?</button>{s.template !== "strength" && <button className="btn ghost sm where" onClick={() => downloadWorkout(s, targets)}><IconWatch />Sur ma montre</button>}</div>}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Choix de la course ----------
const FORMATS = [
  { label: "Trail court", km: 20, d: 900 },
  { label: "Trail", km: 35, d: 1800 },
  { label: "Marathon trail", km: 45, d: 2500 },
  { label: "Ultra", km: 80, d: 4500 },
  { label: "Ultra XL", km: 120, d: 7000 },
];

function RaceForm({ goal, today, onSaved, onCancel }: { goal: View["goal"]; today: string; onSaved: (m: string) => Promise<void>; onCancel?: () => void }) {
  const upcoming = goal && goal.date > today ? goal : null;
  const [g, setG] = useState({ name: upcoming?.name ?? "", date: upcoming?.date ?? "", distanceKm: upcoming?.distance_km?.toString().replace(".", ",") ?? "", gainM: upcoming?.gain_m?.toString() ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const min = (() => { const d = new Date(`${localToday()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
  const max = (() => { const d = new Date(`${localToday()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 395); return d.toISOString().slice(0, 10); })();

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api("/api/goal", { method: "PUT", body: g }); await onSaved("Ton plan jusqu’au jour J est prêt."); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : "Erreur"); setBusy(false); }
  }
  async function remove() {
    if (!confirm("Retirer cette course ? Le planning repassera en entretien.")) return;
    setBusy(true);
    try { await api("/api/goal", { method: "DELETE" }); await onSaved("Course retirée."); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : "Erreur"); setBusy(false); }
  }

  return (
    <section className="card race-form">
      <div className="row between">
        <div><span className="eyebrow">Étape 1</span><h2 style={{ marginTop: 4, fontSize: 26, letterSpacing: "-.03em" }}>{upcoming ? "Modifier ma course" : "Choisis ta course"}</h2></div>
        {onCancel && <button className="link small" onClick={onCancel}>Annuler</button>}
      </div>
      <p className="soft" style={{ margin: 0, maxWidth: "62ch" }}>
        Trail Pilot construit ton plan jusqu’au jour J à partir de ta charge actuelle, avec un objectif : que tu termines la course.
        Il te dit aussi si l’objectif est réaliste dans le temps qu’il reste.
      </p>
      <div className="formats" role="group" aria-label="Formats types">
        {FORMATS.map((f) => (
          <button key={f.label} type="button" className={`format ${Number(g.distanceKm.replace(",", ".")) === f.km && Number(g.gainM) === f.d ? "on" : ""}`}
            onClick={() => setG({ ...g, distanceKm: String(f.km), gainM: String(f.d), name: g.name || f.label })}>
            <b>{f.label}</b><small>{f.km} km · {fmtNum(f.d)} m</small>
          </button>
        ))}
      </div>
      <form className="form" onSubmit={submit}>
        <label className="field">Nom de la course<input value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} placeholder="Trail des Templiers" required maxLength={100} /></label>
        <div className="fields f3">
          <label className="field">Date<input type="date" value={g.date} min={min} max={max} onChange={(e) => setG({ ...g, date: e.target.value })} required /></label>
          <label className="field">Distance (km)<input inputMode="decimal" value={g.distanceKm} onChange={(e) => setG({ ...g, distanceKm: e.target.value })} placeholder="45" required /></label>
          <label className="field">D+ (m)<input inputMode="numeric" value={g.gainM} onChange={(e) => setG({ ...g, gainM: e.target.value })} placeholder="2500" required /></label>
        </div>
        {err && <p className="note err" role="alert">{err}</p>}
        <div className="row">
          <button className="btn" type="submit" disabled={busy}>{busy ? "Calcul du plan…" : upcoming ? "Recalculer mon plan" : "Créer mon plan"}</button>
          {upcoming && <button type="button" className="btn danger" onClick={remove} disabled={busy}>Retirer la course</button>}
        </div>
      </form>
    </section>
  );
}

/** Séance validée : une coche part de la ligne et rejoint la barre d’avancement de sa semaine, qui s’illumine. */
function flyCheck(id: number): Promise<void> {
  const li = document.querySelector<HTMLElement>(`li[data-sid="${id}"]`);
  const bar = li?.closest(".wk")?.querySelector<HTMLElement>(".wk-prog > i");
  if (!li || !bar || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();
  const from = (li.querySelector(".item-actions") ?? li).getBoundingClientRect(), to = bar.getBoundingClientRect();
  const x0 = from.left + from.width / 2, y0 = from.top + from.height / 2;
  const x1 = to.left + to.width * Math.min(1, Number(getComputedStyle(bar).getPropertyValue("--p") || 0) + 0.08), y1 = to.top + to.height / 2;
  const dot = document.createElement("i");
  dot.className = "fly-check"; dot.textContent = "✓";
  document.body.appendChild(dot);
  const anim = dot.animate([
    { transform: `translate(${x0}px, ${y0}px) scale(.4)`, opacity: 0 },
    { transform: `translate(${x0}px, ${y0 - 26}px) scale(1.25)`, opacity: 1, offset: 0.22 },
    { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 40}px) scale(1)`, opacity: 1, offset: 0.6 },
    { transform: `translate(${x1}px, ${y1}px) scale(.35)`, opacity: 0.9 },
  ], { duration: 720, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" });
  return anim.finished.then(() => {
    dot.remove();
    bar.parentElement?.classList.add("is-hit");
    setTimeout(() => bar.parentElement?.classList.remove("is-hit"), 900);
  }).catch(() => dot.remove());
}

/** Prévu / réalisé, en une ligne : verdict, durée et part du temps dans la zone visée. */
export function ReviewLine({ r }: { r: Review }) {
  const tone = r.verdict === "tenue" ? "ok" : r.verdict === "intense" ? "bad" : "lite";
  return (
    <div className={`review r-${tone}`}>
      <b>{r.label}</b>
      <span>durée {r.dur} %{r.gain != null ? ` · D+ ${r.gain} %` : ""}</span>
      {r.inZone != null && (
        <i className="review-bar" role="img" aria-label={`${r.below} % sous la zone, ${r.inZone} % dans la zone, ${r.above} % au-dessus`}>
          <i className="rb-below" style={{ flexGrow: r.below ?? 0 }} /><i className="rb-in" style={{ flexGrow: r.inZone }} /><i className="rb-above" style={{ flexGrow: r.above ?? 0 }} />
        </i>
      )}
    </div>
  );
}

const ABS_LABEL: Record<Absence["kind"], string> = { malade: "Malade", blesse: "Blessé", deplacement: "En déplacement" };
const ABS_HOW: Record<Absence["kind"], string> = {
  malade: "Pas de séance pendant la période, puis 7 jours de reprise : volume réduit d’un tiers, sans intensité.",
  blesse: "Pas de séance pendant la période, puis 10 jours de reprise en endurance seule, moitié du volume. Si la douleur persiste, consulte.",
  deplacement: "Un footing court, si possible, à la place de chaque séance. Rien à rattraper au retour.",
};

function AbsenceBanner({ a, today, onEdit, onCancel }: { a: Absence | null; today: string; onEdit: () => void; onCancel: () => void }) {
  if (!a) return null;
  const range = `${dayLabel(a.start, { day: "numeric", month: "short" })} → ${dayLabel(a.end, { day: "numeric", month: "short" })}`;
  return (
    <div className="banner absence" style={{ marginBottom: 14 }}>
      <div><b>Imprévu : {ABS_LABEL[a.kind].toLowerCase()} · {range}</b><div className="small muted">{a.end < today ? "Période terminée, la reprise progressive est en cours. " : ""}{ABS_HOW[a.kind]}</div></div>
      <div className="row"><button className="btn ghost sm" onClick={onEdit}>Modifier</button><button className="btn ghost sm" onClick={onCancel}>Annuler</button></div>
    </div>
  );
}

/** Ce que le plan a appris du prévu / réalisé, et ce qui a été ajusté. */
function LearningCard({ l, onToggle }: { l?: View["learning"]; onToggle: (off: boolean) => void }) {
  if (!l || !l.items.length) return null;
  const changes = l.items.some((i) => i.changes);
  return (
    <div className={`banner learn ${changes && !l.off ? "on" : ""}`} style={{ marginBottom: 14 }}>
      <div>
        <b>{changes ? (l.off ? "Ajustements proposés (désactivés)" : "Plan ajusté d’après tes dernières séances") : "Ce que disent tes dernières séances"}</b>
        <ul className="learn-list">{l.items.map((i) => <li key={i.kind} className={i.changes ? "chg" : ""}>{i.text}</li>)}</ul>
      </div>
      {changes && <div className="row"><button className="btn ghost sm" onClick={() => onToggle(!l.off)}>{l.off ? "Réactiver les ajustements" : "Garder le plan d’origine"}</button></div>}
    </div>
  );
}

function AbsenceSheet({ a, today, onClose, onSaved }: { a: Absence | null; today: string; onClose: () => void; onSaved: (msg: string) => Promise<void> }) {
  const [kind, setKind] = useState<Absence["kind"]>(a?.kind ?? "malade");
  const [start, setStart] = useState(a?.start ?? today);
  const [end, setEnd] = useState(a?.end ?? addDaysClient(today, 3));
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api("/api/absence", { method: "POST", body: { kind, start, end, today } }); await onSaved("Plan réorganisé autour de ton imprévu."); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : "Erreur"); setBusy(false); }
  }
  return (
    <div className="sheet-back" role="dialog" aria-modal="true" aria-labelledby="abs-title" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="sheet form" onSubmit={submit}>
        <div className="card-head"><h2 id="abs-title">Un imprévu ?</h2><button type="button" className="link small" onClick={onClose}>Fermer</button></div>
        <div className="picks" role="radiogroup" aria-label="Motif">
          {(Object.keys(ABS_LABEL) as Absence["kind"][]).map((k) => (
            <label key={k} className={kind === k ? "on" : ""}><input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />{ABS_LABEL[k]}</label>
          ))}
        </div>
        <p className="muted small" style={{ margin: 0 }}>{ABS_HOW[kind]}</p>
        <div className="fields">
          <label className="field">Du<input type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
          <label className="field">Au (inclus)<input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required /></label>
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn" type="submit" disabled={busy}>{busy ? "Réorganisation…" : "Réorganiser mon plan"}</button>
      </form>
    </div>
  );
}
const addDaysClient = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

