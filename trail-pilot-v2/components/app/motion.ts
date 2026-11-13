"use client";

/**
 * Fait défiler les chiffres jusqu’à leur valeur (KPI, J-xx, pourcentages…) dès qu’ils apparaissent.
 * Ne touche qu’aux nœuds texte composés d’un seul nombre, et s’arrête si React change la valeur
 * entre-temps. Rien ne bouge si l’utilisateur a demandé de réduire les animations.
 */
const SELECTOR = ".kpi b, .zbig, .race-time b, .side-goal b, .specs b, .vo2-big, .num-up, .ready-now b, .records b, .db-top b, .gap-v b, .form-facts b, .cal-sum b, .shoe .mono, .gc-big, .rg-line .mono";
/** Durées « 4 h 08 » ou « 45 min » : elles défilent en minutes. */
const DUR = /^(\d{1,3}) h (\d{2})$|^(\d{1,3}) min$/;
const NUM = /^([^\d+\-−]*[+\-−]?)(\d[\d\u202f\u00a0 ]*(?:,\d+)?)(\D{0,8})$/;

export function startCountUps(root: HTMLElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const seen = new WeakSet<Text>();
  let raf = 0;

  const run = (node: Text, target: number, fmt: (v: number) => string, dur: number) => {
    const final = node.nodeValue;
    const t0 = performance.now();
    let last = fmt(0);
    node.nodeValue = last;
    const step = (t: number) => {
      if (node.nodeValue !== last) return; // React a mis la valeur à jour : on s’efface
      const k = Math.max(0, Math.min(1, (t - t0) / dur));
      last = k >= 1 ? final! : fmt(target * (1 - Math.pow(1 - k, 3)));
      node.nodeValue = last;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const animate = (node: Text) => {
    const d = DUR.exec((node.nodeValue ?? "").trim());
    if (d && node.nodeValue === node.nodeValue?.trim()) {
      const hm = d[1] != null, total = hm ? Number(d[1]) * 60 + Number(d[2]) : Number(d[3]);
      if (total > 0) run(node, total, (v) => { const r = Math.round(v); return hm ? `${Math.floor(r / 60)} h ${String(r % 60).padStart(2, "0")}` : `${r} min`; }, 1100);
      return;
    }
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

/**
 * Révèle graphiques et blocs de données quand ils arrivent à l’écran : la classe « is-in » lance leur animation
 * (courbes qui se tracent, barres qui poussent, points qui s’allument). Elle est retirée quand le bloc est
 * entièrement sorti de l’écran, pour que l’animation rejoue au retour. Sans JavaScript ou avec « réduire les
 * animations », rien n’est masqué : la classe « mo » sur <html> conditionne tous les états de départ.
 */
const REVEAL = "svg.chart, .radar, .month-bars, .week-bars, .gaps, .zbar, .ready-plot, .shoe-list";
export function startReveals(root: HTMLElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return () => {};
  document.documentElement.classList.add("mo");
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && (e.intersectionRatio >= 0.2 || e.intersectionRect.height >= window.innerHeight * 0.4)) e.target.classList.add("is-in");
      else if (!e.isIntersecting) e.target.classList.remove("is-in");
    }
  }, { threshold: [0, 0.2] });
  const seen = new WeakSet<Element>();
  let raf = 0;
  const scan = () => { raf = 0; root.querySelectorAll(REVEAL).forEach((el) => { if (!seen.has(el)) { seen.add(el); io.observe(el); } }); };
  const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(scan); });
  mo.observe(root, { subtree: true, childList: true });
  scan();
  return () => { mo.disconnect(); io.disconnect(); cancelAnimationFrame(raf); document.documentElement.classList.remove("mo"); };
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
