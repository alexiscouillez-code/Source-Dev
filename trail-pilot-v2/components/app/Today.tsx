"use client";

import { useState } from "react";
import type { Ctx } from "./AppShell";
import InfoTip, { EXPLAIN } from "./InfoTip";
import { SessionTarget } from "./Targets";
import { ZONES } from "@/lib/engine/legs";
import Onboarding from "./Onboarding";
import Coach from "./Coach";
import WeekCard from "./WeekCard";
import { api, dayLabel, dayNum, fmtDur, fmtKm, fmtNum, shortDay, SPORT_LABEL, VERDICT, type Me, type PlanSession } from "./client";

export default function Today({ me, refresh, go, toast }: Ctx) {
  const [editing, setEditing] = useState(!me.checkin);
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
      <header className="head">
        <div>
          <span className="eyebrow">{dayLabel(me.today)}</span>
          <h1>{hello}{firstName ? `, ${firstName}` : ""}.</h1>
        </div>
        {me.goal && <span className="chip ember"><span className="dot" />{me.goal.phase} · {me.goal.name}</span>}
      </header>

      {!me.strava.connected && me.strava.configured && (
        <div className="banner" style={{ marginBottom: 14 }}>
          <div><b>Connecte Strava</b><div className="small muted">Tes sorties s’importent automatiquement et ta charge se calcule toute seule.</div></div>
          <a className="btn strava sm" href="/api/strava/connect">Connecter Strava</a>
        </div>
      )}

      <div className="grid g2">
        {me.decision && !editing ? (
          <DecisionCard me={me} onEdit={() => setEditing(true)} />
        ) : (
          <CheckinCard me={me} onDone={async (msg) => { await refresh(); setEditing(false); toast(msg); }} onCancel={me.checkin ? () => setEditing(false) : undefined} />
        )}

        <section className="card" aria-labelledby="next-title">
          <div className="card-head">
            <h2 id="next-title">{me.todayPlan && me.todayPlan.status !== "done" ? "Aujourd’hui" : "Demain"}</h2>
            <button className="link small" onClick={() => go("plan")}>Tout le planning</button>
          </div>
          {(() => {
            const s = me.todayPlan && me.todayPlan.status !== "done" ? me.todayPlan : me.tomorrowPlan;
            if (s) return <SessionBlock s={s} targets={me.targets} />;
            if (me.needsPlan) return (
              <div className="empty">
                Aucun planning pour l’instant. Trail Pilot le construit à partir de ton historique, de tes disponibilités et de ton objectif.
                <div><button className="btn" onClick={generate} disabled={busy}>{busy ? "Calcul…" : "Générer mon planning"}</button></div>
              </div>
            );
            return <p className="empty">Repos prévu. Profite-en pour bien dormir.</p>;
          })()}
        </section>
      </div>

      {me.goal?.daysToGoal === 0 && (
        <div className="banner raceday-banner" style={{ marginTop: 14 }}>
          <div><b>C’est le jour J</b><div className="small muted">Ouvre le mode jour de course : chrono, prochain ravito, rappels pour manger et boire.</div></div>
          <button className="btn sm" onClick={() => go("plan")}>Mode jour de course</button>
        </div>
      )}
      <WeekCard today={me.today} toast={toast} />
      <div className="grid g4" style={{ marginTop: 14 }}>
        <Kpi label="Forme de fond" value={fmtNum(me.load.ctl)} hint="Charge moyenne sur 6 semaines" info={EXPLAIN.ctl} />
        <Kpi label="Fatigue" value={fmtNum(me.load.atl)} hint="Charge moyenne sur 7 jours" info={EXPLAIN.atl} />
        <Kpi label="Fraîcheur" value={(me.load.form > 0 ? "+" : "") + fmtNum(me.load.form)} hint={me.load.form >= 0 ? "Tu as de la réserve" : "Fatigue en cours d’assimilation"} info={EXPLAIN.form} />
        <Kpi label="Ratio 7 j / 6 sem" value={me.load.ratio != null ? me.load.ratio.toFixed(2).replace(".", ",") : "—"} hint={!me.load.calibrated ? `Calibrage : ${me.load.historyDays} j / 28` : me.load.ratio == null ? "—" : me.load.ratio > 1.3 ? "Montée rapide de la charge" : me.load.ratio < 0.8 ? "Charge en baisse" : "Progression maîtrisée"} info={EXPLAIN.ratio} />
      </div>

      <Coach toast={toast} />

      <div className="grid g2" style={{ marginTop: 14 }}>
        <section className="card" aria-labelledby="week-title">
          <div className="card-head"><h2 id="week-title">7 prochains jours</h2></div>
          {me.upcoming.length ? (
            <ul className="list">
              {me.upcoming.map((s) => (
                <li key={s.id} className={`item ${s.date === me.today ? "today" : ""} is-${s.status}`}>
                  <div className="date"><small>{shortDay(s.date)}</small><b>{dayNum(s.date)}</b></div>
                  <div style={{ minWidth: 0 }}><div className="t">{s.title}</div><div className="s">{fmtDur(s.duration_min)}{s.gain_m ? ` · ${s.gain_m} m D+` : ""} · effort {s.rpe_target}/10</div></div>
                  <StatusChip status={s.status} />
                </li>
              ))}
            </ul>
          ) : <p className="empty">Rien de prévu cette semaine.</p>}
        </section>

        <section className="card" aria-labelledby="recent-title">
          <div className="card-head"><h2 id="recent-title">Dernières séances</h2><button className="link small" onClick={() => go("runs")}>Voir tout</button></div>
          {me.recent.length ? (
            <ul className="list">
              {me.recent.map((a) => (
                <li key={a.id} className="item">
                  <div className="date"><small>{shortDay(a.date)}</small><b>{dayNum(a.date)}</b></div>
                  <div style={{ minWidth: 0 }}><div className="t">{a.name ?? SPORT_LABEL[a.sport]}</div><div className="s">{fmtDur(a.duration_min)}{a.distance_km ? ` · ${fmtKm(a.distance_km)} km` : ""}{a.gain_m ? ` · ${fmtNum(a.gain_m)} m D+` : ""}</div></div>
                  <span className="chip">{a.load} UA</span>
                </li>
              ))}
            </ul>
          ) : <p className="empty">Aucune séance enregistrée. {me.strava.connected ? "Lance une synchro Strava depuis l’onglet Séances." : "Connecte Strava ou ajoute une séance."}</p>}
        </section>
      </div>
    </>
  );
}

