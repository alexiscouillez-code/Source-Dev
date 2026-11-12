"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Ctx } from "./AppShell";
import { api, dayLabel, dayNum, fmtDur, fmtKm, fmtNum, localToday, shortDay, SPORT_LABEL, type Activity, type Me } from "./client";
import { IconPin, IconPlus, IconSync, IconTrash } from "./icons";
import { parseActivityFile } from "@/lib/activity-file";

const TrackMap = dynamic(() => import("./TrackMap"), { ssr: false, loading: () => <div className="tmap" style={{ height: 300 }}><div className="tmap-loading">Chargement de la carte…</div></div> });

const EFFORT_SOURCE = { ressenti: "ton ressenti", zones: "le temps passé dans chaque zone cardiaque", fc: "ta fréquence cardiaque moyenne", "estimé": "une estimation" };
const ZONE_NAMES = ["Z1 récupération", "Z2 endurance", "Z3 tempo", "Z4 seuil", "Z5 VO2max"];
const paceOf = (mPerMin: number) => { const p = 1000 / mPerMin; return `${Math.floor(p)}:${String(Math.round((p % 1) * 60) % 60).padStart(2, "0")}`; };

/** Analyse de la sortie : barre des zones cardiaques, allure ajustée à la pente, découplage, VO2max de la séance. */
function Insight({ a }: { a: Activity }) {
  const i = a.insight;
  if (!i || (!i.zones && !i.gap)) return null;
  const total = i.zones?.reduce((t, v) => t + v, 0) ?? 0;
  return (
    <div className="insight">
      {i.zones && total > 0 && (
        <div className="zbar" role="img" aria-label={`Temps par zone cardiaque : ${i.zones.map((m, k) => `${ZONE_NAMES[k]} ${m} min`).join(", ")}`}>
          {i.zones.map((m, k) => m > 0 && <i key={k} className={`z${k + 1}`} style={{ flexGrow: m }} title={`${ZONE_NAMES[k]} : ${fmtDur(m)} (${Math.round((m / total) * 100)} %)`}>{m / total > 0.12 ? `Z${k + 1}` : ""}</i>)}
        </div>
      )}
      <div className="insight-facts">
        {i.gap != null && <span title="Allure ajustée à la pente : l’allure à plat qui aurait coûté le même effort">Allure ajustée <b>{paceOf(i.gap)}</b> /km</span>}
        {i.dec != null && <span className={i.dec > 8 ? "warn" : ""} title="Découplage cardiaque : perte d’efficacité entre la première et la seconde moitié de la sortie. Sous 5 %, ton endurance tient la durée ; au-delà de 8 %, elle lâche.">Tenue de l’endurance <b>{i.dec > 0 ? "+" : ""}{String(i.dec).replace(".", ",")} %</b></span>}
        {i.vo2 != null && <span title="VO2max estimée sur les passages d’effort stable de cette sortie">VO2max <b>{String(i.vo2).replace(".", ",")}</b></span>}
      </div>
    </div>
  );
}

