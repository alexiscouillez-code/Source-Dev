"use client";

import Fold from "./Fold";
import { useEffect, useState } from "react";
import { api, fmtNum, localToday } from "./client";
import { refreshForecast, useForecast } from "./useForecast";

type Toast = (m: string) => void;
interface Place { name: string; lat: number; lon: number }

/** Lieu d’entraînement : sert à corriger les allures des séances selon la météo annoncée. */
export function HomeCard({ toast }: { toast: Toast }) {
  const today = localToday();
  const f = useForecast(today);
  const [edit, setEdit] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { setFound((await api<{ places: Place[] }>("/api/weather", { method: "POST", body: { query: q } })).places); }
    catch (e2) { toast(e2 instanceof Error ? e2.message : "Erreur"); }
    finally { setBusy(false); }
  }
  async function choose(p: Place | null) {
    setBusy(true);
    try { await api("/api/weather/training", { method: "PUT", body: p ?? { clear: true } }); setEdit(false); setFound(null); setQ(""); await refreshForecast(today); toast(p ? `Lieu d’entraînement : ${p.name}.` : "Lieu d’entraînement retiré."); }
    catch (e) { toast(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); }
  }

  const has = f.status === "ok" || f.status === "error";
  return (
    <Fold id="acc-home" title="Lieu d’entraînement" aside={<><span className={`chip ${has ? "ok" : "dim"}`}><span className="dot" />{has ? "Météo active" : "Non défini"}</span></>}>
      <p className="soft small" style={{ margin: 0 }}>
        Là où tu cours d’habitude. Les allures de tes séances sont corrigées selon la chaleur annoncée (et des consignes s’affichent par vent fort, pluie, neige ou orage), sur les 15 prochains jours.
      </p>
      {f.place && !edit && (
        <div className="row between">
          <span><b>{f.place.name}</b>{!f.chosen && <small className="muted"> · par défaut, le départ de ta course</small>}</span>
          <span className="row" style={{ gap: 6 }}>
            <button className="btn ghost sm" onClick={() => setEdit(true)}>Changer</button>
            {f.chosen && <button className="btn ghost sm" disabled={busy} onClick={() => choose(null)}>Retirer</button>}
          </span>
        </div>
      )}
      {(edit || f.status === "noplace") && (
        <form className="form" onSubmit={search}>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field" style={{ flex: 1, minWidth: 160 }}>Ville<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Annecy" minLength={2} maxLength={80} required /></label>
            <button className="btn sm" disabled={busy}>{busy ? "Recherche…" : "Chercher"}</button>
            {edit && <button type="button" className="btn ghost sm" onClick={() => { setEdit(false); setFound(null); }}>Annuler</button>}
          </div>
          {found && (found.length ? (
            <ul className="wx-places">{found.map((p) => <li key={`${p.lat},${p.lon}`}><button type="button" onClick={() => choose(p)} disabled={busy}>{p.name}</button></li>)}</ul>
          ) : <p className="muted small" style={{ margin: 0 }}>Aucun lieu trouvé. Essaie le nom de la commune.</p>)}
        </form>
      )}
    </Fold>
  );
}

export interface Shoe { id: number; name: string; terrain: "route" | "trail" | "mixte"; km: number; limitKm: number; runs: number; isDefault: boolean; retired: boolean; wear: "ok" | "bientot" | "usee"; last: string | null }
const TERRAIN: Record<Shoe["terrain"], string> = { route: "Route", trail: "Trail", mixte: "Route et trail" };
export const WEAR: Record<Shoe["wear"], string> = { ok: "En forme", bientot: "À changer bientôt", usee: "À remplacer" };

