"use client";

import { useCallback, useEffect, useState } from "react";
import { api, dayLabel } from "./client";
import { weatherAdjust, type WeatherAdjust } from "@/lib/engine/strategy";

interface W { tMin: number; tMax: number; feelsMax: number; rainProb: number | null; rainMm: number; windMax: number; label: string; date: string }
type Data =
  | { status: "ok"; weather: W; place: { name: string }; fromTrace: boolean }
  | { status: "later"; from: string; place: { name: string }; fromTrace: boolean }
  | { status: "noplace" | "nogoal" | "past" | "error"; place?: { name: string }; fromTrace?: boolean };

/** Météo du jour J au départ de la course, et ce qu’elle change pour l’eau, le sel et l’allure. */
export default function RaceWeather({ toast, onAdjust }: { toast: (m: string) => void; onAdjust: (a: WeatherAdjust | null) => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [edit, setEdit] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ name: string; lat: number; lon: number }[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<Data>("/api/weather");
      setD(r);
      onAdjust(r.status === "ok" ? weatherAdjust(r.weather) : null);
    } catch { setD({ status: "error" }); onAdjust(null); }
  }, [onAdjust]);
  useEffect(() => { load(); }, [load]);

  async function search(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { setFound((await api<{ places: { name: string; lat: number; lon: number }[] }>("/api/weather", { method: "POST", body: { query: q } })).places); }
    catch (e2) { toast(e2 instanceof Error ? e2.message : "Erreur"); }
    finally { setBusy(false); }
  }
  async function choose(p: { name: string; lat: number; lon: number }) {
    setBusy(true);
    try { await api("/api/weather", { method: "PUT", body: p }); setEdit(false); setFound(null); setQ(""); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); }
  }

  if (!d || d.status === "nogoal" || d.status === "past") return null;
  const adj = d.status === "ok" ? weatherAdjust(d.weather) : null;
  const askPlace = d.status === "noplace" || edit;

  return (
    <section className="card wx" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div><span className="eyebrow">Météo du jour J</span><h2 style={{ marginTop: 4 }}>{d.place?.name ?? "Lieu de départ"}</h2></div>
        {d.place && !d.fromTrace && !edit && <button className="link small" onClick={() => setEdit(true)}>Changer de lieu</button>}
      </div>

      {askPlace ? (
        <form className="form" onSubmit={search}>
          <p className="soft small" style={{ margin: 0 }}>Indique la ville ou la station de départ (ou importe le GPX du parcours plus bas) : la prévision arrive 15 jours avant la course.</p>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field" style={{ flex: 1, minWidth: 180 }}>Ville de départ<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chamonix" minLength={2} maxLength={80} required /></label>
            <button className="btn sm" disabled={busy}>{busy ? "Recherche…" : "Chercher"}</button>
            {edit && <button type="button" className="btn ghost sm" onClick={() => { setEdit(false); setFound(null); }}>Annuler</button>}
          </div>
          {found && (found.length ? (
            <ul className="wx-places">{found.map((p) => <li key={`${p.lat},${p.lon}`}><button type="button" onClick={() => choose(p)} disabled={busy}>{p.name}</button></li>)}</ul>
          ) : <p className="muted small" style={{ margin: 0 }}>Aucun lieu trouvé. Essaie le nom de la commune.</p>)}
        </form>
      ) : d.status === "later" ? (
        <p className="soft" style={{ margin: 0 }}>La prévision sera disponible à partir du {dayLabel(d.from, { weekday: "long", day: "numeric", month: "long" })}. Ta stratégie de course s’ajustera alors à la chaleur, au froid ou à la pluie annoncés.</p>
      ) : d.status === "error" ? (
        <p className="muted" style={{ margin: 0 }}>Prévision indisponible pour le moment. Réessaie plus tard.</p>
      ) : d.status === "ok" && adj ? (
        <>
          <div className="specs wx-specs">
            <div><b>{d.weather.tMin}° / {d.weather.tMax}°</b><small>{d.weather.label}</small></div>
            <div><b>{d.weather.feelsMax}°</b><small>Ressenti max</small></div>
            <div><b>{d.weather.rainProb != null ? `${d.weather.rainProb} %` : "—"}</b><small>Risque de pluie{d.weather.rainMm ? ` · ${String(d.weather.rainMm).replace(".", ",")} mm` : ""}</small></div>
            <div><b>{d.weather.windMax} km/h</b><small>Vent max</small></div>
          </div>
          {adj.tips.length > 0 ? <ul className="reasons">{adj.tips.map((t) => <li key={t}>{t}</li>)}</ul> : <p className="soft small" style={{ margin: 0 }}>Conditions tempérées : la stratégie standard s’applique.</p>}
          {adj.tone !== "normal" && <p className="muted small" style={{ margin: 0 }}>Stratégie ajustée : {adj.water[0]}-{adj.water[1]} ml d’eau et {adj.sodium[0]}-{adj.sodium[1]} mg de sodium par heure{adj.timeFactor > 1 ? `, temps visé allongé de ${Math.round((adj.timeFactor - 1) * 100)} %` : ""}.</p>}
          <p className="muted" style={{ margin: 0, fontSize: 11.5 }}>Prévision <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> au point de départ, mise à jour toutes les 3 heures. En montagne, la météo change vite : vérifie le bulletin officiel la veille.</p>
        </>
      ) : null}
    </section>
  );
}
