"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, dayLabel, fmtDur, fmtKm, fmtNum, localToday } from "./client";
import { Fiche, FicheHead, useFiche } from "./Fiche";
import { FoldRows } from "./Fold";
import GearList, { type GearItem } from "./GearList";
import RaceStrategy from "./RaceStrategy";
import type { RaceRoute } from "@/lib/engine/strategy";
import { haptic } from "@/components/haptics";

/**
 * Saison : frise des courses à venir (principales, secondaires, entraînement) avec affûtage et récupération,
 * alertes quand deux courses principales sont trop proches, et préparation de chaque course principale suivante
 * (tracé, stratégie, matériel) avant que le plan ne la vise.
 */
export interface SeasonRace { key: string; id: number | null; active: boolean; name: string; date: string; distanceKm: number | null; gainM: number | null; chained: boolean; hasRoute: boolean; daysTo: number; estimate: { low: number; high: number } | null }
export interface Season {
  today: string; races: SeasonRace[];
  warnings: { key: string; prevKey: string; prevName: string; gapDays: number; needDays: number; text: string }[];
  last: { name: string; date: string } | null;
  sides: { id: number; name: string; date: string; priority: "B" | "C" }[];
  bands: { kind: "affutage" | "recup"; from: string; to: string; label: string }[];
}
interface NextDetail { route: RaceRoute | null; gear: GearItem[] }

export function useSeason(toast: (m: string) => void) {
  const [s, setS] = useState<Season | null>(null);
  const load = useCallback(async () => { try { setS(await api<Season>(`/api/season?today=${localToday()}`)); } catch (e) { toast(e instanceof Error ? e.message : "Erreur"); } }, [toast]);
  useEffect(() => { load(); }, [load]);
  return { season: s, reload: load };
}

// ---------- Frise ----------
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const t = (d: string) => Date.parse(`${d}T12:00:00Z`);