/** Chaussures : kilométrage de chaque paire, alerte d’usure, paire par défaut par terrain. */
export function ShoesCard({ toast }: { toast: Toast }) {
  const [shoes, setShoes] = useState<Shoe[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showRetired, setShowRetired] = useState(false);
  const [form, setForm] = useState({ name: "", terrain: "trail" as Shoe["terrain"], baseKm: "", limitKm: "700" });
  useEffect(() => { api<{ shoes: Shoe[] }>("/api/shoes").then((r) => setShoes(r.shoes)).catch(() => setShoes([])); }, []);

  async function call(fn: () => Promise<{ shoes: Shoe[] }>, ok?: string) {
    setBusy(true);
    try { setShoes((await fn()).shoes); if (ok) toast(ok); return true; }
    catch (e) { toast(e instanceof Error ? e.message : "Erreur"); return false; }
    finally { setBusy(false); }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const ok = await call(() => api("/api/shoes", { method: "POST", body: { name: form.name, terrain: form.terrain, baseKm: form.baseKm || 0, limitKm: form.limitKm || 700 } }),
      `${form.name} ajoutée : tes prochaines sorties ${form.terrain === "route" ? "sur route" : form.terrain === "trail" ? "en trail" : ""} lui seront attribuées.`);
    if (ok) { setAdding(false); setForm({ name: "", terrain: "trail", baseKm: "", limitKm: "700" }); }
  }
  const patch = (id: number, b: Record<string, unknown>, ok: string) => call(() => api("/api/shoes", { method: "PATCH", body: { id, ...b } }), ok);

  const active = shoes?.filter((s) => !s.retired) ?? [], retired = shoes?.filter((s) => s.retired) ?? [];
  const alert = active.filter((s) => s.wear !== "ok").length;
  return (
    <Fold id="acc-shoes" title="Mes chaussures" className="shoes" aside={<>{alert > 0 ? <span className="chip warn"><span className="dot" />{alert} à surveiller</span> : <span className="chip dim">{active.length} paire{active.length > 1 ? "s" : ""}</span>}</>}>
      {shoes && !active.length && !adding && <p className="soft small" style={{ margin: 0 }}>Ajoute tes paires : chaque sortie leur est attribuée selon le terrain, et tu sais quand les changer (en général entre 600 et 900 km).</p>}
      <ul className="shoe-list">
        {active.map((s) => {
          const pct = Math.min(100, Math.round((s.km / s.limitKm) * 100));
          return (
            <li key={s.id} className={`shoe w-${s.wear}`}>
              <div className="row between">
                <span><b>{s.name}</b><small className="muted"> · {TERRAIN[s.terrain]}{s.isDefault ? " · par défaut" : ""}</small></span>
                <span className="mono">{fmtNum(Math.round(s.km))} / {fmtNum(s.limitKm)} km</span>
              </div>
              <div className="shoe-bar" role="meter" aria-valuemin={0} aria-valuemax={s.limitKm} aria-valuenow={Math.round(s.km)} aria-label={`Usure de ${s.name}`}><i style={{ width: `${pct}%` }} /></div>
              <div className="row between">
                <small className={`shoe-wear w-${s.wear}`}>{WEAR[s.wear]} · {s.runs} sortie{s.runs > 1 ? "s" : ""}</small>
                <span className="row" style={{ gap: 6 }}>
                  {!s.isDefault && <button className="btn ghost sm" disabled={busy} onClick={() => patch(s.id, { isDefault: true }, `${s.name} devient ta paire par défaut.`)}>Par défaut</button>}
                  <button className="btn ghost sm" disabled={busy} onClick={() => patch(s.id, { retired: true }, `${s.name} rangée au placard.`)}>Retirer</button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {adding ? (
        <form className="form" onSubmit={add}>
          <label className="field">Modèle<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Speedgoat 6" maxLength={60} required /></label>
          <div className="row" style={{ gap: 10 }}>
            <label className="field" style={{ flex: 1 }}>Terrain
              <select value={form.terrain} onChange={(e) => setForm({ ...form, terrain: e.target.value as Shoe["terrain"] })}>
                <option value="trail">Trail</option><option value="route">Route</option><option value="mixte">Route et trail</option>
              </select>
            </label>
            <label className="field" style={{ flex: 1 }}>Déjà parcourus (km)<input inputMode="numeric" value={form.baseKm} onChange={(e) => setForm({ ...form, baseKm: e.target.value })} placeholder="0" /></label>
            <label className="field" style={{ flex: 1 }}>À changer vers (km)<input inputMode="numeric" value={form.limitKm} onChange={(e) => setForm({ ...form, limitKm: e.target.value })} /></label>
          </div>
          <div className="row"><button className="btn sm" disabled={busy}>Ajouter</button><button type="button" className="btn ghost sm" onClick={() => setAdding(false)}>Annuler</button></div>
        </form>
      ) : <div className="row"><button className="btn sm" onClick={() => setAdding(true)}>Ajouter une paire</button>{retired.length > 0 && <button className="btn ghost sm" onClick={() => setShowRetired(!showRetired)}>{showRetired ? "Masquer" : "Voir"} les anciennes ({retired.length})</button>}</div>}
      {showRetired && retired.length > 0 && (
        <ul className="shoe-list old">{retired.map((s) => <li key={s.id} className="row between"><span>{s.name} <small className="muted">· {fmtNum(Math.round(s.km))} km</small></span><button className="btn ghost sm" disabled={busy} onClick={() => patch(s.id, { retired: false }, `${s.name} ressortie du placard.`)}>Ressortir</button></li>)}</ul>
      )}
    </Fold>
  );
}
