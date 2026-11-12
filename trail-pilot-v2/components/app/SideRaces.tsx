"use client";

import Fold from "./Fold";
import { useCallback, useEffect, useState } from "react";
import { api, dayLabel, fmtDur, fmtKm, fmtNum, localToday } from "./client";
import { IconTrash } from "./icons";

export interface SideRaceRow { id: number; name: string; date: string; distanceKm: number | null; gainM: number | null; priority: "B" | "C" }

/** Courses de préparation : objectifs secondaires (B) ou courses d’entraînement (C), intégrées au planning. */
export default function SideRaces({ races, today, mainDate, onChanged, toast }: {
  races: SideRaceRow[]; today: string; mainDate: string | null; onChanged: () => Promise<void>; toast: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", date: "", distanceKm: "", gainM: "", priority: "B" as "B" | "C" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const upcoming = races.filter((r) => r.date > today);
  // Météo, temps visé et consignes de chaque course (rechargés quand la liste change).
  const [guides, setGuides] = useState<Record<number, Guide>>({});
  const sig = upcoming.map((r) => `${r.id}:${r.date}`).join(",");
  const loadGuides = useCallback(async () => {
    try { const r = await api<{ guides: Guide[] }>(`/api/races?guides=1&today=${today}`); setGuides(Object.fromEntries(r.guides.map((g) => [g.id, g]))); } catch { /* la liste reste utilisable sans météo */ }
  }, [today]);
  useEffect(() => { if (sig) loadGuides(); }, [sig, loadGuides]);
  const alert = upcoming.map((r) => guides[r.id]).find((g) => g && g.tone !== "normal" && g.weather?.status === "ok");
  const min = (() => { const d = new Date(`${localToday()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();

  async function add(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api("/api/races", { method: "POST", body: f }); setOpen(false); setF({ name: "", date: "", distanceKm: "", gainM: "", priority: "B" }); await onChanged(); toast("Course ajoutée : le planning a été recalculé autour."); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : "Erreur"); }
    finally { setBusy(false); }
  }
  async function remove(r: SideRaceRow) {
    if (!confirm(`Retirer ${r.name} ?`)) return;
    try { await api(`/api/races?id=${r.id}`, { method: "DELETE" }); await onChanged(); } catch (e) { toast(e instanceof Error ? e.message : "Erreur"); }
  }

  return (
    <Fold id="plan-sides" style={{ marginTop: 14 }} title="Courses de préparation" aside={<span className={`chip ${alert ? "lite" : upcoming.length ? "" : "dim"}`}>{alert ? "Météo à anticiper" : upcoming.length ? `${upcoming.length} prévue${upcoming.length > 1 ? "s" : ""}` : "Aucune"}</span>}>
      {!open && <div className="row"><button className="btn ghost sm" onClick={() => setOpen(true)}>Ajouter une course</button></div>}
      {!upcoming.length && !open && <p className="soft small" style={{ margin: 0 }}>Tu fais d’autres courses avant {mainDate ? "ta course principale" : "ton prochain objectif"} ? Ajoute-les : le planning allège les jours d’avant, remplace la sortie longue de la semaine et prévoit la récupération.</p>}
      {upcoming.length > 0 && (
        <ul className="list races">
          {upcoming.map((r) => (
            <li key={r.id} className="item" style={{ gridTemplateColumns: "1fr auto" }}>
              <div style={{ minWidth: 0 }}>
                <div className="t">⚑ {r.name}</div>
                <div className="s">{dayLabel(r.date, { weekday: "long", day: "numeric", month: "long" })}{r.distanceKm ? ` · ${fmtKm(r.distanceKm)} km` : ""}{r.gainM ? ` · ${fmtNum(r.gainM)} m D+` : ""} · {r.priority === "B" ? "objectif secondaire" : "course d’entraînement"}</div>
              </div>
              <div className="item-actions"><button className="iconbtn" aria-label={`Retirer ${r.name}`} onClick={() => remove(r)}><IconTrash /></button></div>
              {guides[r.id] && <RaceGuide g={guides[r.id]} race={r} toast={toast} onChanged={loadGuides} />}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <form className="form" onSubmit={add}>
          <label className="field">Nom<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={80} placeholder="Trail du Salève" /></label>
          <div className="fields f3">
            <label className="field">Date<input type="date" min={min} max={mainDate ?? undefined} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></label>
            <label className="field">Distance (km)<input inputMode="decimal" value={f.distanceKm} onChange={(e) => setF({ ...f, distanceKm: e.target.value })} placeholder="21" /></label>
            <label className="field">D+ (m)<input inputMode="numeric" value={f.gainM} onChange={(e) => setF({ ...f, gainM: e.target.value })} placeholder="1100" /></label>
          </div>
          <fieldset className="scale">
            <legend>Importance</legend>
            <div className="picks p2">
              <label className={f.priority === "B" ? "on" : ""}><input type="radio" name="prio" checked={f.priority === "B"} onChange={() => setF({ ...f, priority: "B" })} />Objectif secondaire</label>
              <label className={f.priority === "C" ? "on" : ""}><input type="radio" name="prio" checked={f.priority === "C"} onChange={() => setF({ ...f, priority: "C" })} />Course d’entraînement</label>
            </div>
            <div className="ends"><span>Allègement avant, récup après</span><span>Effort contrôlé, sans affûtage</span></div>
          </fieldset>
          {err && <p className="note err" role="alert">{err}</p>}
          <div className="row"><button className="btn sm" type="submit" disabled={busy}>{busy ? "Calcul…" : "Ajouter au planning"}</button><button type="button" className="btn ghost sm" onClick={() => { setOpen(false); setErr(null); }}>Annuler</button></div>
        </form>
      )}
    </Fold>
  );
}

interface Place { name: string; lat: number; lon: number }
interface Guide {
  id: number; place: Place | null; placeAssumed: boolean; tone: string;
  weather: { status: "ok"; weather: { tMin: number; tMax: number; feelsMax: number; rainProb: number | null; windMax: number; label: string } } | { status: "later"; from: string } | { status: "noplace" | "past" | "error" } | null;
  estimate: { low: number; high: number } | null; water: [number, number] | null; tips: string[];
}

/** Guidage d’une course de préparation : météo annoncée au départ, temps visé, consignes ; le lieu se choisit ici. */
function RaceGuide({ g, race, toast, onChanged }: { g: Guide; race: SideRaceRow; toast: (m: string) => void; onChanged: () => Promise<void> }) {
  const [edit, setEdit] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const w = g.weather;
  async function search(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { setFound((await api<{ places: Place[] }>("/api/weather", { method: "POST", body: { query: q } })).places); }
    catch (e2) { toast(e2 instanceof Error ? e2.message : "Erreur"); }
    finally { setBusy(false); }
  }
  async function choose(p: Place) {
    setBusy(true);
    try { await api("/api/races", { method: "PATCH", body: { id: race.id, ...p } }); setEdit(false); setFound(null); setQ(""); await onChanged(); toast(`Météo de ${race.name} : ${p.name}.`); }
    catch (e) { toast(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); }
  }
  return (
    <div className={`race-guide tone-${g.tone}`}>
      <div className="rg-line">
        {w?.status === "ok" ? <b>{w.weather.label} · {w.weather.tMin}° / {w.weather.tMax}°{w.weather.feelsMax - w.weather.tMax >= 2 || w.weather.tMax - w.weather.feelsMax >= 2 ? ` (ressenti ${w.weather.feelsMax}°)` : ""}{w.weather.rainProb != null && w.weather.rainProb >= 30 ? ` · pluie ${w.weather.rainProb} %` : ""}{w.weather.windMax >= 25 ? ` · vent ${w.weather.windMax} km/h` : ""}</b>
          : w?.status === "later" ? <span>Prévision à partir du {dayLabel(w.from, { day: "numeric", month: "long" })}</span>
          : w?.status === "noplace" ? <span>Indique le lieu de la course pour avoir sa météo.</span>
          : w?.status === "error" ? <span>Prévision indisponible pour le moment.</span> : null}
        {g.estimate && <span className="mono">Temps visé {fmtDur(g.estimate.low)} – {fmtDur(g.estimate.high)}</span>}
      </div>
      <div className="rg-place">
        <small className="muted">{g.place ? <>{g.place.name}{g.placeAssumed ? " (ton lieu d’entraînement, par défaut)" : ""}</> : "Lieu non défini"}</small>
        {!edit && <button className="link small" onClick={() => setEdit(true)}>{g.place && !g.placeAssumed ? "Changer de lieu" : "Indiquer le lieu"}</button>}
        <button className="link small" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Masquer les conseils" : `Conseils pour cette course (${g.tips.length})`}</button>
      </div>
      {edit && (
        <form className="form" onSubmit={search}>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field" style={{ flex: 1, minWidth: 150 }}>Ville de départ<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Annecy" minLength={2} maxLength={80} required /></label>
            <button className="btn sm" disabled={busy}>{busy ? "Recherche…" : "Chercher"}</button>
            <button type="button" className="btn ghost sm" onClick={() => { setEdit(false); setFound(null); }}>Annuler</button>
          </div>
          {found && (found.length ? <ul className="wx-places">{found.map((p) => <li key={`${p.lat},${p.lon}`}><button type="button" onClick={() => choose(p)} disabled={busy}>{p.name}</button></li>)}</ul>
            : <p className="muted small" style={{ margin: 0 }}>Aucun lieu trouvé. Essaie le nom de la commune.</p>)}
        </form>
      )}
      {more && <ul className="reasons">{g.tips.map((t) => <li key={t}>{t}</li>)}</ul>}
    </div>
  );
}
