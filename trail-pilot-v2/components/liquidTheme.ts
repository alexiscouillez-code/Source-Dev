"use client";

/**
 * Changement de thème « liquid pour ».
 *
 * Principe
 *  - On ouvre une transition de vue : le navigateur garde une image de la page dans l’ancien thème
 *    et affiche en direct la page dans le nouveau. Les deux thèmes sont donc à l’écran en même temps.
 *  - L’image du thème sombre est découpée par un `clip-path: polygon(...)` recalculé à chaque image :
 *    le polygone = le filet qui sort du bouton + le volume sous une surface ondulée (chaîne de ressorts).
 *  - Tout dépend d’une seule valeur `p` (0 = clair, 1 = sombre). Clair → sombre : on verse (p monte).
 *    Sombre → clair : on vide (p descend, le filet remonte dans le bouton). Re-cliquer en cours de route
 *    inverse simplement le sens, depuis l’endroit exact où en est le liquide.
 *  - Sans transitions de vue, ou si l’appareil demande de réduire les animations : bascule immédiate.
 */

export type Theme = "light" | "dark";
export const THEME_EVENT = "tp-theme";

const KEY = "trail-pilot-theme";
const INK = "#0b0f14";       // fond du thème sombre (gouttes)
const DURATION = 1700;       // versement complet, en ms (assez long pour se lire, assez court pour ne pas attendre)
const IMPACT = 0.16;         // part de l’animation consacrée à la chute du filet
const N = 72;                // points de la surface
const STREAM = 7;            // largeur du filet, en px
const SEGS = 12;             // segments du filet

type Transition = { ready: Promise<void>; finished: Promise<void>; skipTransition: () => void };
type VTDocument = Document & { startViewTransition?: (cb: () => void) => Transition };
interface Drop { el: HTMLElement; x: number; y: number; vx: number; vy: number; r: number }
interface Run {
  p: number; dir: 1 | -1; mode: "pour" | "drain"; toggle: HTMLElement; transition: Transition;
  fx: HTMLElement; glow: SVGPathElement; edge: SVGPathElement; streamEdge: SVGPathElement;
  sheet: HTMLStyleElement; rule: CSSStyleRule | null;
  h: Float32Array; v: Float32Array; ys: Float32Array; drops: Drop[];
  raf: number; last: number; time: number; prevLevel: number | null; ox: number; oy: number;
}
let run: Run | null = null;

const html = () => document.documentElement;
const shown = (): Theme => (html().dataset.theme === "light" ? "light" : "dark");
/** Thème visé : celui vers lequel on va pendant l’animation, sinon celui affiché. */
export const targetTheme = (): Theme => (run ? (run.dir > 0 ? "dark" : "light") : shown());

function announce(t: Theme) {
  try { localStorage.setItem(KEY, t); } catch { /* navigation privée : le choix vaut pour la session */ }
  window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: t }));
}

/** Bascule le thème depuis le bouton cliqué (le filet en sort). */
export function switchTheme(toggle: HTMLElement) {
  const next: Theme = targetTheme() === "dark" ? "light" : "dark";
  if (run) { run.dir = next === "dark" ? 1 : -1; announce(next); return; }      // en cours : on inverse le sens
  const doc = document as VTDocument;
  if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    html().dataset.theme = next; announce(next); return;
  }

  const mode = next === "dark" ? "pour" : "drain";
  // Calque des reflets et des gouttes
  const NS = "http://www.w3.org/2000/svg";
  const fx = document.createElement("div");
  fx.className = "lq-fx lq-live"; fx.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS(NS, "svg");
  const path = (cls: string) => { const el = document.createElementNS(NS, "path"); el.setAttribute("class", cls); svg.appendChild(el); return el; };
  const glow = path("lq-glow"), edge = path("lq-edge"), streamEdge = path("lq-stream-edge");
  fx.appendChild(svg); document.body.appendChild(fx);
  // Règle CSS réécrite à chaque image : la découpe de l’image sombre (la nouvelle en versant, l’ancienne en vidant)
  const sheet = document.createElement("style");
  sheet.textContent = `html[data-lq]::view-transition-${mode === "pour" ? "new" : "old"}(root) { clip-path: ${mode === "pour" ? "polygon(0 0, 0 0, 0 0)" : "none"}; }`;
  document.head.appendChild(sheet);

  toggle.classList.add("lq-live"); toggle.style.viewTransitionName = "lq-toggle";   // le bouton reste affiché en direct
  html().dataset.lq = mode;
  const transition = doc.startViewTransition(() => { html().dataset.theme = next; });
  const r: Run = {
    p: mode === "pour" ? 0 : 1, dir: mode === "pour" ? 1 : -1, mode, toggle, transition, fx, glow, edge, streamEdge, sheet,
    rule: (sheet.sheet?.cssRules[0] as CSSStyleRule | undefined) ?? null,
    h: new Float32Array(N), v: new Float32Array(N), ys: new Float32Array(N), drops: [],
    raf: 0, last: 0, time: 0, prevLevel: null, ox: 0, oy: 0,
  };
  run = r;
  announce(next);                                                                   // le bouton glisse tout de suite
  transition.ready.then(() => {
    // Décalage éventuel entre la fenêtre et l’image capturée (barre d’adresse sur mobile)
    try {
      const m = new DOMMatrixReadOnly(getComputedStyle(html(), "::view-transition-group(lq-fx)").transform);
      r.ox = m.m41 || 0; r.oy = m.m42 || 0;
    } catch { /* pas de décalage connu */ }
    r.raf = requestAnimationFrame((now) => tick(r, now));
  }).catch(() => { /* transition refusée : le nettoyage ci-dessous applique le thème */ });
  transition.finished.catch(() => {}).finally(() => cleanup(r));
}

