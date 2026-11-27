"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { openPanel } from "./panel";
import StrengthButton from "./StrengthButton";
import { api, dayLabel, fmtDur, fmtKm, fmtNum, SPORT_LABEL, type Absence, type PlanSession, type Targets } from "./client";
import { IconCheck, IconRuns, IconSkip, IconTerrain, IconUndo, IconWatch } from "./icons";
import { StatusChip } from "./Today";
import { SessionTarget } from "./Targets";
import { dayOf, useForecast } from "./useForecast";
import { downloadWorkout } from "./workout";
import { ReviewLine } from "./Planning";
import { ZONES } from "@/lib/engine/legs";
import { FicheHead } from "./Fiche";
import { movable, type planActions } from "./planActions";
import { haptic } from "@/components/haptics";
import { IntakeLogger, SweatTest } from "./FuelKit";

export interface Extra { id: number; date: string; sport: string; name: string | null; duration_min: number; distance_km: number | null; gain_m: number | null; source: string }
export interface CalData {
  month: string; today: string; from: string; to: string;
  sessions: PlanSession[]; extras: Extra[];
  checkins: { date: string; sleep: number; legs: number; motivation: number; pain: number; zones: string[]; sleepH: number | null; rhr: number | null; hrv: number | null; score: number }[];
  notes: { date: string; note: string; resume: string | null }[];
  fuel?: { date: string; feel: string }[];
  races: { date: string; name: string; main: boolean }[];
  absence: Absence | null;
}
const QUALITY = new Set(["tempo", "hills", "climb", "downhill", "sharpen"]);
/** Famille de séance : sert à la couleur de la pastille et à la légende. */
export const kindOf = (t: string) => (t === "race" ? "race" : t === "strength" ? "renfo" : t === "recovery" || t === "rest" ? "recup" : QUALITY.has(t) ? "qual" : "endu");
export const KIND_LABEL: Record<string, string> = { endu: "Endurance", qual: "Qualité", renfo: "Renforcement", recup: "Récupération", race: "Course" };
const ABSENCE_LABEL: Record<string, string> = { malade: "Malade", blesse: "Blessé", deplacement: "En déplacement" };
const add = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

type Actions = ReturnType<typeof planActions>;

/**
 * Fiche d'un jour du planning (ou d'une séance) : la ou les séances du jour avec leurs repères (allures, cardio,
 * météo), la description, ce qui a été réalisé et son bilan, les actions (faite, sauter, déplacer à un autre jour,
 * où la faire, sur ma montre, renforcement), les sorties hors plan, le check-in du matin et le commentaire du jour.
 * Ouverte depuis la liste du planning, le calendrier et la séance du jour de l'accueil.
 */
