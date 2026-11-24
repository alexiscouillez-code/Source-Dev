"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { api, dayLabel, fmtDur, fmtKm, fmtNum, SPORT_LABEL, type Activity } from "./client";
import { IconCompare, IconShare, IconX } from "./icons";
import DotProfile from "@/components/night/DotProfile";
import { Insight } from "./Sessions";
import { setPick } from "./panel";
import { paceText, runStory } from "./story";
import StoryPreview from "./StoryPreview";
import type { PanelProps } from "./Panels";
import type { Best } from "@/lib/engine/streams";

const TrackMap = dynamic(() => import("./TrackMap"), { ssr: false, loading: () => <div className="tmap" style={{ height: 220 }}><div className="tmap-loading">Chargement de la carte…</div></div> });

export interface RunDetail { activity: Activity; profile: number[] | null; km: number[] | null; moving: number | null; best: Best | null; maxHr: number | null }
const FOOT = new Set(["trail", "course", "rando"]);
/** Allure moyenne en secondes par km (temps en mouvement si connu), null sans distance. */
export const paceOf = (a: Pick<Activity, "distance_km" | "duration_min">, moving?: number | null) => (a.distance_km ? (moving ?? a.duration_min * 60) / a.distance_km : null);
/** Temps de chaque kilomètre (s), d'après les temps de passage cumulés. */
export const splitsOf = (km: number[] | null) => (km?.length ? km.map((t, i) => t - (i ? km[i - 1] : 0)).filter((s) => s > 60 && s < 3600) : null);

/**
 * Fiche d'une sortie, ouverte depuis la liste des séances, le bloc « Ma sortie du jour » ou un débrief :
 * chiffres clés, profil d'altitude en points (à parcourir du doigt), allure de chaque kilomètre, zones
 * cardiaques, tracé, partage en story et comparaison avec une autre sortie.
 */
