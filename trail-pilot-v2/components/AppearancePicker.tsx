"use client";

import { useEffect, useRef, useState } from "react";
import { APPEARANCE_EVENT, APPEARANCES, autoNext, currentAppearance, currentTint, setAppearance, setAuto, setTint, TINT_EVENT, useAuto, type Appearance, type AutoPref, type DayAp, type NightAp } from "./appearance";
import { nextSunChange, sunAltitude } from "@/lib/engine/sun";
import { hapticsOn, setHaptics, haptic } from "./haptics";
import { glassPalette, TINTS, type GlassTint } from "./glassPalette";
import { grassMode, setGrassMode, windFrom, type GrassEnv, type GrassMode } from "./grassMode";

/** Dégradé du curseur de teinte : la couleur de fond obtenue pour chaque teinte, à pleine intensité. */
const HUE_TRACK = `linear-gradient(90deg, ${Array.from({ length: 13 }, (_, i) => glassPalette({ h: i * 30, k: 1 })["--g-3"]).join(", ")})`;
const same = (a: GlassTint, b: GlassTint) => a.h === b.h && Math.abs(a.k - b.k) < 0.01;

/**
 * Couleur de fond du mode Verre : teintes proposées (pastilles en trame de points, le style du mode Verre)
 * et curseur de teinte libre. Choisir une couleur passe le site en mode Verre.
 */
export function TintPicker() {
  const [t, setT] = useState<GlassTint | null>(null);
  const [glass, setGlass] = useState(false);
  const raf = useRef(0);
  useEffect(() => {
    setT(currentTint()); setGlass(currentAppearance() === "glass");
    const onTint = (e: Event) => setT((e as CustomEvent<GlassTint>).detail);
    const onAp = (e: Event) => setGlass((e as CustomEvent<Appearance>).detail === "glass");
    window.addEventListener(TINT_EVENT, onTint); window.addEventListener(APPEARANCE_EVENT, onAp);
    return () => { window.removeEventListener(TINT_EVENT, onTint); window.removeEventListener(APPEARANCE_EVENT, onAp); };
  }, []);
  const preset = t ? TINTS.find((x) => same(x.tint, t)) : null;
  return (
    <div className="tint-pick">
      <div className="tint-head">
        <span className="eyebrow">Couleur de fond du mode Verre</span>
        <span className="tint-name" aria-live="polite">{t ? preset?.label ?? `Teinte ${t.h}°` : ""}</span>
      </div>
      <div className="tint-swatches" role="radiogroup" aria-label="Couleur de fond du mode Verre">
        {TINTS.map((x) => {
          const p = glassPalette(x.tint), on = !!t && same(x.tint, t);
          return (
            <label key={x.id} className={`tint-sw${on ? " on" : ""}`} title={x.label}
              style={{ ["--s0" as string]: p["--g-0"], ["--s1" as string]: p["--g-1"], ["--s3" as string]: p["--g-3"], ["--sg" as string]: p["--g-glow"] }}>
              <input type="radio" name="glass-tint" value={x.id} checked={on} aria-label={x.label}
                onChange={(e) => setTint(x.tint, e.currentTarget.closest("label"))} />
              <span className="tint-dot" aria-hidden="true" />
              <small>{x.label}</small>
            </label>
          );
        })}
      </div>
      <label className="tint-free">
        <span className="small">Teinte libre</span>
        <input type="range" min={0} max={359} step={1} value={t?.h ?? 280} aria-valuetext={`Teinte ${t?.h ?? 280} degrés`}
          style={{ ["--track" as string]: HUE_TRACK }}
          onChange={(e) => {
            const h = Number(e.currentTarget.value), el = e.currentTarget;
            setT({ h, k: 1 });
            cancelAnimationFrame(raf.current);
            raf.current = requestAnimationFrame(() => setTint({ h, k: 1 }, el));
          }} />
      </label>
      {!glass && <p className="muted small tint-hint">Choisir une couleur passe le site en mode Verre.</p>}
    </div>
  );
}

