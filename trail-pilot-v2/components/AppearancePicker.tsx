"use client";

import { useEffect, useRef, useState } from "react";
import { APPEARANCE_EVENT, APPEARANCES, currentAppearance, currentTint, setAppearance, setTint, TINT_EVENT, type Appearance } from "./appearance";
import { glassPalette, TINTS, type GlassTint } from "./glassPalette";

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
 * Choix direct de l'apparence (Jour, Nuit, Verre), avec une vignette d'aperçu pour chacune.
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
