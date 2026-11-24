"use client";

import { openPanel } from "./panel";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, dayLabel, fmtDur, SPORT_LABEL, type PlanSession, type Targets } from "./client";
import { Fiche, useFiche } from "./Fiche";
import DaySheet, { kindOf, KIND_LABEL, type CalData, type Extra } from "./DaySheet";
import type { planActions } from "./planActions";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const add = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const addMonth = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); return iso(new Date(Date.UTC(y, mo - 1 + n, 1, 12))).slice(0, 7); };
const monthLabel = (m: string) => { const t = new Date(`${m}-01T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); return t[0].toUpperCase() + t.slice(1); };
const shortMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(Math.round(m % 60)).padStart(2, "0") : ""}` : `${Math.round(m)}′`);

/**
 * Planning en vue calendrier : un mois, une case par jour, une pastille par séance (couleur = type,
 * coche = faite). Toucher un jour ouvre sa fiche (séances, réalisé, sorties hors plan, check-in, commentaire),
 * par-dessus le calendrier ; le jour d'une course passée ouvre son débrief.
 */
export default function PlanCalendar({ today, rev, targets, actions, onWhere, onChanged }: {
  today: string; rev: number; targets?: Targets;
  actions: ReturnType<typeof planActions>;
  onWhere: (s: PlanSession) => void;
  /** Un commentaire a été enregistré : le planning a pu changer. */
  onChanged: () => Promise<unknown> | void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState<CalData | null>(null);
  const [err, setErr] = useState(false);
  const [sel, setSel] = useState<string>(today);
  const dayF = useFiche<string>();

  const load = useCallback(async (m: string) => {
    try { setErr(false); setData(await api<CalData>(`/api/plan/month?month=${m}&today=${today}`)); }
    catch { setErr(true); }
  }, [today]);
  useEffect(() => { load(month); }, [load, month, rev]);
  // Mois suivant préchargé : il reste consultable hors ligne (en montagne, sans réseau).
  useEffect(() => { if (navigator.onLine) api(`/api/plan/month?month=${addMonth(month, 1)}&today=${today}`).catch(() => {}); }, [month, today]);

  const weeks = useMemo(() => {
    if (!data) return [];
    const out: string[][] = [];
    for (let d = data.from; d <= data.to; d = add(d, 7)) out.push(Array.from({ length: 7 }, (_, i) => add(d, i)));
    return out;
  }, [data]);
  const byDay = useMemo(() => {
    const m = new Map<string, { sessions: PlanSession[]; extras: Extra[]; race: CalData["races"][number] | null; check: CalData["checkins"][number] | null; note: CalData["notes"][number] | null }>();
    if (!data) return m;
    const get = (d: string) => { if (!m.has(d)) m.set(d, { sessions: [], extras: [], race: null, check: null, note: null }); return m.get(d)!; };
    for (const s of data.sessions) get(s.date).sessions.push(s);
    for (const a of data.extras) get(a.date).extras.push(a);
    for (const r of data.races) get(r.date).race = r;
    for (const c of data.checkins) get(c.date).check = c;
    for (const n of data.notes ?? []) get(n.date).note = n;
    return m;
  }, [data]);
  const inAbsence = (d: string) => !!data?.absence && d >= data.absence.start && d <= data.absence.end;

  function pick(d: string, el?: HTMLElement) {
    setSel(d);
    // Jour d'une course passée (ou du jour) : sa fiche s'ouvre avec le débrief. Sinon, la fiche du jour.
    if (byDay.get(d)?.race && d <= today) { openPanel({ kind: "race", date: d }, el); return; }
    dayF.open(d, el);
  }
  function goMonth(n: number) { const m = n === 0 ? today.slice(0, 7) : addMonth(month, n); setMonth(m); if (n === 0) setSel(today); else setSel(`${m}-01`); }
  return (
    <div className="cal">
      <div className="cal-nav">
        <button className="iconbtn" aria-label="Mois précédent" onClick={() => goMonth(-1)}>‹</button>
        <h2 aria-live="polite">{monthLabel(month)}</h2>
        <button className="iconbtn" aria-label="Mois suivant" onClick={() => goMonth(1)}>›</button>
        {month !== today.slice(0, 7) && <button className="btn ghost sm" onClick={() => goMonth(0)}>Aujourd’hui</button>}
      </div>
      {err ? <p className="empty">Calendrier indisponible. <button className="link" onClick={() => load(month)}>Réessayer</button></p> : !data ? <div className="skeleton" style={{ height: 320 }} /> : (
        <div key={data.month} className="cal-grid" role="grid" aria-label={`Calendrier de ${monthLabel(month)}`}>
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
                  const label = [dayLabel(d), x?.race ? `course ${x.race.name}` : "", ...(x?.sessions ?? []).map((s) => `${s.title}, ${fmtDur(s.duration_min)}, ${STATUS[s.status] ?? s.status}`), ...(x?.extras ?? []).map((a) => `sortie hors plan ${fmtDur(a.duration_min)}`), x?.note ? "commentaire" : "", x?.check ? "check-in fait" : "", inAbsence(d) ? "imprévu" : ""].filter(Boolean).join(" · ");
                  return (
                    <button key={d} role="gridcell" aria-selected={sel === d} aria-label={label} aria-haspopup="dialog" onClick={(e) => pick(d, e.currentTarget)}
                      className={`cal-day ${out ? "out" : ""} ${d === today ? "today" : ""} ${sel === d ? "sel" : ""} ${d < today ? "past" : ""} ${inAbsence(d) ? "abs" : ""}`}>
                      <span className="cal-num">{Number(d.slice(8))}{x?.race && <i className="cal-flag" aria-hidden="true">⚑</i>}{x?.note && <i className="cal-note" aria-hidden="true" />}</span>
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

      <Fiche ctl={dayF} kind="day">
        {dayF.value && <DaySheet date={dayF.value} today={today} targets={targets} data={data?.from && dayF.value >= data.from && dayF.value <= data.to ? data : null}
          actions={actions} onWhere={onWhere} onChanged={onChanged} close={dayF.close} />}
      </Fiche>
    </div>
  );
}

const STATUS: Record<string, string> = { planned: "prévue", adapted: "adaptée", done: "faite", skipped: "sautée", missed: "manquée" };