export default function DaySheet({ date, focus, today, targets, data: given, actions, onWhere, onChanged, close }: {
  date: string; focus?: number; today: string; targets?: Targets;
  /** Données du mois déjà chargées (calendrier) ; sinon la fiche les charge. */
  data?: CalData | null;
  actions: Actions; onWhere: (s: PlanSession) => void; onChanged: () => Promise<unknown> | void; close: () => void;
}) {
  const [own, setOwn] = useState<CalData | null>(null);
  const month = date.slice(0, 7);
  const load = useCallback(() => api<CalData>(`/api/plan/month?month=${month}&today=${today}`).then(setOwn).catch(() => {}), [month, today]);
  useEffect(() => { if (!given) load(); }, [given, load]);
  useEffect(() => { if (given) return; const on = () => { load(); }; window.addEventListener("tp-plan-changed", on); return () => window.removeEventListener("tp-plan-changed", on); }, [given, load]);
  const data = given ?? own;
  const fc = useForecast(today);
  const [moving, setMoving] = useState<number | null>(null);

  const day = useMemo(() => {
    if (!data) return null;
    const sessions = data.sessions.filter((s) => s.date === date && s.template !== "race").sort((a, b) => (a.id === focus ? -1 : b.id === focus ? 1 : 0));
    return {
      sessions, extras: data.extras.filter((a) => a.date === date), race: data.races.find((r) => r.date === date) ?? null,
      check: data.checkins.find((c) => c.date === date) ?? null, note: data.notes.find((n) => n.date === date) ?? null,
      absent: !!data.absence && date >= data.absence.start && date <= data.absence.end,
    };
  }, [data, date, focus]);
  const one = day?.sessions.length === 1 ? day.sessions[0] : null;
  const eyebrow = `${dayLabel(date, { weekday: "long", day: "numeric", month: "long" })}${date === today ? " · aujourd’hui" : ""}`;
  const title = one ? one.title : day?.race ? `⚑ ${day.race.name}` : dayLabel(date, { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <FicheHead eyebrow={one ? `${eyebrow} · ${one.phase}` : date === today ? "Aujourd’hui" : "Planning"} title={title} onClose={close}
        chips={<>{one && <StatusChip status={one.status} />}{day?.check && <span className="chip dim" title="Ressenti déclaré au check-in (sommeil, jambes, motivation, douleur)">Ressenti {day.check.score}/100</span>}</>} />
      <div className="panel-body day-sheet">
        {!data || !day ? <div className="skeleton" style={{ height: 260 }} /> : (
          <>
            {day.race && (
              <div className="day-race">
                <span>⚑ {day.race.main ? "Jour J" : "Course de préparation"} : <b>{day.race.name}</b></span>
                {date <= today
                  ? <button type="button" className="btn ghost sm" onClick={(e) => openPanel({ kind: "race", date }, e.currentTarget)}>Voir le débrief</button>
                  : <button type="button" className="btn ghost sm" onClick={() => { close(); window.setTimeout(() => window.dispatchEvent(new CustomEvent("tp-go", { detail: "plan" })), 380); }}>Voir ma course</button>}
              </div>
            )}
            {day.absent && data.absence && <p className="muted small" style={{ margin: 0 }}>{ABSENCE_LABEL[data.absence.kind] ?? "Imprévu"} : séances suspendues ou allégées sur cette période.</p>}
            {day.sessions.map((s, i) => (
              <SessionCard key={s.id} s={s} solo={!!one} i={i} today={today} targets={targets} day={s.date >= today ? dayOf(fc, s.date) : null}
                feel={data.fuel?.find((f) => f.date === s.date)?.feel ?? null} actions={actions} onWhere={(x) => { close(); window.setTimeout(() => onWhere(x), 380); }}
                onChanged={onChanged} moving={moving === s.id} onMove={(on) => setMoving(on ? s.id : null)} />
            ))}
            {/* Sortie de 75 min et plus (prévue ou non) : ce qui a été mangé et bu, en glucides par heure. */}
            {date <= today && (day.sessions.some((s) => s.status === "done" && (s.a_duration ?? 0) >= 75) || day.extras.some((a) => a.duration_min >= 75)) && (
              <IntakeLogger key={`in-${date}`} date={date} today={today} onSaved={() => { window.dispatchEvent(new CustomEvent("tp-plan-changed")); }} />
            )}
            {/* Sortie d'une heure ou plus : test de sudation (pesée avant et après). */}
            {date <= today && (day.sessions.some((s) => s.status === "done" && (s.a_duration ?? 0) >= 60) || day.extras.some((a) => a.duration_min >= 60)) && (
              <SweatTest key={`sw-${date}`} date={date} today={today} />
            )}
            {day.extras.map((a) => (
              <button key={a.id} type="button" className="day-extra" onClick={(e) => openPanel({ kind: "run", id: a.id, initial: { id: a.id, date: a.date, sport: a.sport, name: a.name, duration_min: a.duration_min, distance_km: a.distance_km, gain_m: a.gain_m } }, e.currentTarget)}>
                <span className="eyebrow">Hors plan</span>
                <b>{a.name ?? SPORT_LABEL[a.sport] ?? a.sport}</b>
                <small>{SPORT_LABEL[a.sport] ?? a.sport} · {fmtDur(a.duration_min)}{a.distance_km ? ` · ${fmtKm(a.distance_km)} km` : ""}{a.gain_m ? ` · ${fmtNum(a.gain_m)} m D+` : ""}{a.source === "strava" ? " · Strava" : ""}</small>
                <span className="day-go" aria-hidden="true">›</span>
              </button>
            ))}
            {!day.sessions.length && !day.extras.length && !day.race && <p className="day-rest">{day.absent ? "Rien de prévu." : date < today ? "Jour de repos." : "Repos prévu. Profite-en pour bien dormir."}</p>}
            {day.check && <CheckinRecap c={day.check} />}
            <DayComment key={date} date={date} today={today} note={day.note} onSaved={async () => { if (!given) await load(); await onChanged(); }} />
          </>
        )}
      </div>
    </>
  );
}

/** Une séance du jour : repères, description, réalisé, actions. */
function SessionCard({ s, solo, i, today, targets, day, feel, actions, onWhere, onChanged, moving, onMove }: {
  s: PlanSession; solo: boolean; i: number; today: string; targets?: Targets; day: ReturnType<typeof dayOf>; feel: string | null;
  actions: Actions; onWhere: (s: PlanSession) => void; onChanged: () => Promise<unknown> | void; moving: boolean; onMove: (on: boolean) => void;
}) {
  const original = s.original ? (JSON.parse(s.original) as { title: string; durationMin: number }) : null;
  const can = movable(s, today);
  const watch = s.template !== "strength" && s.template !== "recovery";
  return (
    <article className={`day-sess ev-${kindOf(s.template)}-b`} style={{ ["--i" as string]: i }}>
      {!solo && <div className="row between"><b className="day-sess-t">{s.title}</b><StatusChip status={s.status} /></div>}
      <div className="fiche-kpis">
        <div className="fk reveal" style={{ ["--i" as string]: 0 }}><b>{fmtDur(s.duration_min)}</b><small>Durée</small></div>
        <div className="fk reveal" style={{ ["--i" as string]: 1 }}><b>{s.rpe_target}/10</b><small>Effort</small></div>
        {s.gain_m ? <div className="fk reveal" style={{ ["--i" as string]: 2 }}><b>{fmtNum(s.gain_m)}</b><i>m</i><small>D+ visé</small></div> : <div className="fk reveal" style={{ ["--i" as string]: 2 }}><b className="fk-txt">{SPORT_LABEL[s.sport] ?? s.sport}</b><small>Activité</small></div>}
      </div>
      {s.status === "done" && s.a_duration != null && (
        <div className="day-real">
          <div><small>Réalisé{s.a_name ? ` · ${s.a_name}` : ""}</small><b>{fmtDur(s.a_duration)}{s.a_distance ? ` · ${fmtKm(s.a_distance)} km` : ""}{s.a_gain ? ` · ${fmtNum(s.a_gain)} m D+` : ""}</b></div>
          {s.activity_id && <button type="button" className="btn ghost sm" onClick={(e) => openPanel({ kind: "run", id: s.activity_id!, initial: { id: s.activity_id!, name: s.a_name ?? null, date: s.date, duration_min: s.a_duration ?? 0, distance_km: s.a_distance ?? null, gain_m: s.a_gain ?? null } }, e.currentTarget)}><IconRuns />Voir la sortie</button>}
        </div>
      )}
      {s.review && <ReviewLine r={s.review} />}
      {s.status === "done" && /Alimentation à entraîner/.test(s.description) && <FuelFeel date={s.date} today={today} feel={feel} onSaved={onChanged} />}
      {s.status !== "done" && s.template !== "recovery" && <SessionTarget targets={targets} template={s.template} rpe={s.rpe_target} duration={s.duration_min} title={s.title} gain={s.gain_m} sport={s.sport} day={day} />}
      <p className="day-desc">{s.description}</p>
      {original && <p className="muted small" style={{ margin: 0 }}>Prévu initialement : {original.title}, {fmtDur(original.durationMin)}.</p>}
      {can && (
        <div className="day-main-acts">
          <button type="button" className="btn" onClick={() => { haptic("success"); actions.setStatus(s, "done"); }}><IconCheck />C’est fait</button>
          <button type="button" className="btn ghost" onClick={() => actions.setStatus(s, "skipped")}><IconSkip />Sauter</button>
          <button type="button" className={`btn ghost${moving ? " on" : ""}`} aria-expanded={moving} onClick={() => onMove(!moving)}>Déplacer</button>
        </div>
      )}
      {can && moving && <MoveStrip s={s} today={today} onPick={(d, swap) => { onMove(false); actions.moveTo(s, d, swap); }} />}
      {(can || s.status === "missed" || s.status === "skipped" || (s.status === "done" && !s.activity_id) || (s.original && can)) && (
        <div className="row day-acts">
          {can && <button type="button" className="btn ghost sm where" onClick={() => onWhere(s)}><IconTerrain />Où la faire ?</button>}
          {can && watch && <button type="button" className="btn ghost sm where" onClick={() => downloadWorkout(s, targets)}><IconWatch />Sur ma montre</button>}
          {can && watch && <button type="button" className="iconbtn sm" aria-label="Comment mettre la séance sur ma montre" onClick={() => window.dispatchEvent(new CustomEvent("tp-watch-help", { detail: "" }))}>?</button>}
          {can && <StrengthButton s={s} onDone={s.template === "strength" ? () => actions.setStatus(s, "done") : undefined} />}
          {(s.status === "skipped" || (s.status === "done" && !s.activity_id)) && <button type="button" className="btn ghost sm" onClick={() => actions.setStatus(s, "planned")}><IconUndo />Rétablir</button>}
          {s.original && can && <button type="button" className="btn ghost sm" onClick={() => actions.restore(s)}><IconUndo />Rétablir la séance prévue</button>}
          {s.status === "missed" && <button type="button" className="btn ghost sm" onClick={() => actions.setStatus(s, "done")}><IconCheck />Je l’ai faite</button>}
        </div>
      )}
    </article>
  );
}

/**
 * Déplacer une séance : les deux semaines à venir en pastilles (les séances déjà prévues sont marquées).
 * Choisir un jour où une séance déplaçable est prévue les échange.
 */
function MoveStrip({ s, today, onPick }: { s: PlanSession; today: string; onPick: (date: string, swap: PlanSession | null) => void }) {
  const [sessions, setSessions] = useState<PlanSession[] | null>(null);
  useEffect(() => { api<{ sessions: PlanSession[] }>("/api/plan").then((v) => setSessions(v.sessions)).catch(() => setSessions([])); }, []);
  const days = Array.from({ length: 14 }, (_, k) => add(today, k)).filter((d) => d !== s.date);
  return (
    <div className="move-strip" role="group" aria-label={`Déplacer « ${s.title} » au…`}>
      <small className="cal-kicker">Déplacer au…</small>
      <div className="move-days">
        {days.map((d, k) => {
          const there = sessions?.filter((x) => x.date === d) ?? [];
          const race = there.some((x) => x.template === "race");
          const swap = there.find((x) => movable(x, today)) ?? null;
          return (
            <button key={d} type="button" className={`move-day${there.length ? " has" : ""}`} disabled={!sessions || race} style={{ ["--i" as string]: k }}
              aria-label={`${dayLabel(d, { weekday: "long", day: "numeric", month: "long" })}${swap ? `, échange avec ${swap.title}` : there.length ? `, ${there.map((x) => x.title).join(", ")}` : ", libre"}`}
              onClick={() => onPick(d, swap)}>
              <small>{dayLabel(d, { weekday: "short" }).replace(".", "")}</small>
              <b>{Number(d.slice(8))}</b>
              <span className="move-dots" aria-hidden="true">{there.slice(0, 3).map((x) => <i key={x.id} className={`ev-${kindOf(x.template)}`} />)}</span>
            </button>
          );
        })}
      </div>
      <small className="muted">Un jour où une séance est déjà prévue : les deux séances échangent leurs jours.</small>
    </div>
  );
}

const FEEL: [string, string][] = [["ok", "Passé sans souci"], ["limite", "Un peu limite"], ["ko", "Ça n’est pas passé"]];
/** Après une sortie longue : l'alimentation testée est-elle passée ? La quantité de la sortie suivante s'ajuste. */
function FuelFeel({ date, today, feel, onSaved }: { date: string; today: string; feel: string | null; onSaved: () => Promise<unknown> | void }) {
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

/** Le check-in tel qu'il a été rempli ce jour-là. */
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

/** Commentaire libre du jour : lu par l'IA, qui peut alléger la séance concernée. */
function DayComment({ date, today, note, onSaved }: { date: string; today: string; note: CalData["notes"][number] | null; onSaved: () => Promise<unknown> | void }) {
  const [text, setText] = useState(note?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Dernier texte enregistré : le champ n'est jamais réinitialisé pendant que tu écris.
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
      window.dispatchEvent(new CustomEvent("tp-plan-changed"));
      await onSaved();
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Erreur"); }
    finally { setBusy(false); }
  }
  return (
    <form className="cal-comment" onSubmit={save}>
      <label><small className="cal-kicker">Commentaire du jour</small>
        <textarea value={text} onChange={(e) => { setText(e.target.value); setMsg(null); }} maxLength={500} rows={3}
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
