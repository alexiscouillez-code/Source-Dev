"use client";

import { useCallback, useEffect, useState } from "react";
import { api, dayLabel, fmtDur, fmtKm, fmtNum } from "./client";
import Fold from "./Fold";

interface Section { label: string; from: number; to: number; planned: number; actual: number; delta: number; tone: "vite" | "ok" | "lent" }
interface Ready {
  key: string; main: boolean; name: string; date: string; distanceKm: number | null; gainM: number | null; status: "pret"; daysAgo: number;
  activity: { id: number; name: string | null; durationMin: number; distanceKm: number | null; gainM: number | null; avgHr: number | null; source: string };
  planned: { estimate: { low: number; high: number } | null; hasSections: boolean }; splits: boolean;
  actual: number; result: { tone: "mieux" | "prevu" | "moins" | "inconnu"; label: string; delta: number | null };
  route: { match: boolean; note: string | null }; sections: Section[] | null; fade: number | null; high: number | null; dec: number | null; lessons: string[];
  projection: { name: string; low: number; high: number; current: { low: number; high: number } | null } | null;
  feedback: { rpe: number | null; tags: string[]; note: string | null; done: boolean };
}
interface Waiting { key: string; main: boolean; name: string; date: string; distanceKm: number | null; gainM: number | null; status: "attente" }
type Item = Ready | Waiting;
const TONE = { mieux: "ok", prevu: "", moins: "lite", inconnu: "dim" } as const;

/** Débriefs des courses récentes : prévu contre réalisé, sections, enseignements et ressenti du coureur. */
export default function Debriefs({ today, rev, toast }: { today: string; rev: number; toast: (m: string) => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [tags, setTags] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    try { const r = await api<{ debriefs: Item[]; tags: Record<string, string> }>(`/api/debrief?today=${today}`); setItems(r.debriefs); setTags(r.tags); } catch { setItems([]); }
  }, [today]);
  useEffect(() => { load(); }, [load, rev]);
  if (!items?.length) return null;
  return (
    <>
      {items.map((d) => d.status === "attente" ? (
        d.date >= addDays(today, -10) && (
          <div key={d.key} className="banner" style={{ marginBottom: 14 }}>
            <div><b>{d.name} : ton débrief t’attend</b><p style={{ margin: "4px 0 0" }} className="soft small">Synchronise Strava ou importe le fichier de ta montre (rubrique Séances) : l’appli comparera ta course à ce qui était prévu.</p></div>
          </div>
        )
      ) : (
        <Fold key={d.key} id={`debrief-${d.key}`} style={{ marginBottom: 14 }} className="debrief" defaultOpen={d.daysAgo <= 14 && !d.feedback.done}
          eyebrow={`Débrief · ${dayLabel(d.date, { weekday: "long", day: "numeric", month: "long" })}`} title={d.name}
          aside={<span className={`chip ${TONE[d.result.tone]}`}>{fmtDur(d.actual)}</span>}>
          <DebriefBody d={d} tags={tags} today={today} onSaved={(l) => { setItems(l); toast("Débrief enregistré."); }} toast={toast} />
        </Fold>
      ))}
    </>
  );
}

