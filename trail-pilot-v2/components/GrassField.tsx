"use client";

import { useEffect, useRef } from "react";
import { sunPosition } from "@/lib/engine/sun";
import { GRASS_EVENT, GRASS_KEY, grassMode, type GrassEnv, type GrassMode } from "./grassMode";

/**
 * Fond vivant : un champ d'herbes hautes en 3D (WebGL2 direct, sans bibliothèque), fixe derrière le contenu.
 *
 * - Des dizaines de milliers de brins dessinés en une fois (instanciation) : hauteur, largeur, orientation, courbure
 *   et teinte propres à chaque brin, plaques plus sèches ou plus vertes, quelques tiges plus hautes.
 * - Vent continu : rafales qui traversent le champ (bruit qui se déplace), frémissement propre à chaque brin,
 *   direction qui tourne lentement ; le défilement de la page ajoute une bourrasque.
 * - La souris (ou le doigt) écarte les brins sous elle ; ils se redressent doucement une fois passée.
 * - Lumière selon l'apparence : nuit au clair de lune, jour en contre-jour doré, verre au crépuscule, topo pâle,
 *   frontale éclairée par le faisceau qui suit le pointeur. Le champ s'efface vers l'horizon.
 * - Économe : pause quand l'onglet est caché, densité adaptée à l'écran et réduite si l'appareil peine ;
 *   une image fixe si l'appareil demande moins de mouvement (et pendant les tests automatiques).
 * - Réglable (Compte › Apparence) : vivant, calme (moins de brins, vent léger, 30 images/s) ou fixe.
 * - Branché sur le dehors : vent réel (force, direction, rafales) au lieu d'entraînement, ou au départ le jour
 *   de la course ; lumière selon la position du soleil (modes clairs) ; nuages, brouillard, pluie, neige, givre,
 *   éclairs d'orage ; herbe plus verte au printemps, plus sèche l'été.
 */
export default function GrassField() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let stop: () => void = () => {};
    let gone = false;
    // Après le chargement de la page, un court délai puis un moment de calme : l'affichage, la mise en route de la page
    // et les premiers gestes passent avant la préparation du champ (la plus lourde sur un téléphone modeste).
    const go = () => { if (!gone) { try { stop = mountGrass(el); } catch { /* pas de WebGL2 : pas de champ */ } } };
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
    const idle = () => (w.requestIdleCallback ? w.requestIdleCallback(go, { timeout: 2500 }) : window.setTimeout(go, 300));
    const later = () => { window.setTimeout(idle, navigator.webdriver ? 0 : 1200); };
    if (document.readyState === "complete") later(); else window.addEventListener("load", later, { once: true });
    return () => { gone = true; window.removeEventListener("load", later); stop(); };
  }, []);
  return <div ref={host} className="grass" aria-hidden="true" />;
}

type V3 = [number, number, number];
interface Pal { root: V3; mid: V3; tip: V3; dry: V3; ground: V3; amb: V3; sun: V3; dir: V3; trans: number; haze: V3; opacity: number; lamp: number; day: number }

const hex = (h: string): V3 => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const PAL: Record<string, Pal> = {
  // Nuit : clair de lune derrière le champ, brins sombres et liserés froids (le texte clair reste lisible).
  nuit: { root: hex("#020404"), mid: hex("#0a1210"), tip: hex("#1b2824"), dry: hex("#25251c"), ground: hex("#040706"), amb: [.5, .58, .72], sun: [.42, .52, .68], dir: [-.3, .42, -.86], trans: .9, haze: hex("#0b0f14"), opacity: 1, lamp: 0, day: 0 },
  // Jour : contre-jour doré, pointes qui s'illuminent, paille et vert tendre, voilé par la couleur de la page.
  jour: { root: hex("#56533a"), mid: hex("#8a8a58"), tip: hex("#d4c88f"), dry: hex("#ddcb93"), ground: hex("#a5a077"), amb: [.78, .77, .72], sun: [1, .87, .64], dir: [.25, .5, -.83], trans: 1, haze: hex("#f4f1ec"), opacity: .55, lamp: 0, day: 1 },
  // Verre : crépuscule violet, silhouettes et reflets roses.
  verre: { root: hex("#060514"), mid: hex("#121031"), tip: hex("#2a2656"), dry: hex("#372f55"), ground: hex("#09081b"), amb: [.55, .5, .85], sun: [.95, .58, .82], dir: [.35, .38, -.86], trans: 1.1, haze: hex("#1a1640"), opacity: .92, lamp: 0, day: 0 },
  // Topo : herbes pâles comme une gravure sur le papier.
  topo: { root: hex("#9a8e6d"), mid: hex("#b7ab84"), tip: hex("#dcd1ab"), dry: hex("#e5d5aa"), ground: hex("#c8bb94"), amb: [.95, .93, .88], sun: [1, .95, .85], dir: [.2, .6, -.77], trans: .6, haze: hex("#efe6d2"), opacity: .45, lamp: 0, day: 1 },
  // Frontale : nuit noire, seul le faisceau (qui suit le pointeur) éclaire l'herbe.
  frontale: { root: hex("#000000"), mid: hex("#030101"), tip: hex("#0a0404"), dry: hex("#080403"), ground: hex("#000000"), amb: [.1, .05, .04], sun: [.12, .04, .03], dir: [0, .6, -.8], trans: .4, haze: hex("#000000"), opacity: 1, lamp: 1, day: 0 },
};
const palKey = () => {
  const h = document.documentElement;
  if (h.dataset.ap === "frontale") return "frontale";
  if (h.dataset.ap === "topo") return "topo";
  if (h.dataset.theme === "glass") return "verre";
  return h.dataset.theme === "light" ? "jour" : "nuit";
};

