"use client";

import { useEffect, useState } from "react";
import { APPEARANCE_EVENT, APPEARANCES, currentAppearance, setAppearance, type Appearance } from "./appearance";

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
