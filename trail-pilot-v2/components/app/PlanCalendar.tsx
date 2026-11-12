"use client";

import StrengthButton from "./StrengthButton";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, dayLabel, fmtDur, fmtKm, fmtNum, SPORT_LABEL, type Absence, type PlanSession, type Targets } from "./client";
import { IconCheck, IconSkip, IconTerrain, IconUndo, IconWatch } from "./icons";
import { StatusChip } from "./Today";
import { SessionTarget } from "./Targets";
import { dayOf, useForecast } from "./useForecast";
import { downloadWorkout } from "./workout";
import { ReviewLine } from "./Planning";
import { ZONES } from "@/lib/engine/legs";

interface Extra { id: number; date: string; sport: string; name: string | null; duration_min: number; distance_km: number | null; gain_m: number | null; source: string }
interface CalData {
  month: string; today: string; from: string; to: string;
  sessions: PlanSession[]; extras: Extra[];
  checkins: { date: string; sleep: number; legs: number; motivation: number; pain: number; zones: string[]; sleepH: number | null; rhr: number | null; hrv: number | null; score: number }[];
  notes: { date: string; note: string; resume: string | null }[];
  fuel?: { date: string; feel: string }[];
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
export default function PlanCalendar({ today, rev, targets, onStatus, onWhere, onMoveTo, onRestore, onChanged }: {
  onRestore: (s: PlanSession) => void;
  /** Un commentaire a été enregistré : le planning a pu changer. */
  onChanged: () => Promise<void> | void;
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
                  const label = [dayLabel(d), x?.race ? `course ${x.race.name}` : "", ...(x?.sessions ?? []).map((s) => `${s.title}, ${fmtDur(s.duration_min)}, ${STATUS[s.status] ?? s.status}`), ...(x?.extras ?? []).map((a) => `sortie hors plan ${fmtDur(a.duration_min)}`), x?.note ? "commentaire" : "", x?.check ? "check-in fait" : "", inAbsence(d) ? "imprévu" : ""].filter(Boolean).join(" · ");
                  return (
                    <button key={d} role="gridcell" aria-selected={sel === d} aria-label={label} onClick={() => pick(d)}
                      className={`cal-day ${out ? "out" : ""} ${d === today ? "today" : ""} ${sel === d ? "sel" : ""} ${d < today ? "past" : ""} ${inAbsence(d) ? "abs" : ""} ${moving && d >= today && d !== moving.date ? "drop" : ""}`}>
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
              {s.status === "done" && /Alimentation à entraîner/.test(s.description) && <FuelFeel date={s.date} today={today} feel={data.fuel?.find((f) => f.date === s.date)?.feel ?? null} onSaved={onChanged} />}
              {s.status !== "done" && s.template !== "recovery" && <SessionTarget targets={targets} template={s.template} rpe={s.rpe_target} duration={s.duration_min} title={s.title} gain={s.gain_m} sport={s.sport} day={s.date >= today ? dayOf(fc, s.date) : null} />}
              <p className="soft small" style={{ margin: 0 }}>{s.description}</p>
              <div className="row" style={{ gap: 8 }}>
                {movable(s, today) && (
                  <>
                    <button className="btn sm" onClick={() => onStatus(s, "done")}><IconCheck />Faite</button>
                    <button className="btn ghost sm" onClick={() => onStatus(s, "skipped")}><IconSkip />Sauter</button>
                    <button className="btn ghost sm" onClick={() => setMoving(s)} aria-pressed={moving?.id === s.id}>Déplacer</button>
                    <button className="btn ghost sm where" onClick={() => onWhere(s)}><IconTerrain />Où la faire ?</button>
                    {s.template !== "strength" && s.template !== "recovery" && <button className="btn ghost sm where" onClick={() => downloadWorkout(s, targets)}><IconWatch />Sur ma montre</button>}{s.template !== "strength" && s.template !== "recovery" && <button className="iconbtn sm" aria-label="Comment mettre la séance sur ma montre" onClick={() => window.dispatchEvent(new CustomEvent("tp-watch-help", { detail: "" }))}>?</button>}
                    <StrengthButton s={s} onDone={s.template === "strength" ? () => onStatus(s, "done") : undefined} />
                  </>
                )}
                {(s.status === "skipped" || (s.status === "done" && !s.activity_id)) && <button className="btn ghost sm" onClick={() => onStatus(s, "planned")}><IconUndo />Rétablir</button>}
                {s.original && movable(s, today) && <button className="btn ghost sm" onClick={() => onRestore(s)}><IconUndo />Rétablir la séance prévue</button>}
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
          {day?.check && <CheckinRecap c={day.check} />}
          <DayComment key={sel} date={sel} today={today} note={day?.note ?? null} onSaved={onChanged} />
          {!day?.sessions.length && !day?.extras.length && !day?.race && <p className="muted" style={{ margin: 0 }}>{absent ? "Rien de prévu." : sel < today ? "Jour de repos." : "Repos prévu."}</p>}
        </div>
      )}
    </div>
  );
}

