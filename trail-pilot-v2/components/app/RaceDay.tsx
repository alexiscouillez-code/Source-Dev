"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmtDur, fmtNum } from "./client";
import { buzz } from "./motion";
import { decodePolyline } from "@/lib/polyline";
import { passageAt, type RaceRoute, type Strategy } from "@/lib/engine/strategy";

const KEY = "tp-raceday";
interface Saved { start: number | null; paused: number | null; pauseTotal: number; marks: { km: number; at: number }[]; eatEvery: number; drinkEvery: number }
const fresh = (): Saved => ({ start: null, paused: null, pauseTotal: 0, marks: [], eatEvery: 25, drinkEvery: 15 });
const read = (): Saved => { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return fresh(); } };
const save = (s: Saved) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* stockage indisponible */ } };

const clock = (ms: number) => { const t = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const kmTxt = (k: number) => String(Math.round(k * 10) / 10).replace(".", ",");

/**
 * Mode jour de course : écran plein, lisible en courant. Chrono, position estimée (ou GPS), prochain ravito
 * avec l’heure d’arrivée prévue, avance ou retard sur le plan, rappels pour manger et boire, écran maintenu allumé.
 */
export default function RaceDay({ route, strat, onClose }: { route: RaceRoute; strat: Strategy; onClose: () => void }) {
  const [st, setSt] = useState<Saved>(fresh);
  const [now, setNow] = useState(() => Date.now());
  const [gpsKm, setGpsKm] = useState<number | null>(null);
  const [gps, setGps] = useState<"off" | "wait" | "on" | "err">("off");
  const [alert, setAlert] = useState<string | null>(null);
  const lastEat = useRef(0), lastDrink = useRef(0);
  useEffect(() => { setSt(read()); }, []);
  const update = (f: (s: Saved) => Saved) => setSt((s) => { const n = f(s); save(n); return n; });

  const running = st.start != null && st.paused == null;
  const elapsed = st.start == null ? 0 : (st.paused ?? now) - st.start - st.pauseTotal;
  useEffect(() => { if (!running) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [running]);

  // Écran maintenu allumé pendant la course.
  useEffect(() => {
    if (!running || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null, off = false;
    const get = () => (navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen").then((l) => { if (off) l.release(); else lock = l; }).catch(() => {});
    get();
    const vis = () => { if (document.visibilityState === "visible") get(); };
    document.addEventListener("visibilitychange", vis);
    return () => { off = true; document.removeEventListener("visibilitychange", vis); lock?.release().catch(() => {}); };
  }, [running]);

  // Position GPS recalée sur le tracé (recherche vers l’avant pour ne pas sauter sur une portion déjà courue).
  const line = useMemo(() => {
    if (!route.line) return null;
    try {
      const pts = decodePolyline(route.line);
      const rad = (x: number) => (x * Math.PI) / 180, d = (a: [number, number], b: [number, number]) => { const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
      const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + d(pts[i - 1], pts[i]));
      const scale = route.distanceKm / Math.max(0.1, cum[cum.length - 1]);
      return { pts, cum: cum.map((c) => c * scale), d };
    } catch { return null; }
  }, [route]);
  useEffect(() => {
    if (gps === "off" || !line || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition((p) => {
      setGps("on");
      const here: [number, number] = [p.coords.latitude, p.coords.longitude];
      setGpsKm((prev) => {
        let best = -1, bd = Infinity;
        for (let i = 0; i < line.pts.length; i++) {
          if (prev != null && (line.cum[i] < prev - 1 || line.cum[i] > prev + 6)) continue;
          const dd = line.d(line.pts[i], here);
          if (dd < bd) { bd = dd; best = i; }
        }
        return best >= 0 && bd < 0.5 ? line.cum[best] : prev;
      });
    }, () => setGps("err"), { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [gps, line]);

  // Position estimée d’après le plan : kilomètre où l’heure de passage moyenne vaut le temps écoulé.
  const planKm = useMemo(() => {
    const min = elapsed / 60000;
    let lo = 0, hi = route.distanceKm;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2, t = passageAt(strat, m); if ((t.low + t.high) / 2 < min) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }, [elapsed, strat, route.distanceKm]);
  const lastMark = st.marks[st.marks.length - 1];
  // Recalage : après un pointage au ravito, on repart de là au rythme prévu, corrigé de l’écart constaté.
  const km = gpsKm ?? (lastMark ? Math.max(lastMark.km, planKmShift(strat, route.distanceKm, elapsed, lastMark)) : planKm);
  const next = route.aid.find((a) => a.km > km + 0.05);
  const target = next?.km ?? route.distanceKm;
  const tAt = passageAt(strat, target), tNow = passageAt(strat, km);
  const delta = lastMark ? lastMark.at / 60000 - (passageAt(strat, lastMark.km).low + passageAt(strat, lastMark.km).high) / 2 : null;
  const eta = st.start != null ? st.start + st.pauseTotal + ((tAt.low + tAt.high) / 2 + (delta ?? 0)) * 60000 : null;
  const gainTo = useMemo(() => {
    let g = 0; const p = route.points;
    for (let i = 1; i < p.length; i++) if (p[i][0] > km && p[i][0] <= target && p[i][1] > p[i - 1][1]) g += p[i][1] - p[i - 1][1];
    return Math.round(g);
  }, [route.points, km, target]);
  const perHour = strat.perHour;

  // Rappels pour manger et boire.
  useEffect(() => {
    if (!running) return;
    const m = elapsed / 60000;
    if (m - lastEat.current >= st.eatEvery) { lastEat.current = Math.floor(m / st.eatEvery) * st.eatEvery; setAlert(`Mange : environ ${Math.round((perHour.carbs[0] * st.eatEvery) / 60)} à ${Math.round((perHour.carbs[1] * st.eatEvery) / 60)} g de glucides`); buzz([200, 100, 200]); }
    else if (m - lastDrink.current >= st.drinkEvery) { lastDrink.current = Math.floor(m / st.drinkEvery) * st.drinkEvery; setAlert(`Bois : environ ${Math.round((perHour.water[0] * st.drinkEvery) / 60)} à ${Math.round((perHour.water[1] * st.drinkEvery) / 60)} ml`); buzz([120, 80, 120]); }
  }, [elapsed, running, st.eatEvery, st.drinkEvery, perHour]);
  useEffect(() => { if (!alert) return; const t = setTimeout(() => setAlert(null), 20000); return () => clearTimeout(t); }, [alert]);

  const startStop = () => update((s) => {
    const t = Date.now();
    if (s.start == null) { lastEat.current = 0; lastDrink.current = 0; return { ...s, start: t, paused: null, pauseTotal: 0, marks: [] }; }
    if (s.paused != null) return { ...s, pauseTotal: s.pauseTotal + (t - s.paused), paused: null };
    return { ...s, paused: t };
  });
  const reset = () => { if (confirm("Remettre le chrono à zéro ?")) { update(() => ({ ...fresh(), eatEvery: st.eatEvery, drinkEvery: st.drinkEvery })); setGpsKm(null); } };
  const mark = () => { if (!next || st.start == null) return; buzz(30); update((s) => ({ ...s, marks: [...s.marks, { km: next.km, at: elapsed }] })); };
  const pct = Math.min(100, (km / route.distanceKm) * 100);

  return createPortal(
    <div className="raceday" role="dialog" aria-modal="true" aria-label="Mode jour de course">
      <div className="rd-top">
        <span className="eyebrow">{route.name ?? "Jour de course"}</span>
        <button className="rd-close" onClick={onClose} aria-label="Fermer le mode jour de course">×</button>
      </div>
      <div className={`rd-clock ${running ? "on" : ""}`} aria-live="off">{clock(elapsed)}</div>
      <div className="rd-prog" aria-label={`${kmTxt(km)} km sur ${kmTxt(route.distanceKm)}`}><i style={{ width: `${pct}%` }} /><span style={{ left: `${pct}%` }} /></div>
      <div className="rd-row">
        <div><small>Position {gpsKm != null ? "GPS" : "estimée"}</small><b>km {kmTxt(km)}</b></div>
        <div><small>Plan à ce stade</small><b>{fmtDur(Math.round(tNow.low))}–{fmtDur(Math.round(tNow.high))}</b></div>
        {delta != null && <div><small>Sur le plan</small><b className={delta <= 0 ? "ok" : "late"}>{delta <= 0 ? "−" : "+"}{fmtDur(Math.abs(Math.round(delta)))}</b></div>}
      </div>
      <div className="rd-next">
        <small>{next ? "Prochain ravito" : "Arrivée"}</small>
        <b>{next ? next.name || `Ravito km ${kmTxt(next.km)}` : "Ligne d’arrivée"}</b>
        <span>dans {kmTxt(Math.max(0, target - km))} km{gainTo ? ` · ${fmtNum(gainTo)} m D+` : ""}{eta ? ` · vers ${hhmm(eta)}` : ""}</span>
      </div>
      {alert && <button className="rd-alert" onClick={() => setAlert(null)}>{alert}<small>Toucher pour fermer</small></button>}
      <div className="rd-actions">
        <button className={`btn ${running ? "ghost" : ""} rd-main`} onClick={startStop}>{st.start == null ? "Départ" : running ? "Pause" : "Reprendre"}</button>
        {st.start != null && next && <button className="btn ghost" onClick={mark}>Je suis au ravito</button>}
      </div>
      <div className="rd-foot">
        <button className="link small" onClick={() => setGps(gps === "off" ? "wait" : "off")}>{gps === "off" ? "Activer le GPS" : gps === "wait" ? "Recherche du GPS…" : gps === "err" ? "GPS indisponible" : "GPS actif"}</button>
        <label className="small">Manger toutes les <select value={st.eatEvery} onChange={(e) => update((s) => ({ ...s, eatEvery: Number(e.target.value) }))}>{[15, 20, 25, 30, 40].map((n) => <option key={n} value={n}>{n} min</option>)}</select></label>
        <label className="small">Boire toutes les <select value={st.drinkEvery} onChange={(e) => update((s) => ({ ...s, drinkEvery: Number(e.target.value) }))}>{[10, 15, 20, 30].map((n) => <option key={n} value={n}>{n} min</option>)}</select></label>
        {st.start != null && <button className="link small" onClick={reset}>Remettre à zéro</button>}
      </div>
    </div>,
    document.body,
  );
}

/** Kilomètre estimé après un pointage : même rythme que le plan, décalé de l’écart constaté au pointage. */
function planKmShift(strat: Strategy, total: number, elapsed: number, mark: { km: number; at: number }) {
  const mid = (k: number) => { const t = passageAt(strat, k); return (t.low + t.high) / 2; };
  const offset = mark.at / 60000 - mid(mark.km);
  const min = elapsed / 60000 - offset;
  let lo = mark.km, hi = total;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (mid(m) < min) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
