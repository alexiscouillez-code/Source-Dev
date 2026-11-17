"use client";

import { useEffect, useState } from "react";
import { api, dayLabel, fmtDur } from "@/components/app/client";
import { EXAMPLE_GAIN_REF, EXAMPLE_PROFILE, EXAMPLE_RUN, EXAMPLE_TRAILHEAD, EXAMPLE_WEEK, fmtKm1, fmtPace, type TodayRun as Data } from "@/lib/engine/today-run";
import GlassCard from "./GlassCard";
import DotProfile from "./DotProfile";
import DotGrid from "./DotGrid";
import RadarCard from "./RadarCard";

const ArrowUp = () => (
  <svg className="g-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Example = () => <span className="g-example">Exemple</span>;

/**
 * Bloc « Ma sortie du jour », style nuit et verre dépoli. Chaque partie utilise la donnée réelle quand elle existe,
 * sinon des données d'exemple signalées par la mention « Exemple ». Le profil d'altitude d'une vraie sortie est toujours
 * le sien (relu sur Strava ou mesuré le long du tracé) ; sans lui, la carte s'en passe.
 */
export default function TodayRun({ today, onTerrains }: { today: string; onTerrains?: () => void }) {
  const [d, setD] = useState<Data | null>(null);
  // Tuiles retournables (D+ ↔ D+ par km, allure ↔ vitesse) et pourcentage visé sur la grille de charge.
  const [alt, setAlt] = useState({ gain: false, pace: false });
  const [pick, setPick] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api<Data>(`/api/today-run?today=${today}`).then(setD).catch(() => setFailed(true)); }, [today]);
  if (!d && !failed) return <section className="night is-loading" aria-busy="true" aria-label="Ma sortie du jour, chargement" />;

  const run = d?.run ?? EXAMPLE_RUN, runEx = !d?.run;
  // Profil : le vrai, sinon rien (jamais de courbe inventée sous une vraie sortie) ; la carte d'exemple garde le sien.
  const profile = runEx ? EXAMPLE_PROFILE : d?.run?.profile ?? null;
  const ref = d?.gainRef ?? (runEx ? EXAMPLE_GAIN_REF : null), refEx = !d?.gainRef;
  const week = d?.week ?? EXAMPLE_WEEK, weekEx = !d?.week;
  const th = d?.trailhead ?? EXAMPLE_TRAILHEAD, thEx = !d?.trailhead;
  const title = runEx || run.isToday ? "Ma sortie du jour" : "Ma dernière sortie";
  const diff = run.gainM != null && ref ? run.gainM - ref.avg : null;

  return (
    <section className="night" aria-labelledby="night-title">
      <span className="night-stars" aria-hidden="true" />
      <div className="night-inner">
        <h2 id="night-title" className="night-title">{title}</h2>

        <GlassCard className="run-card">
          {/* Métadonnées décoratives (altitudes, date), dans la zone libre à droite du grand chiffre. */}
          {profile && <span className="g-meta" aria-hidden="true" style={{ top: 74, right: 22 }}>{Math.round(Math.max(...profile))} M</span>}
          <span className="g-meta" aria-hidden="true" style={{ top: 112, right: 64 }}>{runEx ? "" : run.date.slice(5).replace("-", ".")}</span>
          {profile && <span className="g-meta" aria-hidden="true" style={{ top: 150, right: 26 }}>{Math.round(Math.min(...profile))} M</span>}
          <div className="g-row">
            <span className="g-top">{run.name}</span>
            {runEx && <Example />}
          </div>
          {!runEx && !run.isToday && <span className="g-when">{dayLabel(run.date, { weekday: "long", day: "numeric", month: "long" })}</span>}
          <p className="g-big">
            <span className="g-num" aria-hidden="true">{fmtKm1(run.distanceKm)}</span>
            <span className="g-cap" aria-hidden="true">KM Distance</span>
            <span className="sr-only">Distance : {fmtKm1(run.distanceKm)} kilomètres{runEx ? " (exemple)" : ""}.</span>
          </p>
          {profile && (
            <div className="g-profile">
              <DotProfile profile={profile} km={run.distanceKm} label={runEx ? "Profil d'altitude d'exemple." : undefined} />
            </div>
          )}

          <div className="g-pair">
            <GlassCard inner as="button" type="button" className="tap" aria-pressed={alt.gain}
              aria-label={alt.gain ? `Dénivelé positif par kilomètre : ${run.gainM != null ? Math.round(run.gainM / run.distanceKm) : "inconnu"} mètres. Toucher pour revenir au total.` : `Dénivelé positif : ${run.gainM ?? "inconnu"} mètres. Toucher pour voir le dénivelé par kilomètre.`}
              onClick={() => setAlt({ ...alt, gain: !alt.gain })}>
              <span className="g-top g-top-sm"><ArrowUp /> {alt.gain ? "D+ / km" : "D+"}</span>
              <span className="g-flip" key={alt.gain ? "a" : "b"}>
                <span className="g-num g-num-sm" aria-hidden="true">{run.gainM == null ? "—" : alt.gain ? Math.round(run.gainM / run.distanceKm) : run.gainM}<small> M</small></span>
                <span className="g-sub">
                  {alt.gain ? "de montée par kilomètre" : <>{diff == null ? "Pas de sortie la semaine dernière" : `${diff >= 0 ? "+" : "−"}${Math.abs(diff)} m vs moy. sem. dernière`}{refEx && diff != null && " (exemple)"}</>}
                </span>
              </span>
            </GlassCard>
            <GlassCard inner as="button" type="button" className="tap" aria-pressed={alt.pace}
              aria-label={alt.pace ? `Vitesse moyenne en mouvement : ${(3600 / run.paceSec).toFixed(1).replace(".", ",")} kilomètres par heure. Toucher pour revenir à l'allure.` : `Allure moyenne : ${Math.floor(run.paceSec / 60)} minutes ${Math.round(run.paceSec % 60)} secondes par kilomètre. Toucher pour voir la vitesse.`}
              onClick={() => setAlt({ ...alt, pace: !alt.pace })}>
              <span className="g-top g-top-sm">{alt.pace ? "Vitesse" : "Allure"}</span>
              <span className="g-flip" key={alt.pace ? "a" : "b"}>
                <span className="g-num g-num-sm" aria-hidden="true">{alt.pace ? (3600 / run.paceSec).toFixed(1).replace(".", ",") : fmtPace(run.paceSec)}<small>{alt.pace ? " KM/H" : " /KM"}</small></span>
                <span className="g-sub">en mouvement</span>
              </span>
            </GlassCard>
          </div>
        </GlassCard>

        <div className="g-pair g-pair-out">
          <GlassCard className="week-card">
            <div className="g-row"><span className="g-top">Charge de la semaine</span>{weekEx && <Example />}</div>
            <DotGrid pct={week.pct} onPick={setPick} label={`Charge de la semaine : ${week.pct} % du temps prévu, ${fmtDur(week.doneMin)} sur ${fmtDur(week.plannedMin)}${weekEx ? " (exemple)" : ""}.`} />
            <span className={`g-num g-num-sm${pick != null ? " is-pick" : ""}`} aria-hidden="true">{pick ?? week.pct}<small> %</small></span>
            <span className="g-sub" aria-hidden="true">{pick != null ? `≈ ${fmtDur(Math.round((week.plannedMin * pick) / 100))} de la semaine prévue` : `${fmtDur(week.doneMin)} sur ${fmtDur(week.plannedMin)}`}</span>
          </GlassCard>
          <RadarCard title="Prochain départ de sentier" name={th.name} km={th.km} bearing={th.bearing} from={th.from} example={thEx} onOpen={onTerrains} />
        </div>
        {failed && <p className="g-sub night-note">Données indisponibles pour le moment : exemple affiché.</p>}
      </div>
    </section>
  );
}
