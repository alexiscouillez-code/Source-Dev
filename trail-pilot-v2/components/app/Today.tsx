"use client";

import { openPanel } from "./panel";
import { haptic } from "@/components/haptics";
import TodayRun from "@/components/night/TodayRun";
import StrengthButton from "./StrengthButton";
import { useEffect, useState } from "react";
import type { Ctx } from "./AppShell";
import InfoTip, { EXPLAIN } from "./InfoTip";
import { SessionTarget } from "./Targets";
import { dayOf, useForecast } from "./useForecast";
import { ZONES } from "@/lib/engine/legs";
import Onboarding from "./Onboarding";
import Coach from "./Coach";
import WeekCard from "./WeekCard";
import { api, dayLabel, fmtDur, fmtKm, fmtNum, localToday, SPORT_LABEL, VERDICT, type Me, type PlanSession } from "./client";
import { QUICK_EVENT, takeQuick } from "./quick";
import { Fiche, FicheHead, useFiche } from "./Fiche";
import DaySheet from "./DaySheet";
import { planActions } from "./planActions";
import { useMemo } from "react";

export default function Today({ me, refresh, go, toast }: Ctx) {
  // Check-in, séance du jour et coach : en fiches, par-dessus l'accueil.
  const ci = useFiche<true>(), sheet = useFiche<PlanSession>(), coach = useFiche<true>();
  const openCi = ci.open;
  // Action rapide « Check-in du jour » (bouton + de la barre du bas, raccourci) : ouvre la fiche du check-in.
  useEffect(() => {
    const on = () => { if (takeQuick("checkin")) window.setTimeout(() => openCi(true, document.querySelector<HTMLElement>(".ci-cta, .verdict")), 60); };
    on();
    window.addEventListener(QUICK_EVENT, on);
    return () => window.removeEventListener(QUICK_EVENT, on);
  }, [openCi]);
  const actions = useMemo(() => planActions({ toast, after: () => refresh() }), [toast, refresh]);
  const [busy, setBusy] = useState(false);
  const firstName = me.user.name?.split(" ")[0];
  const hour = new Date().getHours();
  const hello = hour < 5 ? "Bonsoir" : hour < 18 ? "Bonjour" : "Bonsoir";

  async function generate() {
    setBusy(true);
    try { await api("/api/plan", { method: "POST" }); await refresh(); toast("Ton planning des 3 prochaines semaines est prêt."); }
    catch (e) { toast(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); }
  }

  return (
    <>
      {me.onboarding && <Onboarding me={me} refresh={refresh} go={go} toast={toast} />}
      {/* En-tête compact : l'action du jour doit arriver vite à l'écran. */}
      <header className="head today-head">
        <div>
          <span className="eyebrow">{dayLabel(me.today)}</span>
          <h1>{hello}{firstName ? `, ${firstName}` : ""}.</h1>
        </div>
        {me.goal && <span className="chip ember th-goal"><span className="dot" />{me.goal.phase} · {me.goal.name}</span>}
      </header>

      {!me.strava.connected && me.strava.configured && (
        <div className="banner" style={{ marginBottom: 14 }}>
          <div><b>Connecte Strava</b><div className="small muted">Tes sorties s’importent automatiquement et ta charge se calcule toute seule.</div></div>
          <a className="btn strava sm" href="/api/strava/connect">Connecter Strava</a>
        </div>
      )}

      {me.goal && me.goal.daysToGoal != null && me.goal.daysToGoal >= 1 && me.goal.daysToGoal <= 2 && (
        <div className="banner" style={{ marginBottom: 14 }}>
          <div>
            <b>{me.goal.daysToGoal === 1 ? "C’est demain : prépare ton sac" : "Dans 2 jours : vérifie ton matériel"}</b>
            <div className="small muted">{me.goal.gear ? `Matériel obligatoire : ${me.goal.gear.ready}/${me.goal.gear.total} prêt${me.goal.gear.ready > 1 ? "s" : ""}.` : "Saisis la liste du matériel obligatoire de ta course pour la cocher en faisant ton sac."}</div>
          </div>
          <button className="btn sm" onClick={() => go("plan")}>Voir ma liste</button>
        </div>
      )}
      {me.goal?.daysToGoal === 0 && (
        <div className="banner raceday-banner" style={{ marginBottom: 14 }}>
          <div><b>C’est le jour J</b><div className="small muted">Ouvre le mode jour de course : chrono, prochain ravito, rappels pour manger et boire.</div></div>
          <button className="btn sm" onClick={() => go("plan")}>Mode jour de course</button>
        </div>
      )}
      {/* Téléphone : une colonne. Grand écran : « Ta journée » à gauche, la course, la forme et la semaine à droite. */}
      <div className="today-grid">
        <DayCard me={me} go={go} busy={busy} generate={generate} refresh={refresh} toast={toast} onCheckin={(el) => ci.open(true, el)} onSession={(x, el) => sheet.open(x, el)} />
        {!me.goal && (
          <div className="banner today-goal">
            <div><b>Choisis ta course</b><div className="small muted">Un plan jusqu’au jour J, construit à partir de ta charge actuelle pour que tu finisses.</div></div>
            <button className="btn sm" onClick={() => go("plan")}>Choisir ma course</button>
          </div>
        )}
        <div className="today-run"><TodayRun today={me.today} onTerrains={() => go("terrains")} /></div>
        <FormCard me={me} go={go} onAsk={(el) => coach.open(true, el)} />
        <WeekCard today={me.today} toast={toast} />
        {Number(me.today.slice(8, 10)) <= 5 && me.recent.length > 0 && <RecapTeaser today={me.today} />}
      </div>
      <Fiche ctl={ci} kind="checkin">
        {ci.value && <CheckinCard me={me} close={ci.close} onDone={async (msg) => { ci.close(); await refresh(); toast(msg); }} />}
      </Fiche>
      <Fiche ctl={sheet} kind="day">
        {sheet.value && <DaySheet date={sheet.value.date} focus={sheet.value.id} today={me.today} targets={me.targets} actions={actions}
          onWhere={(x) => { try { sessionStorage.setItem("tp-terrain-preset", JSON.stringify({ title: x.title, date: x.date, template: x.template, durationMin: x.duration_min, gainM: x.gain_m })); } catch { /* stockage indisponible */ } go("terrains"); }}
          onChanged={refresh} close={sheet.close} />}
      </Fiche>
      <Fiche ctl={coach} kind="coach">
        {coach.value && <><FicheHead eyebrow="Coach" title="Pose ta question" onClose={coach.close} /><div className="panel-body"><Coach toast={toast} /></div></>}
      </Fiche>
    </>
  );
}

