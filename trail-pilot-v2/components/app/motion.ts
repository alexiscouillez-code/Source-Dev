"use client";

/**
 * Fait défiler les chiffres jusqu’à leur valeur (KPI, J-xx, pourcentages…) dès qu’ils apparaissent.
 * Ne touche qu’aux nœuds texte composés d’un seul nombre, et s’arrête si React change la valeur
 * entre-temps. Rien ne bouge si l’utilisateur a demandé de réduire les animations.
 */
const SELECTOR = ".kpi b, .zbig, .race-time b, .side-goal b, .specs b, .vo2-big, .num-up";
const NUM = /^([^\d+\-−]*[+\-−]?)(\d[\d\u202f\u00a0 ]*(?:,\d+)?)(\D{0,8})$/;

export function startCountUps(root: HTMLElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const seen = new WeakSet<Text>();
  let raf = 0;

  const animate = (node: Text) => {
    const m = NUM.exec(node.nodeValue ?? "");
    if (!m) return;
    const [, pre, raw, post] = m;
    const target = Number(raw.replace(/[\s\u202f\u00a0]/g, "").replace(",", "."));
    if (!Number.isFinite(target) || target === 0) return;
    const decimals = raw.includes(",") ? raw.split(",")[1].length : 0;
    const grouped = /[\s\u202f\u00a0]/.test(raw);
    const fmt = (v: number) => {
      const s = v.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
      return `${pre}${s}${post}`;
    };
    const final = node.nodeValue;
    const t0 = performance.now(), dur = Math.min(1400, 700 + Math.log10(target + 1) * 220);
    let last = fmt(0);
    node.nodeValue = last;
    const step = (t: number) => {
      if (node.nodeValue !== last) return; // React a mis la valeur à jour : on s’efface
      const k = Math.max(0, Math.min(1, (t - t0) / dur)); // l’horodatage du rafraîchissement peut précéder t0
      last = k >= 1 ? final! : fmt(target * (1 - Math.pow(1 - k, 3)));
      node.nodeValue = last;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const scan = () => {
    raf = 0;
    root.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        if (seen.has(n)) continue;
        seen.add(n);
        animate(n);
      }
    });
  };
  const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(scan); });
  mo.observe(root, { subtree: true, childList: true });
  scan();
  return () => { mo.disconnect(); cancelAnimationFrame(raf); };
}

/** Vrai si l’appareil accepte les animations. */
export const motionOk = () => typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type VTDoc = Document & { startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void>; ready?: Promise<void>; updateCallbackDone?: Promise<void> } };
/**
 * Applique un changement d’affichage dans une transition de vue (morphing natif du navigateur) quand c’est possible.
 * `update` doit modifier le DOM de façon synchrone (flushSync) : la capture « après » est prise à sa fin.
 */
export function withTransition(update: () => void, kind?: string) {
  const d = document as VTDoc;
  if (!d.startViewTransition || !motionOk()) { update(); return; }
  if (kind) document.documentElement.dataset.vt = kind;
  const t = d.startViewTransition(update);
  // Une transition interrompue (nouvel état pendant l’animation) n’est pas une erreur : on l’ignore.
  t.ready?.catch(() => {});
  t.updateCallbackDone?.catch(() => {});
  t.finished.catch(() => {}).finally(() => { if (document.documentElement.dataset.vt === kind) delete document.documentElement.dataset.vt; });
}

/** Petite vibration de retour (téléphones compatibles). */
export const buzz = (ms: number | number[] = 12) => { try { if (motionOk()) navigator.vibrate?.(ms); } catch { /* non pris en charge */ } };