const addDays = (date: string, n: number) => { const x = new Date(`${date}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

function DebriefBody({ d, tags, today, onSaved, toast }: { d: Ready; tags: Record<string, string>; today: string; onSaved: (l: Item[]) => void; toast: (m: string) => void }) {
  const [rpe, setRpe] = useState(d.feedback.rpe ? String(d.feedback.rpe) : "");
  const [picked, setPicked] = useState<string[]>(d.feedback.tags);
  const [note, setNote] = useState(d.feedback.note ?? "");
  const [busy, setBusy] = useState(false);
  const dirty = rpe !== (d.feedback.rpe ? String(d.feedback.rpe) : "") || note.trim() !== (d.feedback.note ?? "") || picked.slice().sort().join() !== d.feedback.tags.slice().sort().join();
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { onSaved((await api<{ debriefs: Item[] }>("/api/debrief", { method: "PUT", body: { key: d.key, today, rpe: rpe || null, tags: picked, note } })).debriefs); }
    catch (e2) { toast(e2 instanceof Error ? e2.message : "Erreur"); }
    finally { setBusy(false); }
  }
  const est = d.planned.estimate;
  return (
    <>
      <div className="db-top">
        <div><small>Ton temps</small><b className="mono">{fmtDur(d.actual)}</b></div>
        <div><small>Estimation avant course</small><b className="mono">{est ? `${fmtDur(est.low)} – ${fmtDur(est.high)}` : "—"}</b></div>
        <div><small>Résultat</small><b className={`db-res r-${d.result.tone}`}>{d.result.label}</b></div>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        {d.activity.distanceKm ? `${fmtKm(d.activity.distanceKm)} km` : ""}{d.activity.gainM ? ` · ${fmtNum(d.activity.gainM)} m D+` : ""}{d.activity.avgHr ? ` · FC moyenne ${d.activity.avgHr} bpm` : ""}{d.high != null ? ` · ${d.high} % du temps en zones 4-5` : ""}
        {d.route.note ? ` · ${d.route.note}` : ""}
      </p>

      {d.sections ? (
        <div className="db-sections" role="table" aria-label="Sections : prévu et réalisé">
          <div className="db-row db-head" role="row"><span role="columnheader">Section</span><span role="columnheader">Prévu</span><span role="columnheader">Réel</span><span role="columnheader">Écart</span></div>
          {d.sections.map((s) => (
            <div className="db-row" role="row" key={`${s.from}-${s.to}`}>
              <span role="cell"><b>{s.label}</b><small>km {String(s.from).replace(".", ",")} → {String(s.to).replace(".", ",")}</small></span>
              <span role="cell" className="mono">{fmtDur(s.planned)}</span>
              <span role="cell" className="mono">{fmtDur(s.actual)}</span>
              <span role="cell" className={`mono t-${s.tone}`}>{s.delta > 0 ? "+" : ""}{s.delta} %<small>{s.tone === "vite" ? "plus vite" : s.tone === "lent" ? "plus lent" : "dans le plan"}</small></span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          {!d.main ? "Le détail section par section est réservé à la course principale, quand son tracé est importé dans la stratégie de course."
            : !d.planned.hasSections ? "Pas de détail par section : le tracé de la course n’avait pas été importé dans la stratégie."
            : !d.splits ? "Pas de détail par section : cette sortie n’a pas de temps de passage au kilomètre. Réimporte le fichier de ta montre ou resynchronise Strava."
            : "Pas de détail par section : le parcours enregistré s’écarte trop du tracé prévu."}
        </p>
      )}

      {d.lessons.length > 0 && <div><h3 className="db-h">Ce qu’il faut en retenir</h3><ul className="reasons">{d.lessons.map((l) => <li key={l}>{l}</li>)}</ul></div>}

      {d.projection && (
        <p className="db-proj">
          <b>Et pour {d.projection.name} ?</b> Reportée à sa distance et à son dénivelé, cette course donne <b className="mono">{fmtDur(d.projection.low)} – {fmtDur(d.projection.high)}</b>
          {d.projection.current ? <> (estimation actuelle du plan : {fmtDur(d.projection.current.low)} – {fmtDur(d.projection.current.high)})</> : null}. C’est un repère, pas une promesse : une course plus longue se joue aussi sur l’alimentation et la gestion.
        </p>
      )}

      <form className="db-form" onSubmit={save}>
        <h3 className="db-h">Ton ressenti</h3>
        <div className="db-tags" role="group" aria-label="Ce qui a marqué ta course">
          {Object.entries(tags).map(([k, label]) => (
            <button type="button" key={k} className={`db-tag ${picked.includes(k) ? "on" : ""}`} aria-pressed={picked.includes(k)}
              onClick={() => setPicked(picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k])}>{label}</button>
          ))}
        </div>
        <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
          <label className="field" style={{ width: 150 }}>Effort ressenti
            <select value={rpe} onChange={(e) => setRpe(e.target.value)}><option value="">—</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}/10</option>)}</select>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 200 }}>Note pour la prochaine fois
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Ce que je referais, ce que je changerais…" />
          </label>
          <button className="btn sm" disabled={busy || !dirty}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
        <small className="muted">Ce que tu coches ajoute des conseils ciblés ci-dessus. Ton débrief reste consultable ici pendant 3 mois.</small>
      </form>
    </>
  );
}