/**
 * Troisième bloc : où en est ma forme, en une phrase, avec trois repères.
 * Le détail (courbes, zones, records) est dans Analyse.
 */
function FormCard({ me, go, onAsk }: { me: Me; go: Ctx["go"]; onAsk: (el: HTMLElement) => void }) {
  const l = me.load, f = l.form;
  const line = !l.calibrated ? `Calibrage en cours (${l.historyDays} jours sur 28) : les repères se fiabilisent au fil des séances.`
    : f <= -25 ? "Fatigue marquée : la charge récente dépasse nettement ce que tu as l’habitude d’encaisser."
    : f <= -10 ? "Tu assimiles une charge en hausse : c’est là que tu progresses, garde les jours faciles faciles."
    : f < 5 ? "Charge bien absorbée : tu es dans le rythme."
    : "Tu as de la réserve : bon moment pour une séance clé ou une course.";
  const pace = l.ratio == null ? "—" : l.ratio > 1.3 ? "trop rapide" : l.ratio < 0.8 ? "en retrait" : "maîtrisé";
  return (
    <section className="card form-card" aria-labelledby="form-title">
      <div className="card-head">
        <div><span className="eyebrow">Ma forme</span><h2 id="form-title" style={{ marginTop: 4 }}>{line}</h2></div>
      </div>
      <dl className="form-facts">
        <div><dt>Fraîcheur<InfoTip title="Fraîcheur">{EXPLAIN.form}</InfoTip></dt><dd>{(f > 0 ? "+" : "") + fmtNum(f)}</dd></div>
        <div><dt>Rythme de progression<InfoTip title="Rythme de progression">{EXPLAIN.ratio}</InfoTip></dt><dd>{pace}</dd></div>
        <div><dt>Charge sur 7 jours</dt><dd>{fmtNum(l.load7 ?? 0)}</dd></div>
      </dl>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost sm" onClick={() => go("analysis")}>Voir l’analyse</button>
        <button className="btn ghost sm" aria-haspopup="dialog" onClick={(e) => onAsk(e.currentTarget)}>Poser une question au coach</button>
      </div>
    </section>
  );
}