export default function RunFiche({ id, initial, toast, close, go }: PanelProps & { id: number; initial?: Partial<Activity> }) {
  const [d, setD] = useState<RunDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [story, setStory] = useState(false);
  useEffect(() => { api<RunDetail>(`/api/activities/${id}`).then(setD).catch((e) => setErr(e instanceof Error ? e.message : "Erreur")); }, [id]);
  const a = (d?.activity ?? initial ?? null) as Partial<Activity> | null;
  const splits = useMemo(() => splitsOf(d?.km ?? null), [d]);
  if (!a) return <div className="panel-body"><div className="skeleton" style={{ height: 300 }} /></div>;
  const name = a.name ?? SPORT_LABEL[a.sport ?? ""] ?? "Sortie";
  const pace = a.distance_km && a.duration_min ? paceOf({ distance_km: a.distance_km, duration_min: a.duration_min }, d?.moving) : null;
  const foot = FOOT.has(a.sport ?? "");
  const kpis: { v: string; u: string; k: string }[] = [
    ...(a.distance_km ? [{ v: fmtKm(a.distance_km), u: "km", k: "Distance" }] : []),
    ...(a.gain_m ? [{ v: fmtNum(a.gain_m), u: "m", k: "Dénivelé +" }] : []),
    { v: fmtDur(d?.moving ? d.moving / 60 : a.duration_min ?? 0), u: "", k: d?.moving ? "En mouvement" : "Durée" },
    ...(pace && foot ? [{ v: paceText(pace), u: "/km", k: "Allure" }] : pace ? [{ v: fmtKm((a.distance_km! / ((d?.moving ?? a.duration_min! * 60) / 3600))), u: "km/h", k: "Vitesse" }] : []),
    ...(a.avg_hr ? [{ v: String(Math.round(a.avg_hr)), u: "bpm", k: d?.maxHr ? `FC moy. · max ${d.maxHr}` : "FC moyenne" }] : []),
    ...(a.load != null ? [{ v: String(a.load), u: "", k: `Charge · effort ${String(a.effort ?? "").replace(".", ",")}/10` }] : []),
  ];
  const story0 = () => runStory({ name, date: a.date!, dateLabel: dayLabel(a.date!, { day: "numeric", month: "long", year: "numeric" }), sport: a.sport ?? "trail", km: a.distance_km ?? null, gain: a.gain_m ?? null, minutes: a.duration_min ?? 0, paceSec: foot ? pace : null, profile: d?.profile ?? null, avgHr: a.avg_hr ?? null });
  const avg = splits ? splits.reduce((t, s) => t + s, 0) / splits.length : 0;
  const best = d?.best;
  return (
    <>
      <header className="panel-head">
        <div className="panel-bar">
          <span className="eyebrow">{a.date ? dayLabel(a.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""}</span>
          <button type="button" className="iconbtn panel-x" aria-label="Fermer la fiche" onClick={close}><IconX /></button>
        </div>
        <h2 id="panel-title" className="panel-title">{name}</h2>
        <div className="row panel-chips">
          <span className="chip">{SPORT_LABEL[a.sport ?? ""] ?? "Sortie"}</span>
          {a.source === "strava" && <span className="chip dim">Strava</span>}
          {(a.source === "fichier" || a.source === "gpx") && <span className="chip dim">Fichier montre</span>}
          {a.check_state === 1 && <span className="chip lite">Exclue des calculs</span>}
        </div>
      </header>
      <div className="panel-body">
        <div className="fiche-kpis">
          {kpis.map((k, i) => (
            <div key={k.k} className="fk reveal" style={{ ["--i" as string]: i }}><b className="num-up">{k.v}</b>{k.u && <i>{k.u}</i>}<small>{k.k}</small></div>
          ))}
        </div>
        {err && <p className="note err">{err}</p>}
        {!d && !err && <div className="skeleton" style={{ height: 180 }} />}
        {d?.profile && a.distance_km && (
          <section className="fiche-sec">
            <h3 className="fiche-h">Profil d’altitude</h3>
            <DotProfile profile={d.profile} km={a.distance_km} cols={44} rows={13} interactive />
          </section>
        )}
        {splits && splits.length >= 2 && (
          <section className="fiche-sec">
            <div className="row between"><h3 className="fiche-h">Allure au kilomètre</h3><span className="small muted">moyenne {paceText(avg)} /km</span></div>
            {/* Une colonne de points par kilomètre : plus haute quand le kilomètre est rapide. */}
            <DotProfile profile={splits.map((s) => 60000 / s)} km={splits.length} cols={Math.min(splits.length, 60)} rows={Math.max(5, Math.min(10, Math.round(Math.min(splits.length, 60) / 3)))} interactive mark={false}
              label={`Allure de chaque kilomètre, de ${paceText(Math.min(...splits))} à ${paceText(Math.max(...splits))} par kilomètre`}
              tip={(v, c) => [`${paceText(60000 / v)} /km`, `km ${Math.round(((c + 0.5) / Math.min(splits.length, 60)) * splits.length)}`]}
              axis={["KM 1", `KM ${splits.length}`]} />
          </section>
        )}
        {best && (best.k1 || best.k5 || best.k10 || best.vam) && (
          <section className="fiche-sec">
            <h3 className="fiche-h">Meilleurs passages</h3>
            <div className="fiche-best">
              {best.k1 != null && <div><small>1 km</small><b className="mono">{paceText(best.k1)}</b></div>}
              {best.k5 != null && <div><small>5 km</small><b className="mono">{fmtSec(best.k5)}</b></div>}
              {best.k10 != null && <div><small>10 km</small><b className="mono">{fmtSec(best.k10)}</b></div>}
              {best.vam != null && <div><small>Montée (10 min)</small><b className="mono">{fmtNum(best.vam)} m/h</b></div>}
            </div>
          </section>
        )}
        {a.insight && (a.insight.zones || a.insight.gap) && <section className="fiche-sec"><h3 className="fiche-h">Effort</h3><Insight a={{ insight: a.insight }} /></section>}
        {d?.activity.track && (
          <section className="fiche-sec">
            <h3 className="fiche-h">Tracé</h3>
            <TrackMap lines={[{ poly: d.activity.track, id: 1, highlight: true }]} height={220} label={`Tracé de ${name}`} />
          </section>
        )}
        <div className="fiche-actions">
          <button type="button" className="btn" onClick={() => setStory(true)}><IconShare />Partager en story</button>
          <button type="button" className="btn ghost" onClick={() => { setPick({ on: true, ids: [id] }); close(); window.setTimeout(() => go("runs"), 380); }}><IconCompare />Comparer avec…</button>
        </div>
      </div>
      {story && <StoryPreview make={story0} filename={`trail-pilot-${a.date}.png`} title={name} toast={toast} onClose={() => setStory(false)} />}
    </>
  );
}
const fmtSec = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