/** Hasard reproductible : le même champ à chaque visite. */
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const h2 = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

const NOISE = /* glsl */ `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y); }
`;

const BLADE_VS = /* glsl */ `
attribute float aT;
attribute float aSide;
attribute vec4 iA; // x, z, hauteur, largeur
attribute vec4 iB; // orientation, courbure, teinte, phase
uniform float uTime;
uniform vec2 uWind;
uniform float uWindStr;
uniform float uGustAmp;
uniform vec4 uTouch[16]; // x, z, force, rayon
varying float vT; varying float vVar; varying float vSide; varying float vDist; varying float vPatch;
varying vec3 vWorld; varying vec3 vNormal;
${NOISE}
void main() {
  float t = aT, h = iA.z, yaw = iB.x;
  vec2 root = iA.xy;
  float width = iA.w * (1. - pow(t, 1.25)) * (0.85 + 0.35 * sin(t * 3.1416));
  // Vent : rafales qui avancent dans le champ, frémissement propre à chaque brin.
  vec2 wp = root * 0.22 - uWind * uTime * 0.9;
  float gust = noise(wp); gust = gust * gust * 1.7 * uGustAmp + noise(wp * 2.3 + 7.) * 0.35;
  float flutter = sin(uTime * (3.1 + iB.w * 0.9) + iB.w * 6.283 + root.x * 1.7) * 0.06 + sin(uTime * 7.3 + iB.w * 12.) * 0.018;
  vec2 bend = uWind * (0.1 + gust * uWindStr) + vec2(flutter, flutter * 0.6);
  // Main ou souris : les brins s'écartent autour du point touché.
  for (int i = 0; i < 16; i++) {
    vec4 m = uTouch[i];
    vec2 d = root - m.xy;
    float dl = length(d);
    float f = m.z * (1. - smoothstep(0., m.w, dl));
    bend += d / (dl + 0.06) * f * 1.5;
  }
  vec2 face = vec2(sin(yaw), cos(yaw));
  bend += face * iB.y;
  float bl = length(bend);
  vec2 bdir = bl > 1e-4 ? bend / bl : vec2(0.);
  float ang = min(bl, 1.45) * t * 1.1;
  vec2 across = vec2(cos(yaw), -sin(yaw));
  vec3 pos = vec3(root.x + across.x * aSide * width * 0.5 + bdir.x * h * t * sin(ang) * 0.92,
                  h * t * cos(ang * 0.9),
                  root.y + across.y * aSide * width * 0.5 + bdir.y * h * t * sin(ang) * 0.92);
  vec3 n = normalize(vec3(face.x, 0.25 + t * 0.5, face.y));
  vNormal = normalize(n + vec3(across.x, 0., across.y) * aSide * 0.45);
  vec4 world = modelMatrix * vec4(pos, 1.);
  vWorld = world.xyz;
  vT = t; vVar = iB.z; vSide = aSide; vPatch = noise(root * 0.12);
  vec4 mv = viewMatrix * world;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const LIGHT = /* glsl */ `