export default function Sessions({ me, refresh, toast }: Ctx) {
  const [acts, setActs] = useState<Activity[] | null>(null);
  const [shoes, setShoes] = useState<MiniShoe[]>([]);
  const [sheet, setSheet] = useState<Partial<Draft> | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null), mapRef = useRef<HTMLElement>(null);
  const lines = useMemo(() => (acts ?? []).filter((a) => a.track).map((a) => ({ poly: a.track!, id: a.id, highlight: a.id === focus, label: `${a.name ?? SPORT_LABEL[a.sport]} · ${shortDay(a.date)} ${dayNum(a.date)}` })), [acts, focus]);
  const focused = acts?.find((a) => a.id === focus) ?? null;
  const showOnMap = (id: number) => { setFocus(id); mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const load = useCallback(async () => { const r = await api<{ activities: Activity[]; shoes?: MiniShoe[] }>("/api/activities"); setActs(r.activities); setShoes(r.shoes ?? []); }, []);
  useEffect(() => { load().catch((e) => toast(e.message)); }, [load, toast]);
  useEffect(() => { const on = () => { load().catch(() => {}); }; window.addEventListener("tp-synced", on); return () => window.removeEventListener("tp-synced", on); }, [load]);

  async function sync() {
    setSyncing(true);
    try { const r = await api<{ imported: number; added?: number }>("/api/strava/sync", { method: "POST" }); await Promise.all([load(), refresh()]); toast(r.added ? `${r.added} nouvelle${r.added > 1 ? "s" : ""} sortie${r.added > 1 ? "s" : ""} importée${r.added > 1 ? "s" : ""}.` : "Tout est déjà à jour."); }
    catch (e) { toast(e instanceof Error ? e.message : "Erreur"); }
    finally { setSyncing(false); }
  }
  async function setRpe(a: Activity, rpe: string) {
    try { await api(`/api/activities/${a.id}`, { method: "PATCH", body: { rpe: rpe ? Number(rpe) : null } }); await Promise.all([load(), refresh()]); }
    catch (e) { toast(e instanceof Error ? e.message : "Erreur"); }
  }
  async function setShoe(a: Activity, v: string) {
    try { await api(`/api/activities/${a.id}`, { method: "PATCH", body: { shoeId: Number(v) } }); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Erreur"); }
  }
  async function remove(a: Activity) {
    if (!confirm("Supprimer cette séance ?")) return;
    try { await api(`/api/activities/${a.id}`, { method: "DELETE" }); await Promise.all([load(), refresh()]); }
    catch (e) { toast(e instanceof Error ? e.message : "Erreur"); }
  }
  async function onFile(file?: File) {
    if (!file) return;
    try {
      const g = await parseActivityFile(file);
      const s = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));
      setSheet({ source: "fichier", format: g.format, track: g.track, analysis: g.analysis ?? null, sport: g.sport, date: g.date && g.date <= localToday() ? g.date : localToday(), durationMin: s(g.durationMin), distanceKm: s(g.distanceKm), gainM: s(g.gainM), lossM: s(g.lossM), avgHr: s(g.avgHr), maxHr: s(g.maxHr), name: g.name ?? "" });
    } catch (e) { toast(e instanceof Error ? e.message : "Fichier illisible"); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <>
      <header className="head">
        <div><span className="eyebrow">90 derniers jours</span><h1>Séances</h1></div>
        <div className="row">
          {me.strava.connected && <button className="btn ghost sm" onClick={sync} disabled={syncing}><IconSync />{syncing ? "Synchro…" : "Synchro Strava"}</button>}
          <button className="btn ghost sm" onClick={() => fileRef.current?.click()} title="Fichier exporté de ta montre ou de ton appli : FIT, TCX ou GPX">Importer un fichier</button>
          <input ref={fileRef} type="file" accept=".gpx,.fit,.tcx,application/gpx+xml" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button className="btn sm" onClick={() => setSheet({ source: "manual" })}><IconPlus />Ajouter</button>
        </div>
      </header>
      {me.strava.connected && <Freshness s={me.strava} />}

      {!me.strava.connected && me.strava.configured && (
        <div className="banner" style={{ marginBottom: 14 }}>
          <div><b>Importe tes sorties depuis Strava</b><div className="small muted">Les 120 derniers jours, puis chaque nouvelle activité automatiquement.</div></div>
          <a className="btn strava sm" href="/api/strava/connect">Connecter Strava</a>
        </div>
      )}
      {me.strava.lastError && <p className="note err" style={{ marginBottom: 14 }}>Strava : {me.strava.lastError}</p>}

      {lines.length > 0 && (
        <section className="card" ref={mapRef} style={{ marginBottom: 14, scrollMarginTop: 16 }}>
          <div className="card-head"><h2>Carte de tes sorties</h2><span className="chip">{lines.length} tracé{lines.length > 1 ? "s" : ""}</span></div>
          <TrackMap lines={lines} onSelect={setFocus} height={300} label="Carte des sorties des 90 derniers jours" />
          <p className="muted small" style={{ margin: 0 }}>{focused ? <>Sélection : <b style={{ color: "var(--snow)" }}>{focused.name ?? SPORT_LABEL[focused.sport]}</b>, {dayLabel(focused.date, { weekday: "long", day: "numeric", month: "long" })}{focused.distance_km ? ` · ${fmtKm(focused.distance_km)} km` : ""}. <button className="link" onClick={() => setFocus(null)}>Tout afficher</button></> : "Touche un tracé pour voir la sortie. Les sorties Strava et les fichiers de montre avec GPS apparaissent ici."}</p>
        </section>
      )}

      {shoes.filter((s) => !s.retired && s.wear !== "ok").map((s) => (
        <p key={s.id} className={`shoe-alert w-${s.wear}`}>{s.name} : {Math.round(s.km)} km sur {s.limitKm}. {s.wear === "usee" ? "Amorti fatigué : pense à la remplacer." : "Elle approche de sa limite : prévois la suivante."}</p>
      ))}
      <section className="card" style={{ paddingTop: 6 }}>
        {!acts ? <div className="skeleton" /> : !acts.length ? <p className="empty">Aucune séance sur les 90 derniers jours.</p> : (
          <ul className="list">
            {acts.map((a) => (
              <li key={a.id} className="item run">
                <div className="date"><small>{shortDay(a.date)}</small><b>{dayNum(a.date)}</b></div>
                <div style={{ minWidth: 0 }}>
                  <div className="t">{a.name ?? SPORT_LABEL[a.sport]}</div>
                  <div className="s">
                    {SPORT_LABEL[a.sport]} · {fmtDur(a.duration_min)}{a.distance_km ? ` · ${fmtKm(a.distance_km)} km` : ""}{a.gain_m ? ` · ${fmtNum(a.gain_m)} m D+` : ""}{a.avg_hr ? ` · ${Math.round(a.avg_hr)} bpm` : ""}
                  </div>
                  <div className="s" title={`Effort ${a.effort}/10 d’après ${EFFORT_SOURCE[a.effortSource]}`}>Charge <b className="mono" style={{ color: "var(--snow)" }}>{a.load}</b> · effort {String(a.effort).replace(".", ",")}/10 ({a.effortSource}){a.source === "strava" ? " · Strava" : a.source === "gpx" ? " · GPX" : a.source === "fichier" ? " · fichier montre" : ""}</div>
                  <Insight a={a} />
                </div>
                <div className="item-actions">
                  {a.track && <button className="iconbtn" aria-label="Voir sur la carte" title="Voir sur la carte" onClick={() => showOnMap(a.id)}><IconPin /></button>}
                  <select className="rpe-select" aria-label="Ressenti de l’effort" value={a.rpe ?? ""} onChange={(e) => setRpe(a, e.target.value)}>
                    <option value="">RPE</option>
                    {Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}/10</option>)}
                  </select>
                  {shoes.length > 0 && FOOT.has(a.sport) && (
                    <select className="rpe-select shoe-pick" aria-label="Chaussures de la sortie" value={a.shoe_id ?? 0} onChange={(e) => setShoe(a, e.target.value)}>
                      <option value={0}>Chaussures ?</option>
                      {shoes.filter((s) => !s.retired || s.id === a.shoe_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                  {a.source !== "strava" && <button className="iconbtn" aria-label="Supprimer la séance" onClick={() => remove(a)}><IconTrash /></button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="muted small" style={{ marginTop: 12 }}>Pas de Strava ? Exporte tes sorties depuis Garmin Connect, Coros, Suunto ou Polar (fichier FIT, TCX ou GPX) et importe-les avec « Importer un fichier ». Indique ton ressenti (RPE) après chaque séance : c’est la donnée la plus fiable pour le calcul de charge. Sans elle, Trail Pilot utilise ta fréquence cardiaque, puis une estimation.</p>

      {sheet && <SessionSheet initial={sheet} onClose={() => setSheet(null)} onSaved={async () => { setSheet(null); await Promise.all([load(), refresh()]); toast("Séance enregistrée."); }} />}
    </>
  );
}

interface Draft { source: "manual" | "gpx" | "fichier"; format?: string; track?: string | null; analysis?: unknown; date: string; sport: string; name: string; durationMin: string; distanceKm: string; gainM: string; lossM: string; avgHr: string; maxHr?: string; rpe: number }

function SessionSheet({ initial, onClose, onSaved }: { initial: Partial<Draft>; onClose: () => void; onSaved: () => Promise<void> }) {
  const [f, setF] = useState<Draft>({ source: "manual", date: localToday(), sport: "trail", name: "", durationMin: "", distanceKm: "", gainM: "", lossM: "", avgHr: "", rpe: 5, ...initial });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Fichier analysé seconde par seconde : sans ressenti saisi, l’effort vient du temps passé dans chaque zone cardiaque.
  const [felt, setFelt] = useState(!initial.analysis);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api("/api/activities", { method: "POST", body: felt ? f : { ...f, rpe: null } }); await onSaved(); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : "Erreur"); setBusy(false); }
  }

  return (
    <div className="sheet-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet form" onSubmit={submit} aria-labelledby="sheet-title">
        <div className="row between"><h2 id="sheet-title" style={{ margin: 0 }}>{f.source === "fichier" ? `Séance depuis un fichier ${f.format ?? ""}` : f.source === "gpx" ? "Séance depuis un GPX" : "Nouvelle séance"}</h2><button type="button" className="link" onClick={onClose}>Fermer</button></div>
        <div className="fields">
          <label className="field">Date<input type="date" value={f.date} max={localToday()} onChange={set("date")} required /></label>
          <label className="field">Activité
            <select value={f.sport} onChange={set("sport")}>{Object.entries(SPORT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
        </div>
        <label className="field">Titre<input value={f.name} onChange={set("name")} placeholder="Sortie longue au Salève" maxLength={120} /></label>
        <div className="fields f3">
          <label className="field">Durée (min)<input inputMode="numeric" value={f.durationMin} onChange={set("durationMin")} required placeholder="90" /></label>
          <label className="field">Distance (km)<input inputMode="decimal" value={f.distanceKm} onChange={set("distanceKm")} placeholder="14,5" /></label>
          <label className="field">FC moy.<input inputMode="numeric" value={f.avgHr} onChange={set("avgHr")} placeholder="142" /></label>
          <label className="field">D+ (m)<input inputMode="numeric" value={f.gainM} onChange={set("gainM")} placeholder="850" /></label>
          <label className="field">D− (m)<input inputMode="numeric" value={f.lossM} onChange={set("lossM")} placeholder="850" /></label>
        </div>
        <label className="field">Ressenti de l’effort : {felt ? <><b style={{ color: "var(--snow)" }}>{f.rpe}/10</b> <small>{f.rpe <= 3 ? "facile, conversation" : f.rpe <= 5 ? "modéré" : f.rpe <= 7 ? "soutenu" : f.rpe <= 8 ? "dur" : "maximal"}</small></> : <small>calculé depuis tes zones cardiaques · déplace le curseur pour donner ton ressenti</small>}
          <input type="range" min={1} max={10} value={f.rpe} onChange={(e) => { setFelt(true); setF({ ...f, rpe: Number(e.target.value) }); }} />
        </label>
        {err && <p className="note err" role="alert">{err}</p>}
        <button className="btn" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
      </form>
    </div>
  );
}

/** Fraîcheur des données : dernière synchro Strava et part des sorties analysées seconde par seconde. */
interface MiniShoe { id: number; name: string; retired: boolean; wear: "ok" | "bientot" | "usee"; km: number; limitKm: number }
const FOOT = new Set(["trail", "course", "rando"]);

function Freshness({ s }: { s: Me["strava"] }) {
  const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 2 ? "à l’instant" : m < 60 ? `il y a ${m} min` : m < 48 * 60 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} jours`; };
  const a = s.analyzed;
  return (
    <p className={`fresh${s.lastError ? " err" : ""}`}>
      {s.lastError ? `Dernière synchro en erreur : ${s.lastError}` : s.lastSyncAt ? `Strava synchronisé ${ago(s.lastSyncAt)}` : "Strava pas encore synchronisé"}{!s.lastError && " (automatique à chaque ouverture)"}
      {a && a.total > 0 && <> · <b>{a.done}</b> sortie{a.done > 1 ? "s" : ""} analysée{a.done > 1 ? "s" : ""} seconde par seconde sur {a.total}{a.done < a.total ? " (le reste arrive aux prochaines synchros)" : ""}</>}
    </p>
  );
}