function Kpi({ label, value, hint, info }: { label: string; value: string; hint: string; info?: React.ReactNode }) {
  return <div className="kpi"><small>{label}{info && <InfoTip title={label}>{info}</InfoTip>}</small><b>{value}</b><span>{hint}</span></div>;
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
      <SessionTarget targets={targets} template={s.template} rpe={s.rpe_target} />
      <p className="soft small" style={{ margin: 0 }}>{s.description}</p>
      {original && <p className="muted small" style={{ margin: 0 }}>Prévu initialement : {original.title}, {fmtDur(original.durationMin)}.</p>}
    </div>
  );
}

function DecisionCard({ me, onEdit }: { me: Me; onEdit: () => void }) {
  const d = me.decision!;
  const v = VERDICT[d.verdict];
  return (
    <section className="card verdict" style={{ ["--accent" as string]: v.color }} aria-live="polite">
      <div className="row between"><span className="eyebrow">Décision pour demain</span><button className="link small" onClick={onEdit}>Modifier mon check-in</button></div>
      <div className="verdict-row">
        <div className="verdict-big verdict-stamp" key={d.verdict}>{v.label}</div>
        <FormGauge score={d.score} />
      </div>
      <div className="meter" role="img" aria-label={`Forme ressentie ${d.score} sur 100`}><i style={{ width: `${d.score}%` }} /></div>
      <p style={{ margin: 0, fontSize: 18 }}>{v.line}</p>
      <ul className="reasons">{d.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
    </section>
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

function CheckinCard({ me, onDone, onCancel }: { me: Me; onDone: (msg: string) => Promise<void>; onCancel?: () => void }) {
  const [v, setV] = useState({ sleep: me.checkin?.sleep ?? 3, legs: me.checkin?.legs ?? 3, motivation: me.checkin?.motivation ?? 3, pain: me.checkin?.pain ?? 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
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
        api<{ decision: { verdict: keyof typeof VERDICT } }>("/api/checkins", { method: "POST", body: { ...v, painZones: v.pain > 0 && consent ? zones : [], healthConsent: consent && !me.settings.healthConsent, sleepH: w.sleepH, rhr: consent ? w.rhr : "", hrv: consent ? w.hrv : "" } }),
        new Promise((ok) => setTimeout(ok, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1100)),
      ]);
      await onDone(`Décision pour demain : ${VERDICT[r.decision.verdict].label}.`);
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Erreur"); setBusy(false); }
  }

  return (
    <section className="card ci-card" aria-labelledby="ci-title" aria-busy={busy}>
      {busy && <div className="analyzing" role="status"><span className="ring" /><b>Analyse de ta forme…</b><ul><li>Sommeil et jambes</li><li>Charge des 7 derniers jours</li><li>Séance de demain</li></ul></div>}
      <div className="row between"><div><span className="eyebrow">10 secondes</span><h2 id="ci-title" style={{ marginTop: 4 }}>Check-in du soir</h2></div>{onCancel && <button className="link small" onClick={onCancel}>Annuler</button>}</div>
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
        {err && <p className="note err" role="alert">{err}</p>}
        <button className="btn" type="submit" disabled={busy}>{busy ? "Analyse…" : "Voir ma décision"}</button>
      </form>
    </section>
  );
}