/**
 * Choix direct de l'apparence (Jour, Nuit, Verre, Topo, Frontale), avec une vignette d'aperçu pour chacune.
 * Groupe de boutons radio : flèches du clavier pour changer, l'apparence s'applique aussitôt.
 */
export default function AppearancePicker() {
  const [a, setA] = useState<Appearance | null>(null);
  useEffect(() => {
    setA(currentAppearance());
    const on = (e: Event) => setA((e as CustomEvent<Appearance>).detail);
    window.addEventListener(APPEARANCE_EVENT, on);
    return () => window.removeEventListener(APPEARANCE_EVENT, on);
  }, []);
  return (
    <div className="ap-pick" role="radiogroup" aria-label="Apparence du site">
      {APPEARANCES.map((x) => (
        <label key={x.id} className={`ap-tile ap-${x.id}${a === x.id ? " on" : ""}`}>
          <input type="radio" name="appearance" value={x.id} checked={a === x.id}
            onChange={(e) => setAppearance(x.id, e.currentTarget.closest("label"))} />
          <span className="ap-prev" aria-hidden="true"><i /><i /><i /></span>
          <b>{x.label}</b>
          <small>{x.hint}</small>
        </label>
      ))}
    </div>
  );
}

// ---------- Mode automatique ----------
const DAY_CHOICES: { id: DayAp; label: string }[] = [{ id: "light", label: "Jour" }, { id: "topo", label: "Topo" }];
const NIGHT_CHOICES: { id: NightAp; label: string }[] = [{ id: "dark", label: "Nuit" }, { id: "glass", label: "Verre" }, { id: "frontale", label: "Frontale" }];
const hm = (t: number) => new Date(t).toLocaleTimeString("fr-FR", { hour: "numeric", minute: "2-digit" }).replace(":", " h ");
const label = (a: Appearance) => APPEARANCES.find((x) => x.id === a)!.label;

/** Lever et coucher du jour en cours (minuit local → minuit), null aux pôles. */
function sunDay(lat: number, lon: number, now = Date.now()) {
  const mid = new Date(now); mid.setHours(0, 0, 0, 0);
  const a = nextSunChange(mid.getTime(), lat, lon);
  if (!a) return null;
  const b = nextSunChange(a.at + 60000, lat, lon);
  if (!b) return null;
  return a.rise ? { rise: a.at, set: b.at } : { rise: b.at, set: a.at };
}

/**
 * Course du soleil de la journée : un arc en pointillé du lever au coucher, le soleil à sa place actuelle
 * (sous l'horizon la nuit, avec la lune). Les heures s'affichent sous l'arc.
 */