function cleanup(r: Run) {
  cancelAnimationFrame(r.raf);
  const t: Theme = r.dir > 0 ? "dark" : "light";
  if (shown() !== t) html().dataset.theme = t;
  r.fx.remove(); r.sheet.remove();
  r.toggle.classList.remove("lq-live"); r.toggle.style.viewTransitionName = "";
  delete html().dataset.lq;
  if (run === r) run = null;
}

/** Hauteur de la surface à l’abscisse x. */
function at(r: Run, x: number, W: number) {
  const f = Math.max(0, Math.min(N - 1.001, (x / W) * (N - 1)));
  const i = Math.floor(f);
  return r.ys[i] + (r.ys[i + 1] - r.ys[i]) * (f - i);
}

function drop(r: Run, x: number, y: number, vx: number, vy: number, rad: number) {
  const el = document.createElement("i");
  el.className = "lq-drop";
  el.style.width = el.style.height = `${rad * 2}px`;
  el.style.background = `radial-gradient(circle at 35% 30%, rgba(255,255,255,.6) 0 10%, ${INK} 34%)`;
  r.fx.appendChild(el);
  r.drops.push({ el, x, y, vx, vy, r: rad });
}

function tick(r: Run, now: number) {
  const dt = r.last ? Math.min(0.034, (now - r.last) / 1000) : 1 / 60;
  r.last = now; r.time += dt;
  const prev = r.p;
  r.p = Math.max(0, Math.min(1, r.p + (r.dir * dt * 1000) / DURATION));
  // Fin de course : le thème final est posé et la transition refermée dans la même image.
  if ((r.dir > 0 && r.p >= 1) || (r.dir < 0 && r.p <= 0)) {
    const t: Theme = r.dir > 0 ? "dark" : "light";
    if (shown() !== t) html().dataset.theme = t;
    r.transition.skipTransition();
    return;
  }

  const W = window.innerWidth, H = window.innerHeight;
  const tr = r.toggle.getBoundingClientRect();
  const xs = tr.left + tr.width / 2, yTop = tr.bottom - 3;            // le filet sort du milieu du bouton
  const floor = H + 40;                                               // niveau « vide » : juste sous l’écran

  // Niveau moyen du liquide
  const u = Math.max(0, (r.p - IMPACT) / (1 - IMPACT));
  const level = floor + (-60 - floor) * (u * u * (3 - 2 * u));
  const speed = r.prevLevel == null ? 0 : Math.abs(level - r.prevLevel) / dt;
  r.prevLevel = level;
  const wet = Math.min(1, u * 12);
  const pouring = r.p > IMPACT && yTop < level;                       // le filet touche la surface
  const k = Math.round((xs / W) * (N - 1));

  // Impact : éclaboussure et gouttes au moment où le filet touche le fond
  if (r.dir > 0 && prev <= IMPACT && r.p > IMPACT) {
    for (let i = -3; i <= 3; i++) if (k + i >= 0 && k + i < N) r.v[k + i] -= 16 - Math.abs(i) * 3.5;
    for (let i = 0; i < 11; i++) drop(r, xs + (Math.random() - 0.5) * 18, H - 6, (Math.random() - 0.5) * 560, -(280 + Math.random() * 420), 3 + Math.random() * 6);
  }
  if (pouring && r.dir > 0 && Math.random() < dt * 9) {
    drop(r, xs + (Math.random() - 0.5) * 10, at(r, xs, W), (Math.random() - 0.5) * 240, -(120 + Math.random() * 200), 1.5 + Math.random() * 3);
  }

  // Surface : ressorts (rappel vers le niveau, amortissement, propagation aux voisins)
  const steps = Math.max(1, Math.round(dt * 60));
  for (let s = 0; s < steps; s++) {
    if (pouring && k >= 0 && k < N) r.v[k] += r.dir > 0 ? 1.1 + Math.random() * 1.2 : -(0.8 + Math.random());   // le filet creuse, ou aspire
    for (let i = 0; i < N; i++) { r.v[i] += -0.022 * r.h[i] - 0.045 * r.v[i] + (Math.random() - 0.5) * 0.0006 * speed; r.h[i] += r.v[i]; }
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) {
      if (i > 0) r.v[i - 1] += 0.16 * (r.h[i] - r.h[i - 1]);
      if (i < N - 1) r.v[i + 1] += 0.16 * (r.h[i] - r.h[i + 1]);
    }
  }
  // Houle : deux sinus croisés, plus amples quand le niveau bouge vite
  const amp = wet * (4 + 10 * Math.min(1, speed / 600));
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * W;
    r.ys[i] = level + r.h[i] + amp * Math.sin(x * 0.011 + r.time * 2.4) + amp * 0.5 * Math.sin(x * 0.027 - r.time * 3.3);
  }

  // Filet : la tête tombe en accélérant, puis reste collée à la surface
  const sY = at(r, xs, W);
  const fall = Math.min(1, r.p / IMPACT);
  const joined = r.p > IMPACT;
  const head = joined ? sY : Math.min(sY, yTop + (floor - yTop) * fall * fall);
  const hasStream = head > yTop + 1;
  const thick = (STREAM / 2) * Math.min(1, r.p / 0.025);
  const half = (y: number) => thick * (1 + 0.2 * Math.sin(y * 0.045 - r.time * 9)) + (joined ? 10 * Math.exp(-(sY - y) / 13) : 2.5 * Math.exp(-(head - y) / 9));

  // Polygone : bas de l’écran, surface de gauche à droite, filet inséré à sa position
  let clip = `${r.ox}px ${H + 120 + r.oy}px`;
  const add = (x: number, y: number) => { clip += `,${(x + r.ox).toFixed(1)}px ${(y + r.oy).toFixed(1)}px`; };
  let sd = "";
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * W, nx = ((i + 1) / (N - 1)) * W;
    add(x, r.ys[i]);
    if (hasStream && i < N - 1 && xs >= x && xs < nx) {
      const tip = joined ? sY : head + thick * 1.8;
      add(xs, sY); add(xs, tip);                                      // aller-retour sans épaisseur jusqu’à la tête
      for (let j = SEGS; j >= 0; j--) { const y = yTop + ((head - yTop) * j) / SEGS; add(xs - half(y), y); }
      for (let j = 0; j <= SEGS; j++) { const y = yTop + ((head - yTop) * j) / SEGS; add(xs + half(y), y); sd += `${j ? " L" : "M"}${(xs - half(y) + 1).toFixed(1)} ${y.toFixed(1)}`; }
      add(xs, tip); add(xs, sY);
    }
  }
  clip += `,${W + r.ox}px ${H + 120 + r.oy}px`;
  r.rule?.style.setProperty("clip-path", `polygon(${clip})`);

  // Reflets : courbe lissée sur la surface, trait sur le bord du filet
  let d = `M-20 ${r.ys[0].toFixed(1)}`;
  for (let i = 0; i < N - 1; i++) {
    const x = (i / (N - 1)) * W, nx = ((i + 1) / (N - 1)) * W;
    d += ` Q${x.toFixed(1)} ${r.ys[i].toFixed(1)} ${((x + nx) / 2).toFixed(1)} ${((r.ys[i] + r.ys[i + 1]) / 2).toFixed(1)}`;
  }
  d += ` L${W + 20} ${r.ys[N - 1].toFixed(1)}`;
  r.glow.setAttribute("d", d); r.edge.setAttribute("d", d); r.streamEdge.setAttribute("d", sd);

  // Gouttes : balistique simple, elles disparaissent en retombant dans le liquide
  for (let i = r.drops.length - 1; i >= 0; i--) {
    const o = r.drops[i];
    o.vy += 1700 * dt; o.x += o.vx * dt; o.y += o.vy * dt;
    if (o.y > H + 30 || (o.vy > 0 && o.y > at(r, o.x, W) + o.r)) { o.el.remove(); r.drops.splice(i, 1); continue; }
    o.el.style.transform = `translate(${(o.x - o.r).toFixed(1)}px,${(o.y - o.r).toFixed(1)}px) scaleY(${(1 + Math.min(0.5, Math.abs(o.vy) / 1600)).toFixed(2)})`;
  }
  r.raf = requestAnimationFrame((t) => tick(r, t));
}
