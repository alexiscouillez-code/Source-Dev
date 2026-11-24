"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, dayLabel, fmtDur, fmtKm, fmtNum, localToday, SPORT_LABEL } from "./client";
import { IconShare, IconX } from "./icons";
import { motionOk } from "./motion";
import { recapStory } from "./story";
import StoryPreview from "./StoryPreview";
import type { PanelProps } from "./Panels";
import type { MonthRecap } from "@/lib/recap";

const SLIDE_MS = 5200;
const LANDMARKS = [{ name: "la tour Eiffel", m: 330 }, { name: "le mont Ventoux", m: 1617 }, { name: "le mont Blanc", m: 4806 }, { name: "l’Everest", m: 8849 }];
const prevMonth = (m: string) => { const d = new Date(`${m}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };
const nextMonth = (m: string) => { const d = new Date(`${m}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); };

/** Nombre qui défile jusqu'à sa valeur à l'apparition de l'écran. */
function Count({ v, fmt = fmtNum }: { v: number; fmt?: (n: number) => string }) {
  const [x, setX] = useState(motionOk() ? 0 : v);
  useEffect(() => {
    if (!motionOk()) { setX(v); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 1100); setX(v * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return <>{fmt(x)}</>;
}

/** Le mois en points : un point par jour, d'autant plus gros que la journée a été longue. */
function DotMonth({ r, lit = true }: { r: MonthRecap; lit?: boolean }) {
  const lead = (new Date(`${r.days[0].date}T12:00:00Z`).getUTCDay() + 6) % 7;
  const max = Math.max(30, ...r.days.map((d) => d.minutes));
  const today = localToday();
  return (
    <div className="rc-month" role="img" aria-label={`${r.totals.activeDays} jours actifs sur le mois`}>
      {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <small key={i} aria-hidden="true">{d}</small>)}
      {Array.from({ length: lead }, (_, i) => <span key={`x${i}`} aria-hidden="true" />)}
      {r.days.map((d, i) => (
        <span key={d.date} aria-hidden="true" className={`${d.minutes > 0 && lit ? "on" : ""}${d.date > today ? " future" : ""}`}
          style={{ ["--s" as string]: d.minutes > 0 ? 0.35 + 0.65 * Math.sqrt(d.minutes / max) : 0.18, ["--i" as string]: i }} title={`${dayLabel(d.date, { day: "numeric", month: "long" })} : ${d.minutes ? fmtDur(d.minutes) : "repos"}`} />
      ))}
    </div>
  );
}

/**
 * Bilan du mois façon story : plusieurs écrans qui défilent seuls (toucher à droite pour avancer, à gauche pour
 * revenir, appuyer pour mettre en pause), chiffres qui défilent, mois en points, plus belle sortie, forme.
 * Le dernier écran propose l'image à partager. Flèches ‹ › pour changer de mois.
 */
export default function Recap({ month: m0, toast, close, swap }: PanelProps & { month?: string }) {
  const [month, setMonth] = useState<string | null>(m0 ?? null);
  const [r, setR] = useState<MonthRecap | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [story, setStory] = useState(false);
  useEffect(() => {
    setR(null); setErr(null); setI(0);
    api<MonthRecap>(`/api/recap${month ? `?month=${month}` : ""}`).then((x) => { setR(x); if (!month) setMonth(x.month); }).catch((e) => setErr(e instanceof Error ? e.message : "Erreur"));
  }, [month]);

  const slides = r ? buildSlides(r, swap) : [];
  const n = slides.length;
  const go = useCallback((k: number) => setI((x) => Math.max(0, Math.min(n - 1, x + k))), [n]);
  // Avance toute seule (sauf en pause, sur le dernier écran ou pendant l'aperçu de l'image).
  const timer = useRef(0);
  useEffect(() => {
    if (!r || paused || story || i >= n - 1 || !motionOk()) return;
    timer.current = window.setTimeout(() => go(1), SLIDE_MS);
    return () => window.clearTimeout(timer.current);
  }, [r, i, paused, story, n, go]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (story) return; if (e.key === "ArrowRight") go(1); else if (e.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [go, story]);

  const cur = localToday().slice(0, 7);
  return (
    <div className="rc">
      <header className="panel-head rc-head">
        <div className="rc-bars" aria-hidden="true">
          {slides.map((_, k) => <i key={k} className={k < i ? "done" : k === i ? `on${paused || story ? " paused" : ""}` : ""} style={{ ["--d" as string]: `${SLIDE_MS}ms` }} />)}
        </div>
        <div className="panel-bar">
          <div className="rc-nav">
            <button type="button" className="iconbtn sm" aria-label="Mois précédent" onClick={() => month && setMonth(prevMonth(month))}>‹</button>
            <span className="eyebrow" aria-live="polite">{r ? `Bilan · ${r.label}${r.partial ? " (en cours)" : ""}` : "Bilan du mois"}</span>
            <button type="button" className="iconbtn sm" aria-label="Mois suivant" disabled={!month || month >= cur} onClick={() => month && setMonth(nextMonth(month))}>›</button>
          </div>
          <button type="button" className="iconbtn panel-x" aria-label="Fermer le bilan" onClick={close}><IconX /></button>
        </div>
        <h2 className="panel-title sr-only">Bilan du mois</h2>
      </header>
      {err && <div className="panel-body"><p className="note err">{err}</p></div>}
      {!r && !err && <div className="panel-body"><div className="skeleton" style={{ height: 360 }} /></div>}
      {r && (
        <div className="rc-stage" onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerCancel={() => setPaused(false)} onPointerLeave={() => setPaused(false)}>
          <div className="rc-slide" key={`${r.month}-${i}`}>{slides[i]}</div>
          <button type="button" className="rc-tap rc-prev" aria-label="Écran précédent" disabled={i === 0} onClick={() => go(-1)} />
          <button type="button" className="rc-tap rc-next" aria-label="Écran suivant" disabled={i >= n - 1} onClick={() => go(1)} />
        </div>
      )}
      {r && i === n - 1 && (
        <div className="rc-foot">
          <button type="button" className="btn" onClick={() => setStory(true)}><IconShare />Partager en story</button>
          <button type="button" className="btn ghost" onClick={() => setI(0)}>Revoir</button>
        </div>
      )}
      {story && r && (
        <StoryPreview filename={`trail-pilot-${r.month}.png`} title={`Mon mois de ${r.label}`} toast={toast} onClose={() => setStory(false)}
          make={() => recapStory({
            label: r.label, partial: r.partial, km: r.totals.km, gain: r.totals.gain, minutes: r.totals.minutes, count: r.totals.count, activeDays: r.totals.activeDays, streak: r.streak,
            days: r.days.map((d) => ({ date: d.date, minutes: d.minutes })),
            longest: r.longest ? `Plus longue : ${r.longest.name ?? SPORT_LABEL[r.longest.sport] ?? "sortie"}${r.longest.km ? ` · ${fmtKm(r.longest.km)} km` : ""}` : null,
            climb: r.climb ? `Plus gros D+ : ${fmtNum(r.climb.gain)} m` : null, form: r.form,
          })} />
      )}
    </div>
  );
}

function buildSlides(r: MonthRecap, swap: PanelProps["swap"]) {
  const t = r.totals, p = r.previous;
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  const dKm = pct(t.km, p.km);
  const land = [...LANDMARKS].reverse().find((l) => t.gain >= l.m * 0.8) ?? LANDMARKS[0];
  const times = t.gain / land.m;
  const days = r.days.filter((d) => d.date <= localToday()).length;
  const slides: React.ReactNode[] = [];
  slides.push(
    <div className="rc-s rc-intro">
      <span className="rc-kicker">Ton mois de</span>
      <b className="rc-huge rc-title">{r.label.split(" ")[0]}</b>
      <DotMonth r={r} />
      <p className="rc-sub">{t.count ? `${t.count} sortie${t.count > 1 ? "s" : ""}, ${t.activeDays} jour${t.activeDays > 1 ? "s" : ""} actif${t.activeDays > 1 ? "s" : ""}${r.partial ? " jusqu’ici" : ""}.` : "Pas encore de sortie ce mois-ci."}</p>
    </div>,
  );
  if (!t.count) return slides;
  slides.push(
    <div className="rc-s">
      <span className="rc-kicker">Volume</span>
      <b className="rc-huge"><Count v={t.km} fmt={(x) => fmtKm(x)} /><i>km</i></b>
      <div className="rc-row"><div><b><Count v={t.minutes} fmt={(x) => fmtDur(Math.round(x))} /></b><small>d’effort</small></div><div><b><Count v={t.count} /></b><small>sorties</small></div></div>
      {dKm != null && <p className="rc-sub">{dKm === 0 ? "Autant que le mois d’avant." : `${dKm > 0 ? "+" : ""}${dKm} % de kilomètres par rapport au mois d’avant (${fmtKm(p.km)} km).`}</p>}
    </div>,
  );
  if (t.gain > 0) slides.push(
    <div className="rc-s rc-climb">
      <span className="rc-kicker">Dénivelé</span>
      <b className="rc-huge"><Count v={t.gain} /><i>m D+</i></b>
      <svg className="rc-peak" viewBox="0 0 300 120" aria-hidden="true">
        <defs><clipPath id="rc-peak-clip"><path d="M0 120 L70 60 L105 82 L160 18 L215 70 L245 52 L300 120 Z" /></clipPath></defs>
        <path className="rc-peak-line" d="M0 120 L70 60 L105 82 L160 18 L215 70 L245 52 L300 120" pathLength={1} />
        <rect className="rc-peak-fill" clipPath="url(#rc-peak-clip)" x="0" y="0" width="300" height="120" style={{ ["--f" as string]: Math.min(1, times / Math.max(1, Math.ceil(times))) }} />
      </svg>
      <p className="rc-sub">Soit {times >= 1.05 ? `${String(Math.round(times * 10) / 10).replace(".", ",")} fois` : times >= 0.95 ? "l’équivalent de" : `${Math.round(times * 100)} % de`} {land.name} ({fmtNum(land.m)} m).</p>
    </div>,
  );
  slides.push(
    <div className="rc-s">
      <span className="rc-kicker">Régularité</span>
      <b className="rc-huge"><Count v={t.activeDays} /><i>/ {days} jours</i></b>
      <DotMonth r={r} />
      <p className="rc-sub">{r.streak > 1 ? `Plus longue série : ${r.streak} jours d’affilée.` : "Des sorties bien espacées : la récupération a sa place."}</p>
    </div>,
  );
  if (r.longest) {
    const l = r.longest;
    slides.push(
      <div className="rc-s">
        <span className="rc-kicker">Ta plus longue sortie</span>
        <b className="rc-name">{l.name ?? SPORT_LABEL[l.sport] ?? "Sortie"}</b>
        <span className="rc-date">{dayLabel(l.date, { weekday: "long", day: "numeric", month: "long" })}</span>
        <div className="rc-row">
          {l.km != null && <div><b><Count v={l.km} fmt={(x) => fmtKm(x)} /></b><small>km</small></div>}
          {l.gain ? <div><b><Count v={l.gain} /></b><small>m D+</small></div> : null}
          <div><b>{fmtDur(l.minutes)}</b><small>durée</small></div>
        </div>
        <button type="button" className="btn ghost sm rc-open" onClick={(e) => { e.stopPropagation(); swap({ kind: "run", id: l.id, initial: { id: l.id, name: l.name, date: l.date, distance_km: l.km, gain_m: l.gain, duration_min: l.minutes, sport: l.sport } }, e.currentTarget); }}>Ouvrir la fiche</button>
      </div>,
    );
  }
  if (r.form) {
    const d = r.form.end - r.form.start;
    slides.push(
      <div className="rc-s">
        <span className="rc-kicker">Forme de fond</span>
        <b className="rc-huge">{d > 0 ? "+" : d < 0 ? "−" : ""}<Count v={Math.abs(d)} /></b>
        <div className="rc-form" aria-hidden="true"><span>{r.form.start}</span><i style={{ ["--d" as string]: d >= 0 ? 1 : -1 }} /><span>{r.form.end}</span></div>
        <p className="rc-sub">{d >= 3 ? "Ta forme de fond monte : la charge du mois a été bien absorbée." : d <= -3 ? "Ta forme de fond a baissé : mois plus calme (récupération, coupure ou imprévu)." : "Forme de fond stable sur le mois."}</p>
      </div>,
    );
  }
  if (r.races.length) slides.push(
    <div className="rc-s">
      <span className="rc-kicker">Course{r.races.length > 1 ? "s" : ""} du mois</span>
      <ul className="rc-races">{r.races.map((x) => <li key={x.date}><b>⚑ {x.name}</b><span>{dayLabel(x.date, { day: "numeric", month: "long" })}{x.durationMin ? ` · ${fmtDur(x.durationMin)}` : ""}</span></li>)}</ul>
    </div>,
  );
  slides.push(
    <div className="rc-s rc-end">
      <span className="rc-kicker">En résumé</span>
      <ul className="rc-sum">
        <li><b>{fmtKm(t.km)}</b> km</li>
        <li><b>{fmtNum(t.gain)}</b> m D+</li>
        <li><b>{fmtDur(t.minutes)}</b> d’effort</li>
        <li><b>{t.activeDays}</b> jours actifs</li>
      </ul>
      {r.sports.length > 1 && <p className="rc-sub">{r.sports.slice(0, 3).map((s) => `${SPORT_LABEL[s.sport] ?? s.sport} ${fmtDur(s.minutes)}`).join(" · ")}</p>}
    </div>,
  );
  return slides;
}