function SunArc({ lat, lon }: { lat: number; lon: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(t); }, []);
  const d = sunDay(lat, lon, now);
  const up = sunAltitude(now, lat, lon) > -0.833;
  const W = 260, H = 92, cx = W / 2, r = 104, base = 76;
  // Position le long de l'arc : 0 au lever, 1 au coucher ; la nuit, sur l'arc inversé sous l'horizon.
  let f = 0.5;
  if (d) {
    if (up) f = (now - d.rise) / (d.set - d.rise);
    else { const span = 86400000 - (d.set - d.rise); const since = now > d.set ? now - d.set : now + 86400000 - d.set; f = since / span; }
  }
  f = Math.max(0, Math.min(1, f));
  const ang = Math.PI * (1 - f);
  const x = cx + Math.cos(ang) * r, y = base - (up ? 1 : -0.32) * Math.sin(ang) * (base - 14);
  return (
    <div className={`sun-arc${up ? " is-day" : " is-night"}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={d ? `Lever ${hm(d.rise)}, coucher ${hm(d.set)}` : "Course du soleil"}>
        <path className="sun-path" d={`M${cx - r} ${base} A ${r} ${base - 14} 0 0 1 ${cx + r} ${base}`} pathLength="1" />
        <line className="sun-horizon" x1="8" x2={W - 8} y1={base} y2={base} />
        <g className="sun-body" style={{ transform: `translate(${x}px, ${y}px)` }}>
          {up ? <><circle className="sun-glow" r="16" /><circle className="sun-core" r="7.5" /></> : <path className="sun-moon" d="M3.8 -6.4A7.4 7.4 0 1 0 6.6 3.2 5.8 5.8 0 0 1 3.8 -6.4Z" />}
        </g>
      </svg>
      {d && <div className="sun-times"><span>Lever <b className="mono">{hm(d.rise)}</b></span><span>Coucher <b className="mono">{hm(d.set)}</b></span></div>}
    </div>
  );
}

/**
 * Mode automatique : interrupteur, apparence du jour et de la nuit, et source de l'heure (le soleil à ta
 * position, ou le réglage du téléphone). La position est arrondie à environ 10 km et reste sur cet appareil.
 */
export function AutoPicker() {
  const p = useAuto();
  const [err, setErr] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => setTick((n) => n + 1), 60000); return () => window.clearInterval(t); }, []);
  if (p === undefined) return null;
  const on = !!p, geo = p?.lat != null && p?.lon != null;
  const toggle = () => {
    haptic("select");
    if (on) { setAuto(null); return; }
    const cur = currentAppearance();
    setAuto({ day: cur === "topo" ? "topo" : "light", night: cur === "glass" || cur === "frontale" ? cur : "dark" });
  };
  const update = (x: Partial<AutoPref>) => { if (p) setAuto({ ...p, ...x }); };
  const locate = () => {
    if (!p) return;
    setErr(null);
    if (!navigator.geolocation) { setErr("Ton navigateur ne donne pas la position : le mode suit le réglage du téléphone."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); update({ lat: Math.round(pos.coords.latitude * 10) / 10, lon: Math.round(pos.coords.longitude * 10) / 10 }); },
      () => { setLocating(false); setErr("Position refusée ou introuvable : le mode suit le réglage clair ou sombre du téléphone."); },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 6 * 3600000 },
    );
  };
  const next = p ? autoNext(p) : null;
  return (
    <div className={`auto-pick${on ? " is-on" : ""}`}>
      <div className="auto-head">
        <div>
          <b>Automatique</b>
          <small>{!on ? "Jour en journée, Nuit après le coucher du soleil" : geo ? "Suit le soleil là où tu es" : "Suit le réglage clair ou sombre du téléphone"}</small>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-label="Apparence automatique" className="tp-switch" onClick={toggle}><i /></button>
      </div>
      {p && (
        <div className="auto-body">
          {geo && <SunArc lat={p.lat!} lon={p.lon!} />}
          {next && <p className="auto-next small">Passage en <b>{label(next.rise ? p.day : p.night)}</b> à <b className="mono">{hm(next.at)}</b> ({next.rise ? "lever" : "coucher"} du soleil)</p>}
          <div className="auto-row">
            <span className="small">Le jour</span>
            <div className="seg sm" role="radiogroup" aria-label="Apparence le jour">
              {DAY_CHOICES.map((x) => <button key={x.id} type="button" role="radio" aria-checked={p.day === x.id} className={p.day === x.id ? "on" : ""} onClick={() => update({ day: x.id })}>{x.label}</button>)}
            </div>
          </div>
          <div className="auto-row">
            <span className="small">La nuit</span>
            <div className="seg sm" role="radiogroup" aria-label="Apparence la nuit">
              {NIGHT_CHOICES.map((x) => <button key={x.id} type="button" role="radio" aria-checked={p.night === x.id} className={p.night === x.id ? "on" : ""} onClick={() => update({ night: x.id })}>{x.label}</button>)}
            </div>
          </div>
          <div className="auto-geo">
            {geo ? (
              <>
                <span className="small muted">Position enregistrée sur cet appareil (à 10 km près).</span>
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn ghost sm" onClick={locate} disabled={locating}>{locating ? "Recherche…" : "Mettre à jour"}</button>
                  <button type="button" className="link small" onClick={() => update({ lat: undefined, lon: undefined })}>Oublier ma position</button>
                </div>
              </>
            ) : (
              <>
                <span className="small muted">Pour suivre le vrai coucher du soleil, utilise ta position (arrondie à 10 km, gardée sur cet appareil).</span>
                <button type="button" className="btn ghost sm" onClick={locate} disabled={locating}>{locating ? "Recherche…" : "Utiliser ma position"}</button>
              </>
            )}
          </div>
          {err && <p className="note small" role="alert" style={{ margin: 0 }}>{err}</p>}
          <small className="muted">Choisir une apparence à la main coupe le mode automatique.</small>
        </div>
      )}
    </div>
  );
}

/** Vibrations au toucher (appui long, glissement, actualisation, check-in). Réglage gardé sur cet appareil. */
export function HapticsPicker() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => setOn(hapticsOn()), []);
  if (on == null) return null;
  return (
    <div className="auto-pick haptic-pick">
      <div className="auto-head">
        <div><b>Vibrations</b><small>Un petit retour au toucher : appui long, glissement d’onglet, actualisation, check-in validé.</small></div>
        <button type="button" role="switch" aria-checked={on} aria-label="Vibrations" className="tp-switch"
          onClick={() => { const v = !on; setHaptics(v); setOn(v); if (v) haptic("success"); }}><i /></button>
      </div>
    </div>
  );
}

const GRASS_OPTS: { id: GrassMode; label: string; hint: string }[] = [
  { id: "vivant", label: "Vivant", hint: "Le vent souffle en continu, les herbes s’écartent sous la souris ou le doigt." },
  { id: "calme", label: "Calme", hint: "Moins d’herbes, vent léger, moins d’images par seconde : plus doux pour la batterie." },
  { id: "fixe", label: "Fixe", hint: "Une image immobile, aucune animation." },
];

/** Phrase qui dit ce que le fond suit en ce moment (lieu et conditions). */
function envLine(e: GrassEnv | null): string | null {
  if (!e) return null;
  if (e.status === "noplace") return "Choisis ton lieu d’entraînement (plus haut) : le fond suivra la météo de chez toi, vent, pluie, neige et lumière du jour.";
  if (e.status !== "ok" || !e.now || !e.place) return null;
  const n = e.now, where = e.raceDay ? "au départ de ta course" : `à ${e.place.name.split(",")[0]}`;
  const gust = n.gust >= n.wind + 12 ? `, rafales à ${n.gust}` : "";
  return `Il suit la météo ${where} : ${n.label.toLowerCase()}, vent ${n.wind} km/h ${windFrom(n.dir)}${gust}, ${n.temp} °C.`;
}

/** Fond animé (champ d'herbes) : vivant, calme ou fixe, et ce qu'il suit dehors. */
export function GrassPicker() {
  const [m, setM] = useState<GrassMode | null>(null);
  const [env, setEnv] = useState<GrassEnv | null>(null);
  useEffect(() => {
    setM(grassMode());
    fetch("/api/weather/now", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).then(setEnv).catch(() => setEnv(null));
  }, []);
  if (!m) return null;
  const line = envLine(env);
  return (
    <div className="auto-pick grass-pick">
      <div className="auto-head"><div><b>Fond animé</b><small>Le champ d’herbes derrière les pages.</small></div></div>
      <div className="seg grass-seg" role="radiogroup" aria-label="Fond animé">
        {GRASS_OPTS.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={m === o.id} className={m === o.id ? "on" : ""}
            onClick={() => { setGrassMode(o.id); setM(o.id); haptic("tap"); }}>{o.label}</button>
        ))}
      </div>
      <p className="small soft" style={{ margin: 0 }}>{GRASS_OPTS.find((o) => o.id === m)!.hint}</p>
      {line && <p className="small soft grass-env" style={{ margin: 0 }}>{line}</p>}
    </div>
  );
}
