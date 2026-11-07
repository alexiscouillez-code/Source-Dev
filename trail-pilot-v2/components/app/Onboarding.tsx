"use client";

import { useState } from "react";
import type { Ctx } from "./AppShell";
import { api, DAYS, localToday } from "./client";

/** Accueil guidé au premier lancement : ta course, ton profil, tes sorties. */
export default function Onboarding({ me, refresh, go, toast }: Ctx) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [race, setRace] = useState({ name: "", date: "", distanceKm: "", gainM: "" });
  const p = me.profile;
  const [prof, setProf] = useState({ level: p.level, daysPerWeek: p.days_per_week, longDay: p.long_day, hrMax: p.hr_max?.toString() ?? "", hrRest: p.hr_rest?.toString() ?? "" });
  const first = me.user.name?.split(" ")[0];

  async function finish(to?: Parameters<Ctx["go"]>[0]) {
    setBusy(true);
    try { await api("/api/onboarding", { method: "POST" }); await refresh(); if (to) go(to); }
    catch (e) { toast(e instanceof Error ? e.message : "Erreur"); setBusy(false); }
  }
  async function next(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try { await fn(); setStep((s) => s + 1); } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); } finally { setBusy(false); }
  }

  const steps = ["Ta course", "Ton profil", "Tes sorties"];
  return (
    <div className="onb-back" role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <div className="onb card">
        <div className="onb-steps" aria-hidden="true">{steps.map((s, i) => <span key={s} className={i <= step ? "on" : ""}><i>{i + 1}</i>{s}</span>)}</div>

        {step === 0 && (
          <form className="form" onSubmit={(e) => { e.preventDefault(); next(() => api("/api/goal", { method: "PUT", body: race })); }}>
            <div><span className="eyebrow">Bienvenue{first ? `, ${first}` : ""}</span><h2 id="onb-title" className="onb-title">Quelle course prépares-tu ?</h2>
              <p className="soft" style={{ margin: 0 }}>Trail Pilot construit ton plan jusqu’au jour J à partir de ta charge actuelle, pour que tu la finisses.</p></div>
            <label className="field">Nom de la course<input required maxLength={100} value={race.name} onChange={(e) => setRace({ ...race, name: e.target.value })} placeholder="Trail des Aiguilles Rouges" /></label>
            <div className="fields f3">
              <label className="field">Date<input type="date" required min={localToday()} value={race.date} onChange={(e) => setRace({ ...race, date: e.target.value })} /></label>
              <label className="field">Distance (km)<input inputMode="decimal" value={race.distanceKm} onChange={(e) => setRace({ ...race, distanceKm: e.target.value })} placeholder="42" /></label>
              <label className="field">D+ (m)<input inputMode="numeric" value={race.gainM} onChange={(e) => setRace({ ...race, gainM: e.target.value })} placeholder="2500" /></label>
            </div>
            {err && <p className="note err">{err}</p>}
            <div className="row between">
              <button type="button" className="link" onClick={() => { setErr(null); setStep(1); }}>Je n’ai pas encore de course</button>
              <button className="btn" type="submit" disabled={busy}>{busy ? "Calcul du plan…" : "Continuer"}</button>
            </div>
          </form>
        )}

        {step === 1 && (
          <form className="form" onSubmit={(e) => { e.preventDefault(); next(() => api("/api/profile", { method: "PUT", body: { ...prof, name: me.user.name ?? "", maxWeeklyMinutes: p.max_weekly_minutes ?? "" } })); }}>
            <div><span className="eyebrow">Étape 2 sur 3</span><h2 id="onb-title" className="onb-title">Ton profil de coureur</h2>
              <p className="soft" style={{ margin: 0 }}>Pour doser la progression et calculer tes allures et zones cardio.</p></div>
            <div className="fields">
              <label className="field">Niveau
                <select value={prof.level} onChange={(e) => setProf({ ...prof, level: e.target.value as typeof prof.level })}>
                  <option value="debutant">Je débute</option><option value="regulier">Régulier</option><option value="confirme">Confirmé</option>
                </select>
              </label>
              <label className="field">Séances par semaine
                <select value={prof.daysPerWeek} onChange={(e) => setProf({ ...prof, daysPerWeek: Number(e.target.value) })}>{[2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}</select>
              </label>
              <label className="field">Sortie longue le
                <select value={prof.longDay} onChange={(e) => setProf({ ...prof, longDay: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
              </label>
              <label className="field">FC max<input inputMode="numeric" value={prof.hrMax} onChange={(e) => setProf({ ...prof, hrMax: e.target.value })} placeholder="Facultatif, ex. 188" /></label>
              <label className="field">FC repos<input inputMode="numeric" value={prof.hrRest} onChange={(e) => setProf({ ...prof, hrRest: e.target.value })} placeholder="Facultatif, ex. 50" /><small>Mesurée au réveil, allongé</small></label>
            </div>
            {err && <p className="note err">{err}</p>}
            <div className="row between"><button type="button" className="link" onClick={() => setStep(0)}>Retour</button><button className="btn" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Continuer"}</button></div>
          </form>
        )}

        {step === 2 && (
          <div className="form">
            <div><span className="eyebrow">Dernière étape</span><h2 id="onb-title" className="onb-title">Ajoute tes sorties</h2>
              <p className="soft" style={{ margin: 0 }}>Ton plan, ta forme et ta VO2max se calculent à partir de ce que tu fais vraiment. Plus il y a d’historique, plus c’est juste.</p></div>
            <div className="onb-choices">
              {me.strava.configured && <a className="btn strava" href="/api/strava/connect" onClick={() => api("/api/onboarding", { method: "POST" }).catch(() => {})}>Connecter Strava</a>}
              <button className="btn ghost" disabled={busy} onClick={() => finish("runs")}>Importer un fichier de montre</button>
              <button className="btn ghost" disabled={busy} onClick={() => finish("runs")}>Saisir une séance</button>
            </div>
            <div className="row between"><button type="button" className="link" onClick={() => setStep(1)}>Retour</button><button className="link" disabled={busy} onClick={() => finish()}>Plus tard</button></div>
          </div>
        )}

        <button className="onb-skip link small" onClick={() => finish()} disabled={busy}>Passer l’accueil</button>
      </div>
    </div>
  );
}
