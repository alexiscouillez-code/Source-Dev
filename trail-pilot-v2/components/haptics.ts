"use client";

/**
 * Retours haptiques (vibrations courtes) au toucher.
 *  - Android et navigateurs qui le permettent : l'API de vibration, avec un motif par type de retour.
 *  - iPhone (Safari ne permet pas de vibrer) : depuis iOS 18, basculer un interrupteur natif donne un « tic » ;
 *    on bascule un interrupteur invisible, le temps d'un clic. Un seul tic (deux pour une réussite).
 * Coupables dans Compte (réglage gardé sur cet appareil). Sans effet ailleurs.
 */
export type Haptic = "tap" | "select" | "success" | "warn" | "error";
const PATTERN: Record<Haptic, number | number[]> = { tap: 8, select: 12, success: [14, 70, 24], warn: [24, 60, 24], error: [36, 50, 36, 50, 60] };
const KEY = "tp-haptics";

export const hapticsOn = () => { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } };
export function setHaptics(on: boolean) { try { if (on) localStorage.removeItem(KEY); else localStorage.setItem(KEY, "off"); } catch { /* navigation privée */ } }

const isIOS = () => typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

function iosTick() {
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
  const input = document.createElement("input");
  input.type = "checkbox"; input.tabIndex = -1;
  input.setAttribute("switch", "");
  label.appendChild(input);
  document.head.appendChild(label);
  try { label.click(); } finally { label.remove(); }
}

/** Petit retour haptique. Un nombre ou une liste : motif en millisecondes (vibration seulement). */
export function haptic(kind: Haptic | number | number[] = "tap") {
  if (typeof window === "undefined" || !hapticsOn()) return;
  const p = typeof kind === "string" ? PATTERN[kind] : kind;
  try {
    if (typeof navigator.vibrate === "function") { navigator.vibrate(p); return; }
    if (isIOS()) {
      iosTick();
      if (kind === "success" || kind === "warn" || kind === "error") window.setTimeout(iosTick, 110);
    }
  } catch { /* non pris en charge */ }
}