export function StatusChip({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    planned: ["Prévu", ""], adapted: ["Adapté", "lite"], done: ["Fait", "ok"], skipped: ["Sautée", "dim"], missed: ["Manquée", "dim"],
  };
  const [label, cls] = map[status] ?? [status, ""];
  return <span className={`chip ${cls}`}>{status === "done" && <svg className="tick" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" pathLength={1} /></svg>}{label}</span>;
}

export function SessionBlock({ s, targets }: { s: PlanSession; targets?: Me["targets"] }) {
  const original = s.original ? (JSON.parse(s.original) as { title: string; durationMin: number }) : null;
  const fc = useForecast(localToday());
  return (
    <div className="session">
      <div className="row between"><span className="eyebrow">{dayLabel(s.date, { weekday: "long", day: "numeric", month: "short" })} · {s.phase}</span><StatusChip status={s.status} /></div>
      <div className="session-title">{s.title}</div>
      <div className="specs">
        <div><b>{fmtDur(s.duration_min)}</b><small>Durée</small></div>
        <div><b>{s.rpe_target}/10</b><small>Effort</small></div>
        {s.gain_m ? <div><b>{s.gain_m} m</b><small>D+ visé</small></div> : null}
        <div><b>{SPORT_LABEL[s.sport] ?? s.sport}</b><small>Activité</small></div>
      </div>
      <SessionTarget targets={targets} template={s.template} rpe={s.rpe_target} duration={s.duration_min} title={s.title} gain={s.gain_m} sport={s.sport} day={dayOf(fc, s.date)} />
      <p className="soft small" style={{ margin: 0 }}>{s.description}</p>
      <div className="row"><StrengthButton s={s} /></div>
      {original && <p className="muted small" style={{ margin: 0 }}>Prévu initialement : {original.title}, {fmtDur(original.durationMin)}.</p>}
    </div>
  );
}

/**
 * « Ta journée » : une seule carte qui enchaîne check-in, décision et séance, avec un seul bouton principal à la
 * fois. Avant le check-in, la séance n'est qu'un aperçu discret ; après, la décision colore la carte et la séance
 * devient l'action. Trois étapes en haut montrent où on en est.
 */
function DayCard({ me, go, busy, generate, refresh, toast, onCheckin, onSession }: { me: Me; go: Ctx["go"]; busy: boolean; generate: () => void; refresh: Ctx["refresh"]; toast: Ctx["toast"]; onCheckin: (el: HTMLElement) => void; onSession: (s: PlanSession, el: HTMLElement) => void }) {
  const d = me.decision, v = d ? VERDICT[d.verdict] : null;
  const doneToday = me.todayPlan?.status === "done";
  const s = me.todayPlan && !doneToday ? me.todayPlan : me.tomorrowPlan;
  const step = !d ? 0 : doneToday ? 3 : 2;
  const card = (e: React.MouseEvent) => (e.currentTarget as HTMLElement).closest<HTMLElement>(".day-card") ?? (e.currentTarget as HTMLElement);
  return (
    <section className={`card day-card ${d ? "verdict" : "ci-cta"}`} style={v ? { ["--accent" as string]: v.color } : undefined} aria-labelledby="day-title" aria-live="polite">
      <div className="row between dc-top">
        <span className="eyebrow">Ta journée</span>
        <ol className="dc-steps" style={{ ["--step" as string]: step }} aria-label={`Étape ${Math.min(step + 1, 3)} sur 3`}>
          {["Check-in", "Décision", "Séance"].map((l, i) => <li key={l} className={i < step ? "is-done" : i === step ? "is-now" : undefined}><i aria-hidden="true" />{l}</li>)}
        </ol>
      </div>
      {!d || !v ? (
        <div className="dc-ask">
          <h2 id="day-title">Comment tu te sens ce matin ?</h2>
          <p className="soft small" style={{ margin: 0 }}>Sommeil, jambes, motivation, douleur : 10 secondes, et ta séance s’adapte à ta forme.</p>
          <span className="cta-dots" aria-hidden="true">{[0, 1, 2, 3].map((i) => <i key={i} style={{ ["--i" as string]: i }} />)}</span>
          <button type="button" className="btn" aria-haspopup="dialog" onClick={(e) => onCheckin(card(e))}>Faire mon check-in</button>
        </div>
      ) : (
        <div className="dc-decision">
          <div className="verdict-row">
            <div><span className="eyebrow">Décision du jour</span><div id="day-title" className="verdict-big verdict-stamp" key={d.verdict}>{v.label}</div></div>
            <FormGauge score={d.score} />
          </div>
          <div className="meter" role="img" aria-label={`Forme ressentie ${d.score} sur 100`}><i style={{ width: `${d.score}%` }} /></div>
          <p style={{ margin: 0, fontSize: 17 }}>{v.line}</p>
          <ul className="reasons">{d.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          {me.checkin?.note && <p className="ci-said"><small>Ton commentaire</small>{me.checkin.note}{me.dayNote?.resume && <em>Compris par le coach : {me.dayNote.resume}</em>}</p>}
          <button className="link small dc-edit" aria-haspopup="dialog" onClick={(e) => onCheckin(card(e))}>Modifier mon check-in</button>
        </div>
      )}
      {doneToday && me.todayPlan && <DoneBlock p={me.todayPlan} go={go} refresh={refresh} toast={toast} />}
      <div className={`dc-next${d ? "" : " is-quiet"}`}>
        <div className="row between">
          <span className="eyebrow" id="next-title">{s ? (s === me.todayPlan ? "Séance du jour" : "Demain") : "Au programme"}</span>
          <button className="link small" onClick={() => go("plan")}>Tout le planning</button>
        </div>
        {s ? <SessionTile s={s} quiet={!d} onOpen={(el) => onSession(s, el)} />
          : me.needsPlan ? (
            <div className="empty">
              Aucun planning pour l’instant. Trail Pilot le construit à partir de ton historique, de tes disponibilités et de ton objectif.
              <div><button className={`btn${d ? "" : " ghost"}`} onClick={generate} disabled={busy}>{busy ? "Calcul…" : "Générer mon planning"}</button></div>
            </div>
          ) : <p className="empty">Repos prévu. Profite-en pour bien dormir.</p>}
      </div>
    </section>
  );
}

const FEELS = [{ v: 3, label: "Facile" }, { v: 5, label: "Correct" }, { v: 7, label: "Dur" }, { v: 9, label: "Très dur" }];
const nearestFeel = (rpe: number | null | undefined) => (rpe == null ? null : FEELS.reduce((a, b) => (Math.abs(b.v - rpe) < Math.abs(a.v - rpe) ? b : a)).v);

/**
 * Séance faite : prévu / réalisé en une ligne, le verdict (tenue, courte, trop intense…) et le ressenti en une touche.
 * Le ressenti remplace l'effort estimé de la sortie dans le calcul de la charge : la décision de demain en tient compte.
 */
function DoneBlock({ p, go, refresh, toast }: { p: PlanSession; go: Ctx["go"]; refresh: Ctx["refresh"]; toast: Ctx["toast"] }) {
  const [rpe, setRpe] = useState<number | null>(nearestFeel(p.a_rpe));
  const [busy, setBusy] = useState(false);
  const save = async (v: number) => {
    if (!p.activity_id || busy) return;
    const was = rpe;
    setRpe(v); setBusy(true); haptic("tap");
    try {
      await api(`/api/activities/${p.activity_id}`, { method: "PATCH", body: { rpe: v } });
      toast("Ressenti noté : la décision de demain en tient compte.");
      await refresh();
    } catch (e) { setRpe(was); toast((e as Error).message || "Ressenti non enregistré."); } finally { setBusy(false); }
  };
  return (
    <div className="dc-done">
      <div className="dc-done-head">
        <span className="dc-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" /></svg></span>
        <div><span className="eyebrow">Séance faite</span><b>{p.title}</b></div>
      </div>
      {p.a_duration != null ? (
        <p className="dc-cmp">
          <span><small>Prévu</small>{fmtDur(p.duration_min)}{p.gain_m ? ` · ${p.gain_m} m D+` : ""}</span>
          <i aria-hidden="true">→</i>
          <span><small>Fait</small>{fmtDur(p.a_duration)}{p.a_distance ? ` · ${fmtKm(p.a_distance)} km` : ""}{p.a_gain ? ` · ${p.a_gain} m D+` : ""}</span>
        </p>
      ) : <p className="small soft" style={{ margin: 0 }}>Marquée faite à la main. <button className="link small" onClick={() => go("runs")}>Ajoute ta sortie</button> pour comparer au prévu.</p>}
      {p.review && <p className={`dc-review is-${p.review.verdict}`}>{p.review.label}</p>}
      {p.activity_id != null && (
        <div className="dc-feel">
          <span className="small" id={`feel-${p.id}`}>{rpe ? "Ton ressenti" : "Comment c’était ?"}</span>
          <div className="dc-feel-btns" role="group" aria-labelledby={`feel-${p.id}`}>
            {FEELS.map((f) => <button key={f.v} type="button" aria-pressed={rpe === f.v} disabled={busy} onClick={() => save(f.v)}>{f.label}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

/** Séance du jour (ou de demain) en résumé ; la toucher ouvre sa fiche complète. `quiet` : simple aperçu (avant le check-in). */
function SessionTile({ s, onOpen, quiet = false }: { s: PlanSession; onOpen: (el: HTMLElement) => void; quiet?: boolean }) {
  if (quiet) return (
    <button type="button" className="session session-tile is-quiet" aria-haspopup="dialog" onClick={(e) => onOpen(e.currentTarget)}>
      <span className="st-q"><b>{s.title}</b><small>{fmtDur(s.duration_min)} · effort {s.rpe_target}/10{s.gain_m ? ` · ${s.gain_m} m D+` : ""}</small></span>
      <span className="st-go" aria-hidden="true">›</span>
    </button>
  );
  return (
    <button type="button" className="session session-tile" aria-haspopup="dialog" onClick={(e) => onOpen(e.currentTarget)}>
      <span className="row between"><span className="eyebrow">{dayLabel(s.date, { weekday: "long", day: "numeric", month: "short" })} · {s.phase}</span><StatusChip status={s.status} /></span>
      <span className="session-title">{s.title}</span>
      <span className="specs">
        <span><b>{fmtDur(s.duration_min)}</b><small>Durée</small></span>
        <span><b>{s.rpe_target}/10</b><small>Effort</small></span>
        {s.gain_m ? <span><b>{s.gain_m} m</b><small>D+ visé</small></span> : null}
        <span><b>{SPORT_LABEL[s.sport] ?? s.sport}</b><small>Activité</small></span>
      </span>
      <span className="tile-more">Allures, météo, description et actions<span aria-hidden="true">›</span></span>
    </button>
  );
}

/** Jauge de forme : l’arc se remplit jusqu’au score du check-in. */
function FormGauge({ score }: { score: number }) {
  const r = 34, c = Math.PI * r; // demi-cercle
  return (
    <div className="gauge" role="img" aria-label={`Forme du jour ${score} sur 100`}>
      <svg viewBox="0 0 84 48" aria-hidden="true">
        <path d="M8 44 A34 34 0 0 1 76 44" className="g-bg" />
        <path d="M8 44 A34 34 0 0 1 76 44" className="g-val" style={{ strokeDasharray: c, ["--off" as string]: `${c * (1 - score / 100)}`, strokeDashoffset: c * (1 - score / 100) }} />
      </svg>
      <b className="num-up">{score}</b><small>forme</small>
    </div>
  );
}

const SCALES = [
  { key: "sleep", label: "Sommeil", low: "Très mauvais", high: "Excellent" },
  { key: "legs", label: "Jambes", low: "Très lourdes", high: "Fraîches" },
  { key: "motivation", label: "Motivation", low: "À plat", high: "À bloc" },
] as const;

function CheckinCard({ me, onDone, close }: { me: Me; onDone: (msg: string) => Promise<void>; close: () => void }) {
  const [v, setV] = useState({ sleep: me.checkin?.sleep ?? 3, legs: me.checkin?.legs ?? 3, motivation: me.checkin?.motivation ?? 3, pain: me.checkin?.pain ?? 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState(me.checkin?.note ?? me.dayNote?.note ?? "");
  const [zones, setZones] = useState<string[]>(() => { try { return me.checkin?.pain_zones ? JSON.parse(me.checkin.pain_zones) : []; } catch { return []; } });
  const [consent, setConsent] = useState(me.settings.healthConsent);
  const s = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));
  const [w, setW] = useState({ sleepH: s(me.checkin?.sleep_h), rhr: s(me.checkin?.rhr), hrv: s(me.checkin?.hrv) });
  const hasWatch = !!(w.sleepH || w.rhr || w.hrv);
  const toggleZone = (z: string) => setZones((l) => (l.includes(z) ? l.filter((x) => x !== z) : [...l, z]));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      // Un court temps d’analyse : la décision se lit mieux quand elle arrive.
      const [r] = await Promise.all([
        api<{ decision: { verdict: keyof typeof VERDICT } }>("/api/checkins", { method: "POST", body: { ...v, note, today: me.today, painZones: v.pain > 0 && consent ? zones : [], healthConsent: consent && !me.settings.healthConsent, sleepH: w.sleepH, rhr: consent ? w.rhr : "", hrv: consent ? w.hrv : "" } }),
        new Promise((ok) => setTimeout(ok, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : analyzeDelay())),
      ]);
      haptic(r.decision.verdict === "rest" ? "warn" : "success");
      await onDone(`Décision du jour : ${VERDICT[r.decision.verdict].label}.`);
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Erreur"); setBusy(false); }
  }

  return (
    <>
    <FicheHead eyebrow="10 secondes" title="Check-in du matin" onClose={close} />
    <section className="panel-body ci-card" aria-busy={busy}>
      {busy && <div className="analyzing" role="status"><span className="az-core"><span className="ring" /><i style={{ ["--a" as string]: "-90deg" }}>{v.sleep}</i><i style={{ ["--a" as string]: "30deg" }}>{v.legs}</i><i style={{ ["--a" as string]: "150deg" }}>{v.motivation}</i></span><b>Analyse de ta forme…</b><ul><li>Sommeil et jambes</li><li>Charge des 7 derniers jours</li><li>Séance du jour</li></ul></div>}
      <form className="form" onSubmit={submit}>
        {SCALES.map((s) => (
          <fieldset key={s.key} className="scale">
            <legend>{s.label}</legend>
            <div className="picks">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className={v[s.key] === n ? "on" : ""}><input type="radio" name={s.key} checked={v[s.key] === n} onChange={() => setV({ ...v, [s.key]: n })} />{n}</label>
              ))}
            </div>
            <div className="ends"><span>{s.low}</span><span>{s.high}</span></div>
          </fieldset>
        ))}
        <fieldset className="scale">
          <legend>Douleur</legend>
          <div className="picks p3">
            {["Aucune", "Légère gêne", "Marquée"].map((l, i) => (
              <label key={l} className={v.pain === i ? "on" : ""}><input type="radio" name="pain" checked={v.pain === i} onChange={() => setV({ ...v, pain: i as 0 | 1 | 2 })} />{l}</label>
            ))}
          </div>
          {v.pain > 0 && (
            <div className="pain-where">
              {!me.settings.healthConsent && (
                <label className="consent">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>J’accepte que Trail Pilot enregistre où j’ai mal pour adapter mes séances et l’X-Ray. Je peux retirer cet accord et effacer ces données à tout moment dans Compte.</span>
                </label>
              )}
              {consent && (
                <>
                  <small>Où ? (facultatif)</small>
                  <div className="zchips">
                    {Object.entries(ZONES).map(([k, label]) => (
                      <button type="button" key={k} className={zones.includes(k) ? "on" : ""} aria-pressed={zones.includes(k)} onClick={() => toggleZone(k)}>{label}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </fieldset>
        <details className="watch" open={hasWatch}>
          <summary>Mesures de ta montre <small>facultatif</small></summary>
          <div className="fields f3">
            <label className="field">Sommeil (h)<input inputMode="decimal" value={w.sleepH} onChange={(e) => setW({ ...w, sleepH: e.target.value })} placeholder="7,5" /></label>
            <label className="field">FC au réveil<input inputMode="numeric" value={w.rhr} onChange={(e) => setW({ ...w, rhr: e.target.value })} placeholder="48" disabled={!consent} /></label>
            <label className="field">VFC (ms)<input inputMode="numeric" value={w.hrv} onChange={(e) => setW({ ...w, hrv: e.target.value })} placeholder="65" disabled={!consent} /></label>
          </div>
          {!me.settings.healthConsent && (
            <label className="consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>J’accepte que Trail Pilot enregistre ma FC au réveil et ma VFC (données de santé) pour adapter mes séances. Je peux retirer cet accord et les effacer dans Compte.</span>
            </label>
          )}
          <small className="muted">Après 4 matins mesurés, Trail Pilot compare chaque valeur à ta référence des 14 derniers jours : une FC au réveil qui monte ou une VFC qui baisse signalent une récupération incomplète.</small>
        </details>
        <label className="field ci-note">Commentaire <small className="muted">facultatif</small>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder="Nuit hachée, grosse journée de travail, mollet raide au réveil…" />
          <small className="muted">Lu par l’IA du coach : fatigue, douleur, maladie ou manque de temps peuvent alléger la séance du jour. Tu le retrouves dans le calendrier, au jour concerné.</small>
        </label>
        {err && <p className="note err" role="alert">{err}</p>}
        <button className="btn" type="submit" disabled={busy}>{busy ? "Analyse…" : "Voir ma décision"}</button>
      </form>
    </section>
    </>
  );
}

/** Le temps d’analyse du check-in : mis en scène les premières fois, puis court pour ne pas faire attendre chaque matin. */
function analyzeDelay() {
  try { const n = Number(localStorage.getItem("tp-ci-count") || 0) + 1; localStorage.setItem("tp-ci-count", String(n)); return n <= 3 ? 1100 : 450; } catch { return 700; }
}


/** Les premiers jours du mois : le bilan du mois précédent, à ouvrir en story. */
function RecapTeaser({ today }: { today: string }) {
  const d = new Date(`${today.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1);
  const month = d.toISOString().slice(0, 7), name = d.toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" });
  return (
    <button type="button" className="card recap-teaser" onClick={(e) => openPanel({ kind: "recap", month }, e.currentTarget)}>
      <span className="recap-dots" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ["--i" as string]: i }} />)}</span>
      <span><span className="eyebrow">Bilan du mois</span><b>Ton mois {/^[aeiouyéè]/i.test(name) ? "d’" : "de "}{name} en story</b><small>Kilomètres, dénivelé, régularité, plus belle sortie</small></span>
      <span className="recap-go" aria-hidden="true">›</span>
    </button>
  );
}