const FEEL: [string, string][] = [["ok", "Passé sans souci"], ["limite", "Un peu limite"], ["ko", "Ça n’est pas passé"]];
/** Après une sortie longue : l’alimentation testée est-elle passée ? La quantité de la sortie suivante s’ajuste. */
function FuelFeel({ date, today, feel, onSaved }: { date: string; today: string; feel: string | null; onSaved: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const [cur, setCur] = useState(feel);
  async function pick(f: string) {
    setBusy(true);
    try { await api("/api/fuel", { method: "POST", body: { date, today, feel: f } }); setCur(f); await onSaved(); }
    catch { /* le choix reste modifiable */ }
    finally { setBusy(false); }
  }
  return (
    <div className="fuel-feel">
      <small className="cal-kicker">L’alimentation est passée ?</small>
      <div className="db-tags" role="radiogroup" aria-label="Ressenti de l’alimentation">
        {FEEL.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={cur === k} className={`db-tag ${cur === k ? "on" : ""}`} disabled={busy} onClick={() => pick(k)}>{l}</button>)}
      </div>
      {cur && <small className="muted">{cur === "ok" ? "La quantité continue de monter vers celle du jour J." : cur === "limite" ? "Ta prochaine sortie longue garde la même quantité." : "Ta prochaine sortie longue baisse de 10 g par heure. Essaie des prises plus petites et plus fréquentes."}</small>}
    </div>
  );
}

/** Le check-in tel qu’il a été rempli ce jour-là. */
function CheckinRecap({ c }: { c: CalData["checkins"][number] }) {
  const pain = ["aucune", "légère gêne", "marquée"][c.pain] ?? "—";
  const zones = c.zones.map((z) => (ZONES as Record<string, string>)[z] ?? z).join(", ");
  const h = (v: number) => `${Math.floor(v)} h ${String(Math.round((v % 1) * 60)).padStart(2, "0")}`;
  return (
    <section className="cal-ci" aria-label="Check-in de ce jour">
      <small className="cal-kicker">Check-in du matin</small>
      <dl>
        <div><dt>Sommeil</dt><dd>{c.sleep}/5</dd></div>
        <div><dt>Jambes</dt><dd>{c.legs}/5</dd></div>
        <div><dt>Motivation</dt><dd>{c.motivation}/5</dd></div>
        <div><dt>Douleur</dt><dd>{pain}{zones ? ` (${zones.toLowerCase()})` : ""}</dd></div>
        {c.sleepH != null && <div><dt>Nuit</dt><dd>{h(c.sleepH)}</dd></div>}
        {c.rhr != null && <div><dt>FC au réveil</dt><dd>{c.rhr} bpm</dd></div>}
        {c.hrv != null && <div><dt>VFC</dt><dd>{c.hrv} ms</dd></div>}
      </dl>
    </section>
  );
}

const EFFECT: Record<string, string> = { lite: "allégée", rest: "remplacée par du repos actif" };

/** Commentaire libre du jour : modifiable depuis le calendrier, lu par l’IA, qui peut alléger la séance concernée. */
function DayComment({ date, today, note, onSaved }: { date: string; today: string; note: CalData["notes"][number] | null; onSaved: () => Promise<void> | void }) {
  const [text, setText] = useState(note?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Dernier texte enregistré : le champ n’est jamais réinitialisé pendant que tu écris.
  const [base, setBase] = useState(note?.note ?? "");
  const dirty = text.trim() !== base;
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await api<{ signals: { resume: string } | null; effect: { date: string; title: string; verdict: string } | null }>("/api/notes", { method: "PUT", body: { date, today, note: text } });
      const m = !text.trim() ? "Commentaire supprimé." : r.effect
        ? `${r.effect.title} (${dayLabel(r.effect.date, { weekday: "long", day: "numeric", month: "long" })}) : séance ${EFFECT[r.effect.verdict] ?? "adaptée"}. Tu peux la rétablir si tu n’es pas d’accord.`
        : date < today ? "Commentaire enregistré dans ton carnet." : "Commentaire enregistré : rien à changer dans ton planning.";
      setBase(text.trim()); setMsg(m);
      await onSaved();
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Erreur"); }
    finally { setBusy(false); }
  }
  return (
    <form className="cal-comment" onSubmit={save}>
      <label><small className="cal-kicker">Commentaire du jour</small>
        <textarea value={text} onChange={(e) => { setText(e.target.value); setMsg(null); }} maxLength={500} rows={2}
          placeholder={date > today ? "Déplacement, peu de temps, événement prévu ce jour-là…" : "Sensations, fatigue, douleur, contexte de la journée…"} />
      </label>
      {note?.resume && !dirty && note.note === base && <p className="cal-ai"><b>Compris par le coach :</b> {note.resume}</p>}
      {msg && <p className="cal-ai ok" role="status">{msg}</p>}
      {err && <p className="note err" role="alert">{err}</p>}
      <div className="row between">
        <small className="muted">{date < today ? "Gardé dans ton carnet." : "Lu par l’IA du coach, qui peut alléger la séance concernée."}</small>
        <button className="btn sm" disabled={busy || !dirty}>{busy ? "Analyse…" : "Enregistrer"}</button>
      </div>
    </form>
  );
}

const STATUS: Record<string, string> = { planned: "prévue", adapted: "adaptée", done: "faite", skipped: "sautée", missed: "manquée" };
