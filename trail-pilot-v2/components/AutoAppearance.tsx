"use client";

import { useEffect } from "react";
import { autoTarget, currentAppearance, getAuto, setAppearance } from "./appearance";

/**
 * Mode automatique en direct : vérifie chaque minute (et au retour sur l'appli, et quand le téléphone change de
 * clair à sombre) si le soleil s'est couché ou levé, et bascule l'apparence avec l'effet d'horizon.
 * Au chargement, le script du layout a déjà posé la bonne apparence : rien ne bouge.
 */
export default function AutoAppearance() {
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const p = getAuto();
      if (!p) return;
      const t = autoTarget(p);
      if (t !== currentAppearance()) setAppearance(t, null, { auto: true });
    };
    const timer = window.setInterval(check, 60000);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", check);
    document.addEventListener("visibilitychange", check);
    return () => { window.clearInterval(timer); mq.removeEventListener("change", check); document.removeEventListener("visibilitychange", check); };
  }, []);
  return null;
}