export function SeasonStrip({ s }: { s: Season }) {
  // Dessinée à la largeur réelle (pas d'étirement : textes et drapeaux restent nets sur téléphone).
  const ref = useRef<HTMLElement>(null);
  const [W, setW] = useState(340);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const H = 112, pad = 16;
  const dates = [...s.races.map((r) => r.date), ...s.sides.map((x) => x.date), ...s.bands.map((b) => b.to)];
  const start = t(s.today), end = Math.max(start + 90 * 86400000, ...dates.map((d) => t(d) + 21 * 86400000));
  const x = (d: string) => pad + Math.max(0, Math.min(1, (t(d) - start) / (end - start))) * (W - 2 * pad);
  const months: { x: number; label: string }[] = [];
  const m = new Date(start); m.setUTCDate(1); m.setUTCMonth(m.getUTCMonth() + 1);
  while (m.getTime() <= end) { months.push({ x: x(m.toISOString().slice(0, 10)), label: MONTHS[m.getUTCMonth()] }); m.setUTCMonth(m.getUTCMonth() + 1); }
  const summary = [...s.races.map((r) => `${r.name} (principale, ${dayLabel(r.date, { day: "numeric", month: "long" })})`), ...s.sides.map((r) => `${r.name} (${r.priority === "B" ? "secondaire" : "entraînement"}, ${dayLabel(r.date, { day: "numeric", month: "long" })})`)].join(", ");
  return (
    <figure className="season-strip" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Frise de la saison : ${summary || "aucune course"}`}>
        <line x1={pad} x2={W - pad} y1={66} y2={66} className="ss-axis" />
        {s.bands.map((b) => <rect key={`${b.kind}${b.from}`} className={`ss-band is-${b.kind}`} x={x(b.from)} y={58} width={Math.max(3, x(b.to) - x(b.from))} height={16} rx={3}><title>{b.label}</title></rect>)}
        {months.map((mo) => <g key={mo.x}><line x1={mo.x} x2={mo.x} y1={74} y2={80} className="ss-tick" /><text x={mo.x} y={96} className="ss-month">{mo.label}</text></g>)}
        {s.sides.map((r) => <circle key={`b${r.id}`} cx={x(r.date)} cy={66} r={r.priority === "B" ? 7 : 4.5} className={`ss-dot is-${r.priority}`}><title>{`${r.name} · ${r.priority === "B" ? "objectif secondaire" : "course d’entraînement"}`}</title></circle>)}
        {s.races.map((r, i) => (
          <g key={r.key} className={`ss-main${r.active ? " is-active" : ""}`}>
            <line x1={x(r.date)} x2={x(r.date)} y1={30} y2={66} className="ss-pole" />
            <path d={`M${x(r.date)} 30 h16 l-5 6 l5 6 h-16 z`} className="ss-flag" />
            <text x={x(r.date)} y={22} className="ss-num">{i + 1}</text>
            <circle cx={x(r.date)} cy={66} r={7} className="ss-a"><title>{`${r.name} · course principale`}</title></circle>
          </g>
        ))}
        <line x1={pad} x2={pad} y1={52} y2={80} className="ss-today" />
      </svg>
      <figcaption className="season-legend">
        <span><i className="lg-a" /><small>Principale</small></span><span><i className="lg-b" /><small>Secondaire</small></span><span><i className="lg-c" /><small>Entraînement</small></span>
        <span><i className="lg-taper" /><small>Affûtage</small></span><span><i className="lg-recup" /><small>Récupération</small></span>
      </figcaption>
      <ol className="season-names">
        {s.races.map((r) => <li key={r.key}><b>{r.name}</b> · {dayLabel(r.date, { day: "numeric", month: "short" })}{r.active ? " · le plan la vise" : ""}</li>)}
      </ol>
    </figure>
  );
}

// ---------- Alertes d'écart ----------
export function SeasonWarnings({ s, onChanged, toast }: { s: Season; onChanged: () => Promise<void>; toast: (m: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function act(key: string, kind: "toB" | "chain") {
    setBusy(key);
    try {
      if (kind === "toB") await api("/api/season", { method: "POST", body: { action: "toB", key, today: s.today } });
      else { const r = s.races.find((x) => x.key === key); await api("/api/season", { method: "PATCH", body: key === "main" ? { key, chained: true, today: s.today } : { id: r?.id, chained: true, today: s.today } }); }
      haptic("success"); await onChanged();
      toast(kind === "toB" ? "Passée en objectif secondaire : elle est intégrée au plan de ta course principale." : "Enchaînement accepté : le plan récupère puis s’affûte au plus court.");
    } catch (e) { toast(e instanceof Error ? e.message : "Erreur"); } finally { setBusy(null); }
  }
  if (!s.warnings.length) return null;
  return (
    <div className="season-warn">
      {s.warnings.map((w) => {
        const r = s.races.find((x) => x.key === w.key);
        return (
          <div key={w.key} className="note warn-gap" role="note">
            <b>{r?.name ?? "Course"} : écart court</b>
            <p>{w.text}</p>
            <div className="row">
              <button type="button" className="btn sm" disabled={!!busy} onClick={() => act(w.key, "toB")}>Passer en objectif secondaire</button>
              <button type="button" className="btn ghost sm" disabled={!!busy} onClick={() => act(w.key, "chain")}>Enchaîner quand même</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Ajouter une course ----------
export function AddRaceFiche({ ctl, today, onSaved }: { ctl: ReturnType<typeof useFiche<true>>; today: string; onSaved: (msg: string) => Promise<void> }) {
  const [f, setF] = useState({ name: "", date: "", distanceKm: "", gainM: "", priority: "A" as "A" | "B" | "C" });
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const min = useMemo(() => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }, [today]);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (f.priority === "A") {
        const r = await api<{ active: boolean }>("/api/season", { method: "POST", body: { ...f, today } });
        ctl.close(); setF({ name: "", date: "", distanceKm: "", gainM: "", priority: "A" });
        await onSaved(r.active ? `${f.name} est ta prochaine course principale : le plan la vise désormais.` : `${f.name} ajoutée à ta saison : le plan la visera après la course en cours.`);
      } else {
        await api("/api/races", { method: "POST", body: { ...f, today } });
        ctl.close(); setF({ name: "", date: "", distanceKm: "", gainM: "", priority: "A" });
        await onSaved("Course ajoutée : le planning a été recalculé autour.");
      }
    } catch (x) { setErr(x instanceof Error ? x.message : "Erreur"); } finally { setBusy(false); }
  }
  return (
    <Fiche ctl={ctl} kind="addrace">
      {ctl.value && (
        <>
          <FicheHead eyebrow="Ma saison" title="Ajouter une course" onClose={ctl.close} />
          <div className="panel-body">
            <form className="form" onSubmit={save}>
              <fieldset className="scale">
                <legend>Importance</legend>
                <div className="picks p3">
                  {([["A", "Principale"], ["B", "Objectif secondaire"], ["C", "Entraînement"]] as const).map(([v, l]) => (
                    <label key={v} className={f.priority === v ? "on" : ""}><input type="radio" name="prio-add" checked={f.priority === v} onChange={() => setF({ ...f, priority: v })} />{l}</label>
                  ))}
                </div>
                <p className="small soft" style={{ margin: "6px 0 0" }}>{f.priority === "A" ? "Le plan la vise à son tour : progression, affûtage, course, puis récupération avant la suivante." : f.priority === "B" ? "Intégrée au plan de la course principale qui la suit : allègement avant, récupération après." : "Effort contrôlé, à la place de la sortie longue de la semaine, sans affûtage."}</p>
              </fieldset>
              <label className="field">Nom<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={80} placeholder="Ultra des Cimes" /></label>
              <div className="fields f3">
                <label className="field">Date<input type="date" min={min} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></label>
                <label className="field">Distance (km)<input inputMode="decimal" value={f.distanceKm} onChange={(e) => setF({ ...f, distanceKm: e.target.value })} placeholder="42" /></label>
                <label className="field">D+ (m)<input inputMode="numeric" value={f.gainM} onChange={(e) => setF({ ...f, gainM: e.target.value })} placeholder="2400" /></label>
              </div>
              {err && <p className="note err" role="alert">{err}</p>}
              <div className="row"><button className="btn" type="submit" disabled={busy}>{busy ? "Calcul…" : "Ajouter à ma saison"}</button><button type="button" className="btn ghost" onClick={ctl.close}>Annuler</button></div>
            </form>
          </div>
        </>
      )}
    </Fiche>
  );
}

// ---------- Préparer une course principale suivante ----------
export function NextRaceCard({ r, s, onChanged, toast }: { r: SeasonRace; s: Season; onChanged: () => Promise<void>; toast: (m: string) => void }) {
  const [d, setD] = useState<NextDetail | null>(null);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ name: r.name, date: r.date, distanceKm: r.distanceKm?.toString().replace(".", ",") ?? "", gainM: r.gainM?.toString() ?? "" });
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const loadDetail = useCallback(async () => { try { setD(await api<NextDetail>(`/api/season/race?id=${r.id}`)); } catch { setD({ route: null, gear: [] }); } }, [r.id]);
  useEffect(() => { loadDetail(); }, [loadDetail]);
  const changed = async () => { await Promise.all([loadDetail(), onChanged()]); };
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api("/api/season", { method: "PATCH", body: { id: r.id, ...f, today: s.today } }); setEdit(false); await onChanged(); toast("Course modifiée."); }
    catch (x) { setErr(x instanceof Error ? x.message : "Erreur"); } finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm(`Retirer ${r.name} de ta saison ?`)) return;
    try { await api(`/api/season?id=${r.id}&today=${s.today}`, { method: "DELETE" }); await onChanged(); toast(`${r.name} retirée de ta saison.`); }
    catch (x) { toast(x instanceof Error ? x.message : "Erreur"); }
  }
  async function toB() {
    try { await api("/api/season", { method: "POST", body: { action: "toB", key: r.key, today: s.today } }); await onChanged(); toast(`${r.name} passe en objectif secondaire.`); }
    catch (x) { toast(x instanceof Error ? x.message : "Erreur"); }
  }
  return (
    <section className="card next-race" id={`next-${r.id}`} aria-labelledby={`nr-${r.id}`}>
      <div className="card-head">
        <div><span className="eyebrow">Course principale suivante · dans {r.daysTo} jours</span><h2 id={`nr-${r.id}`} style={{ marginTop: 4 }}>{r.name}</h2></div>
        <span className="chip">{dayLabel(r.date, { day: "numeric", month: "long", year: "numeric" })}</span>
      </div>
      <p className="soft small" style={{ margin: 0 }}>
        {r.distanceKm ? `${fmtKm(r.distanceKm)} km` : "Distance à préciser"}{r.gainM ? ` · ${fmtNum(r.gainM)} m D+` : ""}
        {r.estimate ? <> · temps estimé avec ta forme actuelle <b className="mono">{fmtDur(r.estimate.low)} – {fmtDur(r.estimate.high)}</b></> : null}
      </p>
      <p className="muted small" style={{ margin: 0 }}>Le plan la visera après {s.races.find((x) => x.active)?.name ?? "ta course en cours"}, avec la récupération d’abord. Tu peux déjà importer son tracé et préparer son matériel.</p>
      {!edit ? (
        <div className="row">
          <button type="button" className="btn ghost sm" onClick={() => setEdit(true)}>Modifier</button>
          <button type="button" className="btn ghost sm" onClick={toB}>Passer en objectif secondaire</button>
          <button type="button" className="btn ghost sm" onClick={remove}>Retirer</button>
        </div>
      ) : (
        <form className="form" onSubmit={save}>
          <label className="field">Nom<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={80} /></label>
          <div className="fields f3">
            <label className="field">Date<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></label>
            <label className="field">Distance (km)<input inputMode="decimal" value={f.distanceKm} onChange={(e) => setF({ ...f, distanceKm: e.target.value })} /></label>
            <label className="field">D+ (m)<input inputMode="numeric" value={f.gainM} onChange={(e) => setF({ ...f, gainM: e.target.value })} /></label>
          </div>
          {err && <p className="note err" role="alert">{err}</p>}
          <div className="row"><button className="btn sm" type="submit" disabled={busy}>Enregistrer</button><button type="button" className="btn ghost sm" onClick={() => { setEdit(false); setErr(null); }}>Annuler</button></div>
        </form>
      )}
      {d && r.estimate && (
        <FoldRows className="plan-rows next-rows">
          <RaceStrategy raceId={r.id!} raceName={r.name} raceDate={r.date} route={d.route} estimate={r.estimate} weather={null} gear={d.gear} toast={toast} onChanged={changed} />
          <GearList key={`${r.id}:${d.gear.map((x) => x.label).join("|")}`} raceId={r.id!} items={d.gear} daysTo={r.daysTo} toast={toast} />
        </FoldRows>
      )}
    </section>
  );
}
