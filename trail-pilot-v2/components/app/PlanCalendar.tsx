"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, dayLabel, fmtDur, fmtKm, fmtNum, SPORT_LABEL, type Absence, type PlanSession, type Targets } from "./client";
import { IconCheck, IconSkip, IconTerrain, IconUndo, IconWatch } from "./icons";
import { StatusChip } from "./Today";
import { SessionTarget } from "./Targets";
import { dayOf, useForecast } from "./useForecast";
import { downloadWorkout } from "./workout";
import { ReviewLine } from "./Planning";

interface Extra { id: number; date: string; sport: string; name: string | null; duration_min: number; distance_km: number | null; gain_m: number | null; source: string }
interface CalData {
  month: string; today: string; from: string; to: string;
  sessions: PlanSession[]; extras: Extra[];
  checkins: { date: string; note: string | null; score: number }[];
  races: { date: string; name: string; main: boolean }[];
  absence: Absence | null;
}

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const QUALITY = new Set(["tempo", "hills", "climb", "downhill", "sharpen"]);
/** Famille de séance : sert à la couleur de la pastille et à la légende. */
const kindOf = (t: string) => (t === "race" ? "race" : t === "strength" ? "renfo" : t === "recovery" || t === "rest" ? "recup" : QUALITY.has(t) ? "qual" : "endu");
const KIND_LABEL: Record<string, string> = { endu: "Endurance", qual: "Qualité", renfo: "Renforcement", recup: "Récupération", race: "Course" };
const ABSENCE_LABEL: Record<string, string> = { malade: "Malade", blesse: "Blessé", deplacement: "En déplacement" };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const add = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const addMonth = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); return iso(new Date(Date.UTC(y, mo - 1 + n, 1, 12))).slice(0, 7); };
const monthLabel = (m: string) => { const t = new Date(`${m}-01T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); return t[0].toUpperCase() + t.slice(1); };
const movable = (s: PlanSession, today: string) => s.template !== "race" && s.date >= today && (s.status === "planned" || s.status === "adapted");
const shortMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(Math.round(m % 60)).padStart(2, "0") : ""}` : `${Math.round(m)}′`);

/**
 * Planning en vue calendrier : un mois, une case par jour, une pastille par séance (couleur = type,
 * coche = faite). Toucher un jour ouvre son détail sous la grille : séance, réalisé, sorties hors plan,
 * commentaire du check-in. « Déplacer » puis toucher un autre jour change la date d’une séance.
 */
export default function PlanCalendar({ today, rev, targets, onStatus, onWhere, onMoveTo }: {
  today: string; rev: number; targets?: Targets;
  onStatus: (s: PlanSession, status: string) => void;
  onWhere: (s: PlanSession) => void;
  onMoveTo: (s: PlanSession, date: string, swap: PlanSession | null) => void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState<CalData | null>(null);
  const [err, setErr] = useState(false);
  const [sel, setSel] = useState<string>(today);
  const [moving, setMoving] = useState<PlanSession | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const fc = useForecast(today);

  const load = useCallback(async (m: string) => {
    try { setErr(false); setData(await api<CalData>(`/api/plan/month?month=${m}&today=${today}`)); }
    catch { setErr(true); }
  }, [today]);
  useEffect(() => { load(month); }, [load, month, rev]);

  const weeks = useMemo(() => {
    if (!data) return [];
    const out: string[][] = [];
    for (let d = data.from; d <= data.to; d = add(d, 7)) out.push(Array.from({ length: 7 }, (_, i) => add(d, i)));
    return out;
  }, [data]);
  const byDay = useMemo(() => {
    const m = new Map<string, { sessions: PlanSession[]; extras: Extra[]; race: CalData["races"][number] | null; check: CalData["checkins"][number] | null }>();
    if (!data) return m;
    const get = (d: string) => { if (!m.has(d)) m.set(d, { sessions: [], extras: [], race: null, check: null }); return m.get(d)!; };
    for (const s of data.sessions) get(s.date).sessions.push(s);
    for (const a of data.extras) get(a.date).extras.push(a);
    for (const r of data.races) get(r.date).race = r;
    for (const c of data.checkins) get(c.date).check = c;
    return m;
  }, [data]);
  const inAbsence = (d: string) => !!data?.absence && d >= data.absence.start && d <= data.absence.end;

  function pick(d: string) {
    if (moving) {
      if (d < today || d === moving.date) { setMoving(null); return; }
      const there = byDay.get(d)?.sessions.find((x) => movable(x, today)) ?? null;
      onMoveTo(moving, d, there); setMoving(null); setSel(d);
      return;
    }
    setSel(d);
    // Sur téléphone, le détail est sous la grille : on l’amène à l’écran.
    if (window.matchMedia("(max-width: 900px)").matches) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" }));
  }
  function goMonth(n: number) { const m = n === 0 ? today.slice(0, 7) : addMonth(month, n); setMonth(m); setMoving(null); if (n === 0) setSel(today); else setSel(`${m}-01`); }

  const day = byDay.get(sel);
  const absent = inAbsence(sel);
  return (
    <div className="cal">
      <div className="cal-nav">
        <button className="iconbtn" aria-label="Mois précédent" onClick={() => goMonth(-1)}>‹</button>
        <h2 aria-live="polite">{monthLabel(month)}</h2>
        <button className="iconbtn" aria-label="Mois suivant" onClick={() => goMonth(1)}>›</button>
        {month !== today.slice(0, 7) && <button className="btn ghost sm" onClick={() => goMonth(0)}>Aujourd’hui</button>}
      </div>
      {moving && <p className="cal-move" role="status">Touche le jour où placer « {moving.title} ». <button className="link" onClick={() => setMoving(null)}>Annuler</button></p>}
      {err ? <p className="empty">Calendrier indisponible. <button className="link" onClick={() => load(month)}>Réessayer</button></p> : !data ? <div className="skeleton" style={{ height: 320 }} /> : (
        <div className={`cal-grid ${moving ? "is-moving" : ""}`} role="grid" aria-label={`Calendrier de ${monthLabel(month)}`}>
          <div className="cal-row cal-head" role="row">{WEEKDAYS.map((w) => <span key={w} role="columnheader">{w}</span>)}<span className="cal-sum" role="columnheader">Semaine</span></div>
          {weeks.map((w) => {
            const ss = w.flatMap((d) => byDay.get(d)?.sessions ?? []).filter((s) => s.template !== "race" && s.status !== "skipped");
            const planned = ss.reduce((t, s) => t + s.duration_min, 0);
            const done = ss.reduce((t, s) => t + (s.status === "done" ? s.a_duration ?? s.duration_min : 0), 0) + w.flatMap((d) => byDay.get(d)?.extras ?? []).reduce((t, a) => t + a.duration_min, 0);
            return (
              <div className="cal-row" role="row" key={w[0]}>
                {w.map((d) => {
                  const x = byDay.get(d);
                  const out = d.slice(0, 7) !== month;
                  const label = [dayLabel(d), x?.race ? `course ${x.race.name}` : "", ...(x?.sessions ?? []).map((s) => `${s.title}, ${fmtDur(s.duration_min)}, ${STATUS[s.status] ?? s.status}`), ...(x?.extras ?? []).map((a) => `sortie hors plan ${fmtDur(a.duration_min)}`), x?.check?.note ? "commentaire au check-in" : "", inAbsence(d) ? "imprévu" : ""].filter(Boolean).join(" · ");
                  return (
                    <button key={d} role="gridcell" aria-selected={sel === d} aria-label={label} onClick={() => pick(d)}
                      className={`cal-day ${out ? "out" : ""} ${d === today ? "today" : ""} ${sel === d ? "sel" : ""} ${d < today ? "past" : ""} ${inAbsence(d) ? "abs" : ""} ${moving && d >= today && d !== moving.date ? "drop" : ""}`}>
                      <span className="cal-num">{Number(d.slice(8))}{x?.race && <i className="cal-flag" aria-hidden="true">⚑</i>}{x?.check?.note && <i className="cal-note" aria-hidden="true" />}</span>
                      <span className="cal-evs" aria-hidden="true">
                        {x?.sessions.filter((s) => s.template !== "race").map((s) => (
                          <span key={s.id} className={`ev ev-${kindOf(s.template)} st-${s.status}`}>{s.status === "done" && <b>✓</b>}<em>{s.title}</em><small>{shortMin(s.status === "done" && s.a_duration ? s.a_duration : s.duration_min)}</small></span>
                        ))}
                        {x?.extras.map((a) => <span key={a.id} className="ev ev-extra st-done"><b>✓</b><em>{a.name ?? SPORT_LABEL[a.sport] ?? a.sport}</em><small>{shortMin(a.duration_min)}</small></span>)}
                      </span>
                    </button>
                  );
                })}
                <span className="cal-sum" role="gridcell">{planned > 0 && <><b>{fmtDur(planned)}</b><small>prévu</small></>}{done > 0 && <><b className="done">{fmtDur(done)}</b><small>fait</small></>}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="cal-legend" aria-hidden="true">
        {["endu", "qual", "renfo", "recup"].map((k) => <span key={k}><i className={`ev-${k}`} />{KIND_LABEL[k]}</span>)}
        <span><i className="ev-extra" />Hors plan</span><span><b>✓</b> Faite</span><span><i className="cal-note" /> Commentaire</span>
      </div>

      {data && (
        <div className="cal-detail" ref={detailRef} aria-live="polite">
          <div className="row between"><h3>{dayLabel(sel)}{sel === today ? " · aujourd’hui" : ""}</h3>{day?.check && <span className="chip dim" title="Ressenti déclaré au check-in (sommeil, jambes, motivation, douleur)">Ressenti {day.check.score}/100</span>}</div>
          {day?.race && <p className="cal-race">⚑ {day.race.main ? "Jour J" : "Course de préparation"} : <b>{day.race.name}</b></p>}
          {absent && data.absence && <p className="muted small" style={{ margin: 0 }}>{ABSENCE_LABEL[data.absence.kind] ?? "Imprévu"} : séances suspendues ou allégées sur cette période.</p>}
          {day?.sessions.filter((s) => s.template !== "race").map((s) => (
            <article key={s.id} className={`cal-sess ev-${kindOf(s.template)}-b`}>
              <div className="row between">
                <div style={{ minWidth: 0 }}>
                  <b className="t">{s.title}</b>
                  <div className="s">{fmtDur(s.duration_min)}{s.gain_m ? ` · ${fmtNum(s.gain_m)} m D+` : ""} · effort {s.rpe_target}/10 · {s.phase}</div>
                </div>
                <StatusChip status={s.status} />
              </div>
              {s.status === "done" && s.a_duration != null && <p className="cal-real">Réalisé{s.a_name ? ` (${s.a_name})` : ""} : <b>{fmtDur(s.a_duration)}</b>{s.a_distance ? ` · ${fmtKm(s.a_distance)} km` : ""}{s.a_gain ? ` · ${fmtNum(s.a_gain)} m D+` : ""}</p>}
              {s.review && <ReviewLine r={s.review} />}
              {s.status !== "done" && s.template !== "recovery" && <SessionTarget targets={targets} template={s.template} rpe={s.rpe_target} duration={s.duration_min} title={s.title} gain={s.gain_m} sport={s.sport} day={s.date >= today ? dayOf(fc, s.date) : null} />}
              <p className="soft small" style={{ margin: 0 }}>{s.description}</p>
              <div className="row" style={{ gap: 8 }}>
                {movable(s, today) && (
                  <>
                    <button className="btn sm" onClick={() => onStatus(s, "done")}><IconCheck />Faite</button>
                    <button className="btn ghost sm" onClick={() => onStatus(s, "skipped")}><IconSkip />Sauter</button>
                    <button className="btn ghost sm" onClick={() => setMoving(s)} aria-pressed={moving?.id === s.id}>Déplacer</button>
                    <button className="btn ghost sm where" onClick={() => onWhere(s)}><IconTerrain />Où la faire ?</button>
                    {s.template !== "strength" && s.template !== "recovery" && <button className="btn ghost sm where" onClick={() => downloadWorkout(s, targets)}><IconWatch />Sur ma montre</button>}
                  </>
                )}
                {(s.status === "skipped" || (s.status === "done" && !s.activity_id)) && <button className="btn ghost sm" onClick={() => onStatus(s, "planned")}><IconUndo />Rétablir</button>}
                {s.status === "missed" && <button className="btn ghost sm" onClick={() => onStatus(s, "done")}><IconCheck />Je l’ai faite</button>}
              </div>
            </article>
          ))}
          {day?.extras.map((a) => (
            <article key={a.id} className="cal-sess ev-extra-b">
              <b className="t">{a.name ?? SPORT_LABEL[a.sport] ?? a.sport}</b>
              <div className="s">Hors plan · {SPORT_LABEL[a.sport] ?? a.sport} · {fmtDur(a.duration_min)}{a.distance_km ? ` · ${fmtKm(a.distance_km)} km` : ""}{a.gain_m ? ` · ${fmtNum(a.gain_m)} m D+` : ""}{a.source === "strava" ? " · Strava" : ""}</div>
            </article>
          ))}
          {day?.check?.note && <blockquote className="cal-comment"><small>Commentaire du check-in</small>{day.check.note}</blockquote>}
          {!day?.sessions.length && !day?.extras.length && !day?.race && <p className="muted" style={{ margin: 0 }}>{absent ? "Rien de prévu." : sel < today ? "Jour de repos." : "Repos prévu."}</p>}
        </div>
      )}
    </div>
  );
}

const STATUS: Record<string, string> = { planned: "prévue", adapted: "adaptée", done: "faite", skipped: "sautée", missed: "manquée" };
