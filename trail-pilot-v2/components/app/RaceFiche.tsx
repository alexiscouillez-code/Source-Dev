"use client";

import { useEffect, useState } from "react";
import { api, dayLabel, fmtDur, fmtKm, fmtNum, localToday } from "./client";
import { IconCompare, IconRuns, IconX } from "./icons";
import { DebriefBody, type Item } from "./Debriefs";
import { setPick } from "./panel";
import type { PanelProps } from "./Panels";

const TONE = { mieux: "ok", prevu: "", moins: "lite", inconnu: "dim" } as const;

/**
 * Fiche d'une course passée : temps, résultat face à l'estimation, débrief complet (sections, enseignements,
 * ressenti à remplir), accès à la sortie et comparaison avec l'édition précédente ou une autre sortie.
 * S'ouvre depuis Mes courses, le débrief du Planning ou en touchant le jour de la course dans le calendrier.
 */
export default function RaceFiche({ raceKey, date, toast, close, swap, go }: PanelProps & { raceKey?: string; date?: string }) {
  const [d, setD] = useState<Item | null>(null);
  const [tags, setTags] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [edition, setEdition] = useState<{ key: string; date: string; activityId: number | null; durationMin: number | null } | null>(null);
  const today = localToday();
  useEffect(() => {
    const q = raceKey ? `key=${encodeURIComponent(raceKey)}` : `date=${date}`;
    api<{ debrief: Item; tags: Record<string, string> }>(`/api/debrief?${q}`).then((r) => { setD(r.debrief); setTags(r.tags); }).catch((e) => setErr(e instanceof Error ? e.message : "Erreur"));
    // Édition précédente de la même course (pour comparer les deux sorties).
    api<{ races: { key: string; edition: typeof edition }[] }>("/api/races?all=1").then((r) => setEdition(r.races.find((x) => x.key === raceKey || (date && x.key.endsWith(date)))?.edition ?? null)).catch(() => {});
  }, [raceKey, date]);

  const head = (
    <header className="panel-head">
      <div className="panel-bar">
        <span className="eyebrow">{d ? `${d.main ? "Course principale" : "Course de préparation"} · ${dayLabel(d.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}` : "Course"}</span>
        <button type="button" className="iconbtn panel-x" aria-label="Fermer la fiche" onClick={close}><IconX /></button>
      </div>
      <h2 id="panel-title" className="panel-title">{d ? `⚑ ${d.name}` : "Chargement…"}</h2>
      {d && (d.distanceKm || d.gainM) && <div className="row panel-chips">{d.distanceKm ? <span className="chip">{fmtKm(d.distanceKm)} km</span> : null}{d.gainM ? <span className="chip">{fmtNum(d.gainM)} m D+</span> : null}</div>}
    </header>
  );
  if (err) return <>{head}<div className="panel-body"><p className="note err">{err}</p></div></>;
  if (!d) return <>{head}<div className="panel-body"><div className="skeleton" style={{ height: 260 }} /></div></>;
  if (d.status === "attente") {
    return (
      <>{head}
        <div className="panel-body">
          <div className="banner"><div><b>Ton débrief t’attend</b><p className="soft small" style={{ margin: "4px 0 0" }}>Synchronise Strava ou importe le fichier de ta montre (Séances) : l’appli comparera ta course à ce qui était prévu.</p></div></div>
          <div className="fiche-actions"><button type="button" className="btn" onClick={() => { close(); window.setTimeout(() => go("runs"), 380); }}><IconRuns />Aller à Séances</button></div>
        </div>
      </>
    );
  }
  const gap = edition?.durationMin != null ? d.activity.durationMin - edition.durationMin : null;
  return (
    <>
      {head}
      <div className="panel-body">
        <div className="race-hero reveal">
          <div><small>Ton temps</small><b className="mono num-up">{fmtDur(d.actual)}</b></div>
          <span className={`chip ${TONE[d.result.tone]}`}>{d.result.label}</span>
        </div>
        {edition && (
          <button type="button" className="race-edition" onClick={(e) => edition.activityId ? swap({ kind: "compare", a: edition.activityId, b: d.activity.id }, e.currentTarget) : undefined} disabled={!edition.activityId}>
            <IconCompare />
            <span><b>Édition {edition.date.slice(0, 4)}</b>{gap != null ? ` · ${gap < 0 ? `${fmtDur(-gap)} plus rapide cette fois` : gap > 0 ? `${fmtDur(gap)} plus lent cette fois` : "même temps"}` : ""}</span>
            {edition.activityId && <em>Comparer</em>}
          </button>
        )}
        <DebriefBody d={d} tags={tags} today={today} one toast={toast} onSaved={(r) => { if (r.debrief) setD(r.debrief); toast("Débrief enregistré."); }} />
        <div className="fiche-actions">
          <button type="button" className="btn ghost" onClick={(e) => swap({ kind: "run", id: d.activity.id, initial: { id: d.activity.id, name: d.activity.name, date: d.date, duration_min: d.activity.durationMin, distance_km: d.activity.distanceKm, gain_m: d.activity.gainM } }, e.currentTarget)}><IconRuns />Voir la sortie</button>
          <button type="button" className="btn ghost" onClick={() => { setPick({ on: true, ids: [d.activity.id] }); close(); window.setTimeout(() => go("runs"), 380); }}><IconCompare />Comparer avec…</button>
        </div>
      </div>
    </>
  );
}
