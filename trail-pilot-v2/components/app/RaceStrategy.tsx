"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motionOk } from "./motion";
import RaceDay from "./RaceDay";
import dynamic from "next/dynamic";
import { api, fmtDur, fmtKm, fmtNum } from "./client";
import { buildStrategy, passageAt, type RaceRoute, type Strategy, type WeatherAdjust } from "@/lib/engine/strategy";
import { decodePolyline } from "@/lib/polyline";
import type { MapMarker } from "./TrackMap";

const TrackMap = dynamic(() => import("./TrackMap"), { ssr: false });
import { parseRouteFile } from "@/lib/activity-file";
import InfoTip from "./InfoTip";

/** Stratégie de course : profil du tracé, temps de passage par section, ravitaillements et nutrition. */
export default function RaceStrategy({ route, estimate, onChanged, toast, weather }: {
  route: RaceRoute | null; estimate: { low: number; high: number }; weather?: WeatherAdjust | null;
  onChanged: () => Promise<void>; toast: (m: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [editAid, setEditAid] = useState(false);
  const [aidText, setAidText] = useState("");
  const [raceDay, setRaceDay] = useState(false);
  const strat = useMemo(() => (route ? buildStrategy(route, estimate, weather) : null), [route, estimate, weather]);
  const map = useMemo(() => {
    if (!route?.line) return null;
    try {
      const pts = decodePolyline(route.line);
      if (pts.length < 2) return null;
      // Position de chaque ravito : distance cumulée le long du tracé, recalée sur la distance officielle.
      const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
      const d = (a: [number, number], b: [number, number]) => { const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
      const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + d(pts[i - 1], pts[i]));
      const at = (km: number) => { const t = (km / Math.max(0.1, route.distanceKm)) * cum[cum.length - 1]; const i = cum.findIndex((c) => c >= t); return pts[i < 0 ? pts.length - 1 : i]; };
      const markers: MapMarker[] = [
        { at: pts[0], label: "Départ", kind: "start" },
        ...route.aid.map((a) => ({ at: at(a.km), label: `${a.name || "Ravito"} · km ${String(a.km).replace(".", ",")}`, kind: "aid" as const })),
        { at: pts[pts.length - 1], label: "Arrivée", kind: "finish" },
      ];
      return { lines: [{ poly: route.line }], markers };
    } catch { return null; }
  }, [route]);

  async function onFile(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const r = await parseRouteFile(file);
      const res = await api<{ replanned: boolean }>("/api/goal/trace", { method: "PUT", body: { points: r.points, aid: r.aid, distanceKm: r.distanceKm, gainM: r.gainM, lossM: r.lossM, line: r.line } });
      await onChanged();
      toast(res.replanned ? `Tracé importé : ${fmtKm(r.distanceKm)} km, ${fmtNum(r.gainM)} m D+. Le plan a été recalculé sur ces chiffres.` : "Tracé importé.");
      if (!r.aid.length) { setEditAid(true); setAidText(""); }
    } catch (e) { toast(e instanceof Error ? e.message : "Tracé illisible"); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function saveAid(e: React.FormEvent) {
    e.preventDefault();
    // Format : « 12 Refuge du Lac, 25,5, 38 Col » → un ravito par élément, nom facultatif.
    const aid = aidText.split(/[;\n]/).map((s) => s.trim()).filter(Boolean).map((s) => {
      const m = /^(\d+(?:[.,]\d+)?)\s*(?:km)?\s*[-–:]?\s*(.*)$/i.exec(s);
      return m ? { km: Number(m[1].replace(",", ".")), name: m[2] } : null;
    }).filter(Boolean);
    setBusy(true);
    try { await api("/api/goal/trace", { method: "PATCH", body: { aid } }); await onChanged(); setEditAid(false); toast("Ravitaillements enregistrés."); }
    catch (e2) { toast(e2 instanceof Error ? e2.message : "Erreur"); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm("Retirer le tracé de la course ?")) return;
    try { await api("/api/goal/trace", { method: "DELETE" }); await onChanged(); } catch (e) { toast(e instanceof Error ? e.message : "Erreur"); }
  }

  const input = <input ref={fileRef} type="file" accept=".gpx,.tcx,application/gpx+xml" hidden onChange={(e) => onFile(e.target.files?.[0])} />;

  if (!route || !strat) {
    return (
      <section className="card strat" style={{ marginTop: 14 }}>
        <div className="card-head"><h2>Stratégie de course</h2><span className="chip dim">Tracé à importer</span></div>
        <p className="soft" style={{ margin: 0 }}>Importe le GPX du parcours (fourni par l’organisation) : Trail Pilot affiche le profil, découpe la course aux ravitaillements et calcule pour chaque section ton temps de passage et ce qu’il faut boire et manger.</p>
        <div className="row">{input}<button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Lecture…" : "Importer le tracé de la course"}</button></div>
      </section>
    );
  }

  const aidKms = route.aid.map((a) => a.km);
  return (
    <section className="card strat" style={{ marginTop: 14 }}>
      <div className="card-head">
        <h2 className="tip-label">Stratégie de course<InfoTip title="Comment c’est calculé">
          <span className="p">Le temps total estimé par ton plan est réparti entre les sections selon leur effort : distance, plus 1 km par 100 m de D+, plus un peu pour la descente. La fatigue qui s’accumule allonge les dernières sections.</span>
          <span className="p">Nutrition : repères usuels en endurance (<em>{strat.perHour.carbs[0]}-{strat.perHour.carbs[1]} g de glucides</em>, <em>{strat.perHour.water[0]}-{strat.perHour.water[1]} ml d’eau</em> et {strat.perHour.sodium[0]}-{strat.perHour.sodium[1]} mg de sodium par heure). À tester à l’entraînement et à ajuster selon la chaleur.</span>
        </InfoTip></h2>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => setRaceDay(true)}>Mode jour de course</button>
          {input}
          <button className="btn ghost sm" disabled={busy} onClick={() => { setEditAid(!editAid); setAidText(route.aid.map((a) => `${String(a.km).replace(".", ",")}${a.name ? ` ${a.name}` : ""}`).join("; ")); }}>Ravitos</button>
          <button className="btn ghost sm" disabled={busy} onClick={() => fileRef.current?.click()}>Changer de tracé</button>
          <button className="btn ghost sm" onClick={remove} aria-label="Retirer le tracé">Retirer</button>
        </div>
      </div>

      {map && <TrackMap lines={map.lines} markers={map.markers} height={320} label={`Carte du parcours : ${fmtKm(route.distanceKm)} km`} />}
      {!map && <p className="muted small" style={{ margin: 0 }}>Réimporte le GPX du parcours pour voir le tracé sur la carte.</p>}
      <Profile route={route} aid={aidKms} strat={strat} />

      {editAid && (
        <form className="aid-form" onSubmit={saveAid}>
          <label className="field">Ravitaillements (km et nom, séparés par des points-virgules)
            <input value={aidText} onChange={(e) => setAidText(e.target.value)} placeholder="12 Refuge du Lac; 25,5 Col de la Croix; 38" />
          </label>
          <div className="row"><button className="btn sm" type="submit" disabled={busy}>Enregistrer</button><button className="btn ghost sm" type="button" onClick={() => setEditAid(false)}>Annuler</button></div>
        </form>
      )}
      {!route.aid.length && !editAid && <p className="muted small" style={{ margin: 0 }}>Aucun ravitaillement indiqué : la course est découpée tous les 10 km. Ajoute les tiens avec « Ravitos ».</p>}

      <div className="strat-sum">
        <div><small>Temps visé{weather && weather.timeFactor > 1 ? " (chaleur)" : ""}</small><b className="mono">{fmtDur(strat.total.low)} – {fmtDur(strat.total.high)}</b></div>
        <div><small>Glucides au total</small><b className="mono">{strat.totals.carbs[0]}–{strat.totals.carbs[1]} g</b></div>
        <div><small>Eau au total</small><b className="mono">{(strat.totals.water[0] / 1000).toFixed(1).replace(".", ",")}–{(strat.totals.water[1] / 1000).toFixed(1).replace(".", ",")} L</b></div>
      </div>

      <div className="strat-table" role="table" aria-label="Sections de la course">
        <div className="st-row st-head" role="row"><span role="columnheader">Section</span><span role="columnheader">Terrain</span><span role="columnheader">Temps</span><span role="columnheader">Passage</span><span role="columnheader">À emporter</span></div>
        {strat.sections.map((s, i) => (
          <div key={i} className="st-row" role="row">
            <span role="cell"><b>{s.label}</b><small>km {String(s.from).replace(".", ",")} → {String(s.to).replace(".", ",")}</small></span>
            <span role="cell" className="mono">{fmtKm(s.km)} km<small>+{fmtNum(s.gain)} / −{fmtNum(s.loss)} m</small></span>
            <span role="cell" className="mono">{fmtDur(s.minutes.low)}–{fmtDur(s.minutes.high)}<small>{s.pace} /km</small></span>
            <span role="cell" className="mono">{fmtDur(s.arrival.low)}–{fmtDur(s.arrival.high)}</span>
            <span role="cell" className="mono">{s.carbs[1] ? `${s.carbs[0]}–${s.carbs[1]} g` : "eau seule"}<small>{s.water[0]}–{s.water[1]} ml</small></span>
          </div>
        ))}
      </div>
      {raceDay && <RaceDay route={route} strat={strat} onClose={() => setRaceDay(false)} />}
      <p className="muted small" style={{ margin: 0 }}>Un gel ou une barre apporte en général 20 à 30 g de glucides. Teste ta stratégie lors de ta sortie test et de tes sorties longues : rien de nouveau le jour J.</p>
    </section>
  );
}

/**
 * Profil de la course. Un petit coureur le parcourt à l’ouverture ; en survolant ou en faisant glisser le doigt,
 * il indique l’altitude, l’heure de passage estimée et le prochain ravitaillement.
 */
function Profile({ route, aid, strat }: { route: RaceRoute; aid: number[]; strat: Strategy }) {
  const W = 720, H = 170, P = { l: 36, r: 8, t: 12, b: 22 };
  const pts = route.points;
  const max = Math.max(...pts.map((p) => p[1])), min = Math.min(...pts.map((p) => p[1]));
  const lo = Math.floor(min / 100) * 100, hi = Math.ceil(max / 100) * 100 || lo + 100;
  const x = (k: number) => P.l + (k / route.distanceKm) * (W - P.l - P.r);
  const y = (e: number) => P.t + (1 - (e - lo) / Math.max(1, hi - lo)) * (H - P.t - P.b);
  const step = Math.max(1, Math.floor(pts.length / 900));
  const line = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(" ");
  const ele = (k: number) => {
    let i = pts.findIndex((p) => p[0] >= k);
    if (i <= 0) return pts[Math.max(0, i)][1];
    const a = pts[i - 1], b = pts[i], f = b[0] > a[0] ? (k - a[0]) / (b[0] - a[0]) : 0;
    return a[1] + (b[1] - a[1]) * f;
  };
  const kmTicks = Array.from({ length: 6 }, (_, i) => Math.round((route.distanceKm * i) / 5));
  const svg = useRef<SVGSVGElement>(null);
  const [km, setKm] = useState<number | null>(null);
  const [intro, setIntro] = useState(false);
  // Le coureur parcourt le profil une fois à l’ouverture.
  useEffect(() => {
    if (!motionOk()) return;
    let raf = 0, t0 = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect(); setIntro(true);
      const tick = (t: number) => {
        t0 ||= t;
        const k = Math.min(1, (t - t0) / 2600), eased = 1 - Math.pow(1 - k, 2.2);
        setKm(eased * route.distanceKm);
        if (k < 1) raf = requestAnimationFrame(tick); else { setTimeout(() => { setKm(null); setIntro(false); }, 700); }
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    if (svg.current) io.observe(svg.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [route.distanceKm]);
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setIntro(false);
    setKm(Math.max(0, Math.min(route.distanceKm, ((px - P.l) / (W - P.l - P.r)) * route.distanceKm)));
  };
  const info = km == null ? null : (() => {
    const t = passageAt(strat, km), next = route.aid.find((a) => a.km > km + 0.05);
    return { e: ele(km), t, next };
  })();
  const fmtKmDec = (k: number) => String(Math.round(k * 10) / 10).replace(".", ",");
  return (
    <div className="profile-wrap">
      <svg ref={svg} className="chart profile" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Profil de la course : ${fmtKm(route.distanceKm)} km, ${fmtNum(route.gainM)} m de D+`}
        onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => { if (!intro) setKm(null); }} style={{ touchAction: "pan-y" }}>
        {[lo, (lo + hi) / 2, hi].map((t) => <g key={t}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} style={{ stroke: "var(--line)" }} /><text x={P.l - 6} y={y(t) + 3} textAnchor="end">{Math.round(t)}</text></g>)}
        <path d={`${line} L${x(route.distanceKm)} ${H - P.b} L${x(0)} ${H - P.b} Z`} style={{ fill: "color-mix(in srgb, var(--ember) 16%, transparent)" }} />
        <path d={line} fill="none" className="profile-line" style={{ stroke: "var(--ember)" }} strokeWidth={1.8} strokeLinejoin="round" pathLength={1} />
        {aid.map((k) => <g key={k}><line x1={x(k)} x2={x(k)} y1={y(ele(k))} y2={H - P.b} style={{ stroke: "var(--snow)" }} strokeDasharray="2 3" /><circle cx={x(k)} cy={y(ele(k))} r={3.5} style={{ fill: "var(--snow)" }} /></g>)}
        {kmTicks.map((k, i) => <text key={i} x={x(k)} y={H - 6} textAnchor={i === 0 ? "start" : i === 5 ? "end" : "middle"}>{k} km</text>)}
        {km != null && info && (
          <g className="runner" style={{ transform: `translate(${x(km)}px, ${y(info.e)}px)` }}>
            <line x1={0} x2={0} y1={0} y2={H - P.b - y(info.e)} className="runner-stem" />
            <circle r={9} className="runner-halo" />
            <circle r={4.5} className="runner-dot" />
          </g>
        )}
      </svg>
      <div className={`profile-tip ${info ? "on" : ""}`} aria-live="polite">
        {info ? <>
          <b>km {fmtKmDec(km!)}</b><span>{fmtNum(Math.round(info.e))} m</span>
          <span>passage {fmtDur(Math.round(info.t.low))}–{fmtDur(Math.round(info.t.high))}</span>
          <span>{info.next ? `${info.next.name || "ravito"} dans ${fmtKmDec(info.next.km - km!)} km` : `arrivée dans ${fmtKmDec(route.distanceKm - km!)} km`}</span>
        </> : <span className="muted">Glisse le long du profil pour voir altitude, passage et prochain ravito.</span>}
      </div>
    </div>
  );
}
