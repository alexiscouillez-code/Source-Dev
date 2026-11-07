"use client";

import { useState } from "react";
import { api, dayLabel, fmtKm, fmtNum, localToday } from "./client";
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
    <section className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <h2>Courses de préparation</h2>
        {!open && <button className="btn ghost sm" onClick={() => setOpen(true)}>Ajouter</button>}
      </div>
      {!upcoming.length && !open && <p className="soft small" style={{ margin: 0 }}>Tu fais d’autres courses avant {mainDate ? "ta course principale" : "ton prochain objectif"} ? Ajoute-les : le planning allège les jours d’avant, remplace la sortie longue de la semaine et prévoit la récupération.</p>}
      {upcoming.length > 0 && (
        <ul className="list">
          {upcoming.map((r) => (
            <li key={r.id} className="item" style={{ gridTemplateColumns: "1fr auto" }}>
              <div style={{ minWidth: 0 }}>
                <div className="t">⚑ {r.name}</div>
                <div className="s">{dayLabel(r.date, { weekday: "long", day: "numeric", month: "long" })}{r.distanceKm ? ` · ${fmtKm(r.distanceKm)} km` : ""}{r.gainM ? ` · ${fmtNum(r.gainM)} m D+` : ""} · {r.priority === "B" ? "objectif secondaire" : "course d’entraînement"}</div>
              </div>
              <div className="item-actions"><button className="iconbtn" aria-label={`Retirer ${r.name}`} onClick={() => remove(r)}><IconTrash /></button></div>
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
    </section>
  );
}