uniform vec3 uRoot, uMid, uTip, uDry, uGround, uAmb, uSunCol, uSunDir, uHaze, uCam;
uniform float uTrans, uFadeNear, uFadeFar, uOpacity, uLampOn, uHazeMix, uFlash, uWet, uFrost, uSnow, uSeason;
uniform vec2 uLamp, uRes;
vec3 lamp(vec3 col, float back) {
  if (uLampOn <= 0.) return vec3(0.);
  vec2 sp = gl_FragCoord.xy / uRes;
  vec2 d = (sp - uLamp) * vec2(uRes.x / uRes.y, 1.);
  float L = exp(-dot(d, d) * 9.) * uLampOn * .5;
  return (col * 9. + vec3(.05, .012, .008)) * L * vec3(1., .42, .3) + vec3(.9, .25, .16) * L * back * .45;
}
vec4 finish(vec3 lit, float dist) {
  lit = mix(lit, uHaze, smoothstep(uFadeNear * 0.35, uFadeFar, dist) * uHazeMix);
  float a = (1. - smoothstep(uFadeNear, uFadeFar, dist)) * uOpacity;
  return vec4(clamp(lit, 0., 1.) * a, a);
}`;

const BLADE_FS = /* glsl */ `
varying float vT; varying float vVar; varying float vSide; varying float vDist; varying float vPatch;
varying vec3 vWorld; varying vec3 vNormal;
${LIGHT}
void main() {
  vec3 col = mix(uRoot, uMid, smoothstep(0., .55, vT));
  col = mix(col, uTip, smoothstep(.45, 1., vT));
  // Saison : plus vert au printemps, plus sec l'été ; givre et neige sur les pointes ; herbe mouillée plus sombre.
  float dry = clamp(vVar * .7 + vPatch * .6 - .35 + uSeason, 0., 1.);
  col = mix(col, uDry * mix(.75, 1.05, vT), dry * .65);
  col = mix(col, vec3(.84, .9, .97), uFrost * smoothstep(.5, 1., vT) * (.55 + .45 * vVar));
  col = mix(col, vec3(.95, .97, 1.), uSnow * smoothstep(.6, 1., vT) * (.5 + .5 * vPatch));
  col *= 1. - .22 * uWet;
  vec3 V = normalize(uCam - vWorld);
  vec3 N = normalize(vNormal);
  if (dot(N, V) < 0.) N = -N;
  float diff = max(dot(N, uSunDir), 0.);
  float back = pow(max(dot(V, -uSunDir), 0.), 3.) * (.35 + .65 * vT);
  float spec = pow(max(dot(reflect(-uSunDir, N), V), 0.), 24.) * (.22 + .9 * uWet + .5 * uFrost) * vT;
  vec3 amb = uAmb + uFlash * vec3(.9, .95, 1.25);
  vec3 lit = col * (amb + uSunCol * diff * .9) + uSunCol * col * back * uTrans * 1.6 + uSunCol * spec;
  lit *= mix(.22, 1., smoothstep(0., .5, vT));   // ombre au pied
  lit *= .8 + .2 * (1. - abs(vSide));            // arrondi du brin
  lit += lamp(col, back);
  gl_FragColor = finish(lit, vDist);
}`;

const GROUND_VS = /* glsl */ `
attribute vec3 position;
varying vec3 vWorld; varying float vDist;
void main() { vec4 w = modelMatrix * vec4(position, 1.); vWorld = w.xyz; vec4 mv = viewMatrix * w; vDist = -mv.z; gl_Position = projectionMatrix * mv; }`;
const GROUND_FS = /* glsl */ `
varying vec3 vWorld; varying float vDist;
${NOISE}
${LIGHT}
void main() {
  float n = noise(vWorld.xz * .9) * .6 + noise(vWorld.xz * 3.1) * .4;
  vec3 col = uGround * (.75 + .35 * n);
  col = mix(col, vec3(.92, .95, 1.) * (.82 + .18 * n), uSnow * .85);
  col *= 1. - .25 * uWet;
  vec3 lit = col * ((uAmb + uFlash * vec3(.9, .95, 1.25)) * .9) + lamp(col, 0.);
  gl_FragColor = finish(lit, vDist);
}`;

/* Pluie (traits fins) et neige (flocons) : quelques milliers de particules dans l'air au-dessus du champ. */
const RAIN_VS = /* glsl */ `
attribute vec2 aC; // x : 0 queue, 1 tête ; y : côté
attribute vec4 iR; // x, hauteur de départ, z, hasard
uniform float uTime, uRainAmt, uFall, uSnowMode;
uniform vec2 uDrift;
varying float vA; varying vec2 vC;
void main() {
  float H = 5.2, sp = uFall * (.8 + .4 * iR.w);
  float y = mod(iR.y - uTime * sp, H) - .3, fallen = H - y;
  vec3 head = vec3(iR.x + uDrift.x * fallen, y, iR.z + uDrift.y * fallen);
  head.x += uSnowMode * sin(uTime * 1.1 + iR.w * 40.) * .25;
  head.z += uSnowMode * cos(uTime * .9 + iR.w * 30.) * .15;
  vec3 vel = normalize(vec3(uDrift.x * sp, -sp, uDrift.y * sp));
  vec4 h = viewMatrix * vec4(head, 1.);
  vec4 t = viewMatrix * vec4(head - vel * mix(.26, 0., uSnowMode), 1.);
  vec4 p = aC.x > .5 ? h : t;
  vec2 dir = h.xy / -h.z - t.xy / -t.z;
  dir = length(dir) > 1e-5 ? normalize(dir) : vec2(0., 1.);
  float w = mix(.006, .03, uSnowMode);
  p.xy += vec2(-dir.y, dir.x) * aC.y * w;
  if (uSnowMode > .5) p.xy += dir * (aC.x - .5) * 2. * w;
  vA = (1. - smoothstep(7., 15., -p.z)) * step(iR.w, uRainAmt);
  vC = aC;
  gl_Position = projectionMatrix * p;
}`;
const RAIN_FS = /* glsl */ `
uniform vec3 uRainCol;
uniform float uSnowMode, uRainAlpha;
varying float vA; varying vec2 vC;
void main() {
  float a = uSnowMode > .5 ? smoothstep(1., .15, length(vec2(vC.x * 2. - 1., vC.y))) : (1. - abs(vC.y)) * smoothstep(0., .4, vC.x);
  a *= vA * uRainAlpha;
  gl_FragColor = vec4(uRainCol * a, a);
}`;

const RAD = Math.PI / 180;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const SNOW_CODES = [71, 73, 75, 77, 85, 86], RAIN_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
/** Sécheresse de l'herbe selon le mois (hémisphère nord) : verte au printemps, sèche en fin d'été. */
const SEASON = [.3, .25, .08, -.12, -.2, .02, .3, .42, .35, .28, .3, .32];

/* ---------- Petit moteur WebGL2 : programmes, uniformes partagés, géométrie instanciée ---------- */
type GL = WebGL2RenderingContext;
const toVS = (src: string) => "#version 300 es\nprecision highp float;\nuniform mat4 uView, uProj;\n" + src.replace(/\battribute\b/g, "in").replace(/\bvarying\b/g, "out").replace(/modelMatrix \* /g, "").replace(/\bviewMatrix\b/g, "uView").replace(/\bprojectionMatrix\b/g, "uProj");
const toFS = (src: string) => "#version 300 es\nprecision highp float;\nout vec4 fragColor;\n" + src.replace(/\bvarying\b/g, "in").replace(/\bgl_FragColor\b/g, "fragColor");
interface Prog { p: WebGLProgram; loc: Map<string, WebGLUniformLocation | null> }
/** Programme compilé sans attendre (les emplacements d'attributs sont fixés avant l'édition des liens). */
function program(gl: GL, vs: string, fs: string, attrs: string[]): Prog {
  const p = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, toVS(vs)], [gl.FRAGMENT_SHADER, toFS(fs)]] as const) {
    const sh = gl.createShader(type)!; gl.shaderSource(sh, src); gl.compileShader(sh); gl.attachShader(p, sh);
  }
  attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
  gl.linkProgram(p);
  return { p, loc: new Map() };
}
const perspective = (o: Float32Array, fovy: number, aspect: number, near: number, far: number) => {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  o.fill(0); o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
};
const norm = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function mountGrass(el: HTMLElement): () => void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let mode: GrassMode = navigator.webdriver ? "vivant" : grassMode();
  let soft = false;
  const still = () => navigator.webdriver || soft || reduce.matches || mode === "fixe";
  const calm = () => mode === "calme";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  // Tests automatiques : rendu logiciel, on allège (le champ reste là pour juger la lisibilité).
  const bot = navigator.webdriver;
  const SOFT_KEY = "trail-pilot-gl";
  // Appareil déjà reconnu sans carte graphique : on ne recrée même pas de contexte (son ouverture coûte cher en logiciel).
  // « on » force le champ même en rendu logiciel (tests du champ, ou choix assumé).
  let gpuPref: string | null = null;
  try { gpuPref = localStorage.getItem(SOFT_KEY); } catch { /* stockage indisponible */ }
  if (!bot && gpuPref === "soft") return () => {};
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", { alpha: true, antialias: !bot, premultipliedAlpha: true, powerPreference: "default", depth: true }) as GL | null;
  if (!gl) return () => {};
  // Rendu logiciel (pas de carte graphique : vieil appareil, carte bloquée par le navigateur) ?
  try {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)));
  } catch { /* inconnu : on garde l'animation, le réglage automatique allège si besoin */ }
  // Hors tests, sans carte graphique : pas de champ du tout. Le simple premier dessin (compilation des shaders
  // par le processeur) bloquerait la page une demi-seconde ou plus ; le fond reste la couleur de l'apparence.
  if (gpuPref === "on") soft = false;
  if (soft && !bot) {
    try { localStorage.setItem(SOFT_KEY, "soft"); } catch { /* stockage indisponible */ }
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return () => {};
  }
  const lite = bot || soft;
  let dpr = lite ? .5 : Math.min(window.devicePixelRatio || 1, coarse ? 2 : 1.5);
  el.appendChild(canvas);

  // Caméra : à hauteur d'herbe, le regard un peu plongeant ; le champ regarde vers le sud.
  const FOV = 38 * RAD, EYE = [0, 1, 0], AT = [0, .72, -10];
  const fwd = norm([AT[0] - EYE[0], AT[1] - EYE[1], AT[2] - EYE[2]]), zAx = fwd.map((v) => -v), xAx = norm(cross([0, 1, 0], zAx)), yAx = cross(zAx, xAx);
  const view = new Float32Array([xAx[0], yAx[0], zAx[0], 0, xAx[1], yAx[1], zAx[1], 0, xAx[2], yAx[2], zAx[2], 0, -dot(xAx, EYE), -dot(yAx, EYE), -dot(zAx, EYE), 1]);
  const proj = new Float32Array(16);
  let aspect = 1;
  const NEAR = 1.9, FAR = 26, RHO = 115, MAX = coarse ? 26000 : 64000, RMAX = coarse ? 1400 : 2800;

  // Uniformes partagés par les trois programmes (sol, brins, pluie).
  const f3 = () => new Float32Array(3);
  const U: Record<string, number | Float32Array> = {
    uView: view, uProj: proj, uCam: new Float32Array(EYE),
    uTime: 14.3, uWind: new Float32Array([.8, -.6]), uWindStr: .5, uTouch: new Float32Array(64).map((_, i) => (i % 4 === 3 ? 1 : 0)),
    uRoot: f3(), uMid: f3(), uTip: f3(), uDry: f3(), uGround: f3(), uAmb: f3(), uSunCol: f3(), uSunDir: f3(), uHaze: f3(),
    uTrans: 1, uFadeNear: 12, uFadeFar: 25, uOpacity: 1, uLampOn: 0, uLamp: new Float32Array([.5, .22]), uRes: new Float32Array([1, 1]),
    uGustAmp: 1, uHazeMix: .75, uFlash: 0, uWet: 0, uFrost: 0, uSnow: 0, uSeason: 0,
    uRainAmt: 0, uFall: 7.5, uSnowMode: 0, uDrift: new Float32Array(2), uRainCol: f3(), uRainAlpha: .3,
  };
  const set3 = (k: string, a: number, b: number, c: number) => { const v = U[k] as Float32Array; v[0] = a; v[1] = b; v[2] = c; };
  const upload = (g: Prog) => {
    gl.useProgram(g.p);
    for (const k in U) {
      let l = g.loc.get(k);
      if (l === undefined) { l = gl.getUniformLocation(g.p, k); g.loc.set(k, l); }
      if (!l) continue;
      const v = U[k];
      if (typeof v === "number") gl.uniform1f(l, v);
      else if (k === "uView" || k === "uProj") gl.uniformMatrix4fv(l, false, v);
      else if (v.length === 2) gl.uniform2fv(l, v);
      else if (v.length === 3) gl.uniform3fv(l, v);
      else gl.uniform4fv(l, v);
    }
  };

  // Un brin : 7 étages de deux points et une pointe.
  const S = 7, bladeT: number[] = [], bladeSide: number[] = [], bladeIdx: number[] = [];
  for (let i = 0; i < S; i++) { bladeT.push(i / S, i / S); bladeSide.push(-1, 1); }
  bladeT.push(1); bladeSide.push(0);
  for (let i = 0; i < S - 1; i++) { const a = 2 * i; bladeIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  bladeIdx.push(2 * (S - 1), 2 * (S - 1) + 1, 2 * S);
  const iA = new Float32Array(MAX * 4), iB = new Float32Array(MAX * 4), iR = new Float32Array(RMAX * 4);
  let nBlades = 0, rainOn = false;

  // Ressources GPU (recréées si le contexte est perdu puis rendu).
  let G: { blade: Prog; ground: Prog; rain: Prog; vBlade: WebGLVertexArrayObject; vGround: WebGLVertexArrayObject; vRain: WebGLVertexArrayObject; bA: WebGLBuffer; bB: WebGLBuffer; bR: WebGLBuffer; bufs: WebGLBuffer[] } | null = null;
  let ready = false;
  const attr = (data: Float32Array | null, bytes: number, loc: number, size: number, divisor: number, bufs: WebGLBuffer[]) => {
    const b = gl.createBuffer()!; bufs.push(b);
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    if (data) gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); else gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(loc, divisor);
    return b;
  };
  const index = (ix: number[], bufs: WebGLBuffer[]) => { const b = gl.createBuffer()!; bufs.push(b); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(ix), gl.STATIC_DRAW); };
  const build = () => {
    const bufs: WebGLBuffer[] = [];
    const blade = program(gl, BLADE_VS, BLADE_FS, ["aT", "aSide", "iA", "iB"]);
    const ground = program(gl, GROUND_VS, GROUND_FS, ["position"]);
    const rain = program(gl, RAIN_VS, RAIN_FS, ["aC", "iR"]);
    const vBlade = gl.createVertexArray()!; gl.bindVertexArray(vBlade);
    attr(new Float32Array(bladeT), 0, 0, 1, 0, bufs); attr(new Float32Array(bladeSide), 0, 1, 1, 0, bufs);
    const bA = attr(null, MAX * 16, 2, 4, 1, bufs), bB = attr(null, MAX * 16, 3, 4, 1, bufs);
    index(bladeIdx, bufs);
    const vGround = gl.createVertexArray()!; gl.bindVertexArray(vGround);
    attr(new Float32Array([-45, 0, -41, 45, 0, -41, -45, 0, -1, 45, 0, -1]), 0, 0, 3, 0, bufs);
    index([0, 2, 1, 1, 2, 3], bufs);
    const vRain = gl.createVertexArray()!; gl.bindVertexArray(vRain);
    attr(new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), 0, 0, 2, 0, bufs);
    const bR = attr(null, RMAX * 16, 1, 4, 1, bufs);
    index([0, 2, 1, 1, 2, 3], bufs);
    gl.bindVertexArray(null);
    G = { blade, ground, rain, vBlade, vGround, vRain, bA, bB, bR, bufs };
    ready = false;
    upPlacement();
    // Compilation en parallèle quand l'appareil le permet : la page ne se fige pas pendant ce temps.
    const ext = gl.getExtension("KHR_parallel_shader_compile");
    const progs = [blade, ground, rain];
    const check = () => {
      if (!G || gl.isContextLost()) return;
      if (ext && !progs.every((g) => gl.getProgramParameter(g.p, ext.COMPLETION_STATUS_KHR))) { requestAnimationFrame(check); return; }
      if (!progs.every((g) => gl.getProgramParameter(g.p, gl.LINK_STATUS))) { console.warn("Fond d'herbes :", progs.map((g) => gl.getProgramInfoLog(g.p)).join(" ")); return; }
      ready = true; refresh();
    };
    check();
  };
  const upPlacement = () => {
    if (!G) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, G.bA); gl.bufferSubData(gl.ARRAY_BUFFER, 0, iA.subarray(0, nBlades * 4));
    gl.bindBuffer(gl.ARRAY_BUFFER, G.bB); gl.bufferSubData(gl.ARRAY_BUFFER, 0, iB.subarray(0, nBlades * 4));
    gl.bindBuffer(gl.ARRAY_BUFFER, G.bR); gl.bufferSubData(gl.ARRAY_BUFFER, 0, iR);
  };

  // Placement : densité régulière au sol sur tout le champ visible (plus large au loin), plaques plus hautes.
  // Qualité : allégée en test et en mode calme, réduite encore si l'appareil peine.
  let perf = 1, placedAspect = 0;
  const quality = () => (lite ? .3 : calm() ? .55 : 1) * perf;
  const place = () => {
    placedAspect = aspect;
    const a = Math.tan(FOV / 2) * aspect, b = .7;
    const F = (d: number) => a * d * d / 2 + b * d;
    const n = Math.min(MAX, Math.round(2 * (F(FAR) - F(NEAR)) * RHO * quality()));
    const r = rng(7);
    for (let k = 0; k < n; k++) {
      const target = F(NEAR) + r() * (F(FAR) - F(NEAR));
      const d = (-b + Math.sqrt(b * b + 2 * a * target)) / a;
      const x = (r() * 2 - 1) * (a * d + b), z = -d;
      const patch = vnoise(x * .35, z * .35);
      const tall = r() < .06 ? 1.35 : 1;
      iA[k * 4] = x; iA[k * 4 + 1] = z; iA[k * 4 + 2] = (.42 + r() * .55 + patch * .38) * tall; iA[k * 4 + 3] = (.03 + r() * .03) * (1 + d * .035);
      iB[k * 4] = r() * Math.PI * 2; iB[k * 4 + 1] = .08 + r() * .35; iB[k * 4 + 2] = r(); iB[k * 4 + 3] = r();
    }
    nBlades = n;
    const rr = rng(11);
    for (let k = 0; k < RMAX; k++) {
      const d = 1.2 + rr() * 12;
      iR[k * 4] = (rr() * 2 - 1) * (a * d + .4); iR[k * 4 + 1] = rr() * 5.2; iR[k * 4 + 2] = -d; iR[k * 4 + 3] = rr();
    }
    upPlacement();
  };

  // Couleurs : on glisse d'une apparence à l'autre.
  const cur: Pal = JSON.parse(JSON.stringify(PAL[palKey()]));
  let target = PAL[palKey()];
  // Le dehors : conditions au lieu d'entraînement (ou au départ le jour de la course) et position du soleil.
  const env: { lat: number | null; lon: number | null; now: GrassEnv["now"] | null; sun: { alt: number; az: number } | null } = { lat: null, lon: null, now: null, sun: null };
  const apply = () => {
    const day = cur.day, n = env.now;
    const sun = [...cur.sun], amb = [...cur.amb], dir = [...cur.dir];
    let trans = cur.trans, hazeMix = .75, near = 12, far = 25;
    // Modes clairs : la lumière vient d'où est le soleil (le champ regarde vers le sud), dorée quand il est bas.
    if (env.sun && day > .01) {
      const { alt, az } = env.sun, a = Math.max(alt, 4) * RAD, z = az * RAD;
      const real = [-Math.cos(a) * Math.sin(z), Math.sin(a), Math.cos(a) * Math.cos(z)];
      const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      for (let i = 0; i < 3; i++) dir[i] = dir[i] / len + (real[i] - dir[i] / len) * day;
      const warm = smooth(28, 2, alt), night = smooth(-1, -9, alt);
      const tint = [.05, -.2, -.45];
      for (let i = 0; i < 3; i++) { sun[i] *= (1 + tint[i] * warm * .8 * day) * (1 - .7 * night * day); amb[i] *= (1 - .45 * night * day) * (i === 2 ? 1 + .15 * night * day : 1); }
      trans *= 1 + .45 * warm * day;
    }
    if (n) {
      const c = n.cloud / 100;
      for (let i = 0; i < 3; i++) { sun[i] *= 1 - .55 * c; amb[i] *= 1 + .12 * c; }
      trans *= 1 - .6 * c;
      if (n.code === 45 || n.code === 48) { hazeMix = 1; near = 4.5; far = 15; }
    }
    set3("uRoot", ...cur.root); set3("uMid", ...cur.mid); set3("uTip", ...cur.tip); set3("uDry", ...cur.dry); set3("uGround", ...cur.ground); set3("uHaze", ...cur.haze);
    set3("uAmb", amb[0], amb[1], amb[2]); set3("uSunCol", sun[0], sun[1], sun[2]);
    const d = norm(dir); set3("uSunDir", d[0], d[1], d[2]);
    U.uTrans = trans; U.uOpacity = cur.opacity; U.uLampOn = cur.lamp;
    U.uHazeMix = hazeMix; U.uFadeNear = near; U.uFadeFar = far;
    // Pluie claire sur fond sombre, traits gris sur les fonds clairs.
    set3("uRainCol", .72 - .42 * day, .8 - .44 * day, .9 - .46 * day);
  };
  // Pluie, neige, givre, saison, vent : recalculés quand les conditions changent.
  let wind: { x: number; z: number; str: number; gust: number } | null = null, storm = false;
  const weather = () => {
    const n = env.now;
    const month = new Date().getMonth(), south = (env.lat ?? 45) < 0;
    U.uSeason = SEASON[(month + (south ? 6 : 0)) % 12] + (n && n.temp > 26 ? .15 : 0);
    if (!n) { wind = null; storm = false; U.uRainAmt = 0; U.uWet = 0; U.uFrost = 0; U.uSnow = 0; rainOn = false; return; }
    const th = n.dir * RAD;
    wind = { x: Math.sin(th), z: -Math.cos(th), str: Math.min(1.3, .12 + n.wind / 26), gust: .6 + Math.min(1, Math.max(0, (n.gust - n.wind) / Math.max(n.wind, 6))) * .9 };
    const snowing = n.snow > 0 || SNOW_CODES.includes(n.code);
    const raining = !snowing && (n.rain > .05 || RAIN_CODES.includes(n.code));
    storm = [95, 96, 99].includes(n.code);
    U.uRainAmt = snowing ? Math.min(1, .25 + n.snow * 2.5) : raining ? Math.min(1, .2 + n.rain / 3.5) : 0;
    U.uSnowMode = snowing ? 1 : 0;
    U.uFall = snowing ? .9 : 7.5;
    U.uRainAlpha = snowing ? .75 : .3;
    const push = Math.min(.6, n.wind / 45) * (snowing ? 2 : 1);
    (U.uDrift as Float32Array).set([wind.x * push, wind.z * push]);
    U.uWet = raining ? (n.rain > .3 ? 1 : .6) : 0;
    U.uSnow = snowing && n.temp <= 2 ? .7 : 0;
    U.uFrost = !raining && !snowing && n.temp <= 0 ? .6 : 0;
    rainOn = (U.uRainAmt as number) > 0;
  };
  weather();
  const blend = (k: number) => {
    const mix = (x: number[], y: number[]) => { for (let i = 0; i < x.length; i++) x[i] += (y[i] - x[i]) * k; };
    for (const key of ["root", "mid", "tip", "dry", "ground", "amb", "sun", "dir", "haze"] as const) mix(cur[key], target[key]);
    cur.trans += (target.trans - cur.trans) * k; cur.opacity += (target.opacity - cur.opacity) * k; cur.lamp += (target.lamp - cur.lamp) * k; cur.day += (target.day - cur.day) * k;
    apply();
  };
  apply();

  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
    aspect = w / h;
    perspective(proj, FOV, aspect, .1, 60);
    (U.uRes as Float32Array).set([canvas.width, canvas.height]);
    // La barre d'adresse du téléphone change la hauteur sans arrêt : on ne replace les brins que si le cadre change vraiment.
    if (!placedAspect || Math.abs(aspect / placedAspect - 1) > .12) place();
  };
  resize();

  // Pointeur : on projette sur le champ, à mi-hauteur des brins.
  const touch = U.uTouch as Float32Array;
  let slot = 0, hasLast = false, lx0 = 0, lz0 = 0, lampSeen = 0;
  const lampTo = [.5, .22];
  const poke = (cx: number, cy: number, s = 1) => {
    if (still()) return;
    lampTo[0] = cx / window.innerWidth; lampTo[1] = 1 - cy / window.innerHeight; lampSeen = performance.now();
    const nx = cx / window.innerWidth * 2 - 1, ny = -(cy / window.innerHeight) * 2 + 1, tv = Math.tan(FOV / 2), th = tv * aspect;
    const dir = norm([fwd[0] + xAx[0] * nx * th + yAx[0] * ny * tv, fwd[1] + xAx[1] * nx * th + yAx[1] * ny * tv, fwd[2] + xAx[2] * nx * th + yAx[2] * ny * tv]);
    if (dir[1] > -1e-4) return;
    const t = (.45 - EYE[1]) / dir[1], hx = EYE[0] + dir[0] * t, hz = EYE[2] + dir[2] * t, d = -hz;
    if (t <= 0 || d < NEAR * .6 || d > FAR) return;
    const r = .32 + d * .045, o = slot * 4;
    if (hasLast && Math.hypot(hx - lx0, hz - lz0) < r * .35 && touch[o + 2] > .2) { touch[o] = hx; touch[o + 1] = hz; touch[o + 2] = Math.min(1, touch[o + 2] + .25 * s); touch[o + 3] = r; }
    else { slot = (slot + 1) % 16; const q = slot * 4; touch[q] = hx; touch[q + 1] = hz; touch[q + 2] = s; touch[q + 3] = r; }
    lx0 = hx; lz0 = hz; hasLast = true;
  };
  const onMove = (e: PointerEvent) => poke(e.clientX, e.clientY, (e.pointerType === "touch" ? 1 : .9) * (calm() ? .6 : 1));
  const onTouch = (e: TouchEvent) => { const t = e.touches[0]; if (t) poke(t.clientX, t.clientY); };
  let gustScroll = 0, lastY = window.scrollY;
  const onScroll = () => { const y = window.scrollY; gustScroll = Math.min(.9, gustScroll + Math.abs(y - lastY) * .0016); lastY = y; };

  // Dessin : le sol, les brins, puis la pluie par-dessus (fondue, sans écrire la profondeur).
  let shown = false;
  const draw = () => {
    if (!ready || !G || gl.isContextLost()) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.depthMask(true);
    upload(G.ground); gl.bindVertexArray(G.vGround); gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    upload(G.blade); gl.bindVertexArray(G.vBlade); gl.drawElementsInstanced(gl.TRIANGLES, bladeIdx.length, gl.UNSIGNED_SHORT, 0, nBlades);
    if (rainOn) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      upload(G.rain); gl.bindVertexArray(G.vRain); gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, RMAX);
      gl.depthMask(true);
    }
    gl.bindVertexArray(null);
    if (!shown) { shown = true; canvas.classList.add("is-on"); }
  };

  // Boucle : vent, retour des brins, glissement des couleurs ; qualité réduite si l'appareil peine.
  // Téléphones et mode calme : 30 images par seconde suffisent pour de l'herbe au vent, la batterie dit merci.
  let raf = 0, prev = 0, warm = 0, acc = 0, frames = 0, flash = 0, nextFlash = 0, sunAt = 0;
  const lamp = U.uLamp as Float32Array, windV = U.uWind as Float32Array;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (prev && now - prev < (coarse || calm() ? 30 : 0)) return;
    const dt = prev ? Math.min(.05, (now - prev) / 1000) : .016;
    prev = now;
    const t = (U.uTime = (U.uTime as number) + dt);
    // Vent réel quand on le connaît (direction qui flotte un peu, force qui respire), sinon brise par défaut.
    const wa = wind ? Math.atan2(wind.z, wind.x) + Math.sin(t * .07) * .25 : -.65 + Math.sin(t * .05) * .5;
    windV[0] = Math.cos(wa); windV[1] = Math.sin(wa);
    gustScroll *= Math.exp(-dt * 1.4);
    const base = wind ? wind.str * (1 + Math.sin(t * .13) * .15) : .5 + Math.sin(t * .13) * .12;
    U.uWindStr = base * (calm() ? .45 : 1) + gustScroll;
    U.uGustAmp = wind ? wind.gust : 1;
    // Orage : un éclair de temps en temps.
    if (storm && now > nextFlash) { flash = 1; nextFlash = now + 6000 + Math.random() * 12000; }
    flash *= Math.exp(-dt * 9);
    U.uFlash = storm ? flash * (Math.random() > .15 ? 1 : .3) : 0;
    if (env.lat != null && now - sunAt > 60000) { sunAt = now; env.sun = sunPosition(Date.now(), env.lat, env.lon!); }
    for (let i = 2; i < 64; i += 4) touch[i] *= Math.exp(-dt / 1.5);
    // Frontale : le faisceau suit le pointeur, puis balaie doucement le sentier quand on ne bouge plus.
    const idle = now - lampSeen > 2500;
    const lx = idle ? .5 + Math.sin(t * .35) * .22 : lampTo[0], ly = idle ? .2 + Math.sin(t * .23) * .05 : lampTo[1];
    lamp[0] += (lx - lamp[0]) * Math.min(1, dt * 6);
    lamp[1] += (ly - lamp[1]) * Math.min(1, dt * 6);
    blend(Math.min(1, dt * 3));
    draw();
    warm += dt;
    if (warm > 2.5) {
      acc += dt; frames++;
      if (frames >= 90) {
        const avg = acc / frames; acc = 0; frames = 0;
        if (avg > (coarse || calm() ? .045 : .024) && perf > .3) {
          perf *= .7;
          if (dpr > 1) dpr = Math.max(1, dpr - .25);
          placedAspect = 0; resize();
        }
      }
    }
  };
  const run = () => { if (raf || still() || document.hidden || !ready) return; prev = 0; raf = requestAnimationFrame(frame); };
  const halt = () => { cancelAnimationFrame(raf); raf = 0; };
  function refresh() { if (still()) { halt(); Object.assign(cur, JSON.parse(JSON.stringify(target))); apply(); draw(); } else run(); }

  const onTheme = () => { target = PAL[palKey()]; if (still()) { window.clearTimeout(redraw); redraw = window.setTimeout(refresh, 120); } };
  const onMode = () => { mode = grassMode(); placedAspect = 0; resize(); refresh(); };
  const onStorage = (e: StorageEvent) => { if (e.key === GRASS_KEY) onMode(); };
  // Conditions du moment : au chargement puis toutes les 20 minutes (pas pendant les tests, pour des images stables).
  const loadEnv = async () => {
    if (bot) return;
    try {
      const r = await fetch("/api/weather/now", { credentials: "same-origin" });
      if (r.ok) {
        const j = (await r.json()) as GrassEnv;
        if (j.place) { env.lat = j.place.lat; env.lon = j.place.lon; }
        env.now = j.status === "ok" ? j.now ?? null : null;
      }
    } catch { /* hors ligne : on garde la brise par défaut */ }
    if (env.lat == null) {
      try { const a = JSON.parse(localStorage.getItem("trail-pilot-auto") || "null"); if (typeof a?.lat === "number" && typeof a?.lon === "number") { env.lat = a.lat; env.lon = a.lon; } } catch { /* rien */ }
    }
    if (env.lat != null) env.sun = sunPosition(Date.now(), env.lat, env.lon!);
    weather();
    if (still()) refresh();
  };
  const envTimer = window.setInterval(() => { if (!document.hidden) loadEnv(); }, 20 * 60000);
  loadEnv();
  const mo = new MutationObserver(onTheme);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-ap"] });
  // Image fixe : on ne redessine qu'une fois le redimensionnement terminé.
  let redraw = 0;
  const onResize = () => { resize(); if (still()) { window.clearTimeout(redraw); redraw = window.setTimeout(draw, 250); } };
  const onVis = () => (document.hidden ? halt() : run());
  const onLost = (e: Event) => { e.preventDefault(); halt(); ready = false; G = null; };
  const onRestored = () => { build(); };
  window.addEventListener("resize", onResize);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onMove, { passive: true });
  window.addEventListener("touchmove", onTouch, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", onVis);
  reduce.addEventListener("change", refresh);
  window.addEventListener(GRASS_EVENT, onMode);
  window.addEventListener("storage", onStorage);
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  build();

  return () => {
    halt(); mo.disconnect(); window.clearTimeout(redraw);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onMove);
    window.removeEventListener("touchmove", onTouch);
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVis);
    reduce.removeEventListener("change", refresh);
    window.removeEventListener(GRASS_EVENT, onMode);
    window.removeEventListener("storage", onStorage);
    window.clearInterval(envTimer);
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    if (G && !gl.isContextLost()) {
      for (const g of [G.blade, G.ground, G.rain]) gl.deleteProgram(g.p);
      for (const v of [G.vBlade, G.vGround, G.vRain]) gl.deleteVertexArray(v);
      for (const b of G.bufs) gl.deleteBuffer(b);
    }
    G = null;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    canvas.remove();
  };
}
