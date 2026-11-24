"use client";

import { useEffect, useRef } from "react";

/**
 * Fond vivant : un champ d'herbes hautes en 3D (WebGL, three.js chargé après l'affichage), fixe derrière le contenu.
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
 */
export default function GrassField() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let stop: () => void = () => {};
    let gone = false;
    const go = () => {
      import("three").then((THREE) => { if (!gone) stop = mountGrass(THREE, el); }).catch(() => {});
    };
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
    const id = w.requestIdleCallback ? w.requestIdleCallback(go, { timeout: 1500 }) : window.setTimeout(go, 400);
    return () => { gone = true; if (!w.requestIdleCallback) window.clearTimeout(id); stop(); };
  }, []);
  return <div ref={host} className="grass" aria-hidden="true" />;
}

type V3 = [number, number, number];
interface Pal { root: V3; mid: V3; tip: V3; dry: V3; ground: V3; amb: V3; sun: V3; dir: V3; trans: number; haze: V3; opacity: number; lamp: number }

const hex = (h: string): V3 => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const PAL: Record<string, Pal> = {
  // Nuit : clair de lune derrière le champ, brins sombres et liserés froids (le texte clair reste lisible).
  nuit: { root: hex("#020404"), mid: hex("#0a1210"), tip: hex("#1b2824"), dry: hex("#25251c"), ground: hex("#040706"), amb: [.5, .58, .72], sun: [.42, .52, .68], dir: [-.3, .42, -.86], trans: .9, haze: hex("#0b0f14"), opacity: 1, lamp: 0 },
  // Jour : contre-jour doré, pointes qui s'illuminent, paille et vert tendre, voilé par la couleur de la page.
  jour: { root: hex("#56533a"), mid: hex("#8a8a58"), tip: hex("#d4c88f"), dry: hex("#ddcb93"), ground: hex("#a5a077"), amb: [.78, .77, .72], sun: [1, .87, .64], dir: [.25, .5, -.83], trans: 1, haze: hex("#f4f1ec"), opacity: .55, lamp: 0 },
  // Verre : crépuscule violet, silhouettes et reflets roses.
  verre: { root: hex("#060514"), mid: hex("#121031"), tip: hex("#2a2656"), dry: hex("#372f55"), ground: hex("#09081b"), amb: [.55, .5, .85], sun: [.95, .58, .82], dir: [.35, .38, -.86], trans: 1.1, haze: hex("#1a1640"), opacity: .92, lamp: 0 },
  // Topo : herbes pâles comme une gravure sur le papier.
  topo: { root: hex("#9a8e6d"), mid: hex("#b7ab84"), tip: hex("#dcd1ab"), dry: hex("#e5d5aa"), ground: hex("#c8bb94"), amb: [.95, .93, .88], sun: [1, .95, .85], dir: [.2, .6, -.77], trans: .6, haze: hex("#efe6d2"), opacity: .45, lamp: 0 },
  // Frontale : nuit noire, seul le faisceau (qui suit le pointeur) éclaire l'herbe.
  frontale: { root: hex("#000000"), mid: hex("#030101"), tip: hex("#0a0404"), dry: hex("#080403"), ground: hex("#000000"), amb: [.1, .05, .04], sun: [.12, .04, .03], dir: [0, .6, -.8], trans: .4, haze: hex("#000000"), opacity: 1, lamp: 1 },
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
  float gust = noise(wp); gust = gust * gust * 1.7 + noise(wp * 2.3 + 7.) * 0.35;
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
uniform float uTrans, uFadeNear, uFadeFar, uOpacity, uLampOn;
uniform vec2 uLamp, uRes;
vec3 lamp(vec3 col, float back) {
  if (uLampOn <= 0.) return vec3(0.);
  vec2 sp = gl_FragCoord.xy / uRes;
  vec2 d = (sp - uLamp) * vec2(uRes.x / uRes.y, 1.);
  float L = exp(-dot(d, d) * 9.) * uLampOn * .5;
  return (col * 9. + vec3(.05, .012, .008)) * L * vec3(1., .42, .3) + vec3(.9, .25, .16) * L * back * .45;
}
vec4 finish(vec3 lit, float dist) {
  lit = mix(lit, uHaze, smoothstep(uFadeNear * 0.35, uFadeFar, dist) * 0.75);
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
  float dry = clamp(vVar * .7 + vPatch * .6 - .35, 0., 1.);
  col = mix(col, uDry * mix(.75, 1.05, vT), dry * .65);
  vec3 V = normalize(uCam - vWorld);
  vec3 N = normalize(vNormal);
  if (dot(N, V) < 0.) N = -N;
  float diff = max(dot(N, uSunDir), 0.);
  float back = pow(max(dot(V, -uSunDir), 0.), 3.) * (.35 + .65 * vT);
  float spec = pow(max(dot(reflect(-uSunDir, N), V), 0.), 24.) * .22 * vT;
  vec3 lit = col * (uAmb + uSunCol * diff * .9) + uSunCol * col * back * uTrans * 1.6 + uSunCol * spec;
  lit *= mix(.22, 1., smoothstep(0., .5, vT));   // ombre au pied
  lit *= .8 + .2 * (1. - abs(vSide));            // arrondi du brin
  lit += lamp(col, back);
  gl_FragColor = finish(lit, vDist);
}`;

const GROUND_VS = /* glsl */ `
varying vec3 vWorld; varying float vDist;
void main() { vec4 w = modelMatrix * vec4(position, 1.); vWorld = w.xyz; vec4 mv = viewMatrix * w; vDist = -mv.z; gl_Position = projectionMatrix * mv; }`;
const GROUND_FS = /* glsl */ `
varying vec3 vWorld; varying float vDist;
${NOISE}
${LIGHT}
void main() {
  float n = noise(vWorld.xz * .9) * .6 + noise(vWorld.xz * 3.1) * .4;
  vec3 col = uGround * (.75 + .35 * n);
  vec3 lit = col * (uAmb * .9) + lamp(col, 0.);
  gl_FragColor = finish(lit, vDist);
}`;

function mountGrass(THREE: typeof import("three"), el: HTMLElement): () => void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const still = () => navigator.webdriver || reduce.matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  let renderer: import("three").WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !navigator.webdriver, premultipliedAlpha: true, powerPreference: "default" });
  } catch { return () => {}; }
  // Tests automatiques : rendu logiciel, on allège (le champ reste là pour juger la lisibilité).
  const bot = navigator.webdriver;
  let dpr = bot ? .5 : Math.min(window.devicePixelRatio || 1, coarse ? 2 : 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  el.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  camera.position.set(0, 1, 0);
  camera.lookAt(0, 0.72, -10);
  const NEAR = 1.9, FAR = 26, RHO = 115, MAX = coarse ? 26000 : 64000;

  // Un brin : 7 étages de deux points et une pointe.
  const S = 7, aT: number[] = [], aSide: number[] = [], idx: number[] = [];
  for (let i = 0; i < S; i++) { aT.push(i / S, i / S); aSide.push(-1, 1); }
  aT.push(1); aSide.push(0);
  for (let i = 0; i < S - 1; i++) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  idx.push(2 * (S - 1), 2 * (S - 1) + 1, 2 * S);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setIndex(idx);
  geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array((2 * S + 1) * 3), 3));
  geo.setAttribute("aT", new THREE.Float32BufferAttribute(aT, 1));
  geo.setAttribute("aSide", new THREE.Float32BufferAttribute(aSide, 1));
  const iA = new Float32Array(MAX * 4), iB = new Float32Array(MAX * 4);
  const attrA = new THREE.InstancedBufferAttribute(iA, 4), attrB = new THREE.InstancedBufferAttribute(iB, 4);
  geo.setAttribute("iA", attrA);
  geo.setAttribute("iB", attrB);

  const v3 = () => new THREE.Vector3();
  const U = {
    uTime: { value: 14.3 }, uWind: { value: new THREE.Vector2(.8, -.6).normalize() }, uWindStr: { value: .5 },
    uTouch: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 1)) },
    uRoot: { value: v3() }, uMid: { value: v3() }, uTip: { value: v3() }, uDry: { value: v3() }, uGround: { value: v3() },
    uAmb: { value: v3() }, uSunCol: { value: v3() }, uSunDir: { value: v3() }, uHaze: { value: v3() }, uCam: { value: camera.position },
    uTrans: { value: 1 }, uFadeNear: { value: 12 }, uFadeFar: { value: 25 }, uOpacity: { value: 1 }, uLampOn: { value: 0 },
    uLamp: { value: new THREE.Vector2(.5, .22) }, uRes: { value: new THREE.Vector2(1, 1) },
  };
  const blades = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: BLADE_VS, fragmentShader: BLADE_FS, uniforms: U, side: THREE.DoubleSide }));
  blades.frustumCulled = false;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 40), new THREE.ShaderMaterial({ vertexShader: GROUND_VS, fragmentShader: GROUND_FS, uniforms: U }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -21);
  ground.renderOrder = -1;
  scene.add(ground, blades);

  // Placement : densité régulière au sol sur tout le champ visible (plus large au loin), plaques plus hautes.
  let quality = bot ? .3 : 1, placedAspect = 0;
  const place = (aspect: number) => {
    placedAspect = aspect;
    const a = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect, b = .7;
    const F = (d: number) => a * d * d / 2 + b * d;
    const n = Math.min(MAX, Math.round(2 * (F(FAR) - F(NEAR)) * RHO * quality));
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
    attrA.needsUpdate = true; attrB.needsUpdate = true;
    geo.instanceCount = n;
  };

  // Couleurs : on glisse d'une apparence à l'autre.
  const cur: Pal = JSON.parse(JSON.stringify(PAL[palKey()]));
  let target = PAL[palKey()];
  const apply = () => {
    U.uRoot.value.set(...cur.root); U.uMid.value.set(...cur.mid); U.uTip.value.set(...cur.tip); U.uDry.value.set(...cur.dry);
    U.uGround.value.set(...cur.ground); U.uAmb.value.set(...cur.amb); U.uSunCol.value.set(...cur.sun); U.uHaze.value.set(...cur.haze);
    U.uSunDir.value.set(...cur.dir).normalize();
    U.uTrans.value = cur.trans; U.uOpacity.value = cur.opacity; U.uLampOn.value = cur.lamp;
  };
  const blend = (k: number) => {
    const mix = (x: number[], y: number[]) => { for (let i = 0; i < x.length; i++) x[i] += (y[i] - x[i]) * k; };
    for (const key of ["root", "mid", "tip", "dry", "ground", "amb", "sun", "dir", "haze"] as const) mix(cur[key], target[key]);
    cur.trans += (target.trans - cur.trans) * k; cur.opacity += (target.opacity - cur.opacity) * k; cur.lamp += (target.lamp - cur.lamp) * k;
    apply();
  };
  apply();

  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    U.uRes.value.set(w * dpr, h * dpr);
    // La barre d'adresse du téléphone change la hauteur sans arrêt : on ne replace les brins que si le cadre change vraiment.
    if (!placedAspect || Math.abs(camera.aspect / placedAspect - 1) > .12) place(camera.aspect);
  };
  resize();

  // Pointeur : on projette sur le champ, à mi-hauteur des brins.
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.45), hit = new THREE.Vector3(), ndc = new THREE.Vector2();
  const last = new THREE.Vector3(); let slot = 0, hasLast = false;
  const lampTo = new THREE.Vector2(.5, .22); let lampSeen = 0;
  const poke = (cx: number, cy: number, s = 1) => {
    if (still()) return;
    lampTo.set(cx / window.innerWidth, 1 - cy / window.innerHeight); lampSeen = performance.now();
    ndc.set(cx / window.innerWidth * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hit)) return;
    const d = -hit.z;
    if (d < NEAR * .6 || d > FAR) return;
    const r = .32 + d * .045, m = U.uTouch.value[slot];
    if (hasLast && hit.distanceTo(last) < r * .35 && m.z > .2) m.set(hit.x, hit.z, Math.min(1, m.z + .25 * s), r);
    else { slot = (slot + 1) % 16; U.uTouch.value[slot].set(hit.x, hit.z, s, r); }
    last.copy(hit); hasLast = true;
  };
  const onMove = (e: PointerEvent) => poke(e.clientX, e.clientY, e.pointerType === "touch" ? 1 : .9);
  const onTouch = (e: TouchEvent) => { const t = e.touches[0]; if (t) poke(t.clientX, t.clientY); };
  let gustScroll = 0, lastY = window.scrollY;
  const onScroll = () => { const y = window.scrollY; gustScroll = Math.min(.9, gustScroll + Math.abs(y - lastY) * .0016); lastY = y; };

  // Boucle : vent, retour des brins, glissement des couleurs ; qualité réduite si l'appareil peine.
  let raf = 0, prev = 0, warm = 0, acc = 0, frames = 0, shown = false;
  const draw = () => { renderer.render(scene, camera); if (!shown) { shown = true; canvas.classList.add("is-on"); } };
  // Téléphones et tablettes : 30 images par seconde suffisent pour de l'herbe au vent, la batterie dit merci.
  const minGap = coarse ? 30 : 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (prev && now - prev < minGap) return;
    const dt = prev ? Math.min(.05, (now - prev) / 1000) : .016;
    prev = now;
    const t = (U.uTime.value += dt);
    const wa = -.65 + Math.sin(t * .05) * .5;
    U.uWind.value.set(Math.cos(wa), Math.sin(wa));
    gustScroll *= Math.exp(-dt * 1.4);
    U.uWindStr.value = .5 + Math.sin(t * .13) * .12 + gustScroll;
    for (const m of U.uTouch.value) m.z *= Math.exp(-dt / 1.5);
    // Frontale : le faisceau suit le pointeur, puis balaie doucement le sentier quand on ne bouge plus.
    const idle = now - lampSeen > 2500;
    const lx = idle ? .5 + Math.sin(t * .35) * .22 : lampTo.x, ly = idle ? .2 + Math.sin(t * .23) * .05 : lampTo.y;
    U.uLamp.value.x += (lx - U.uLamp.value.x) * Math.min(1, dt * 6);
    U.uLamp.value.y += (ly - U.uLamp.value.y) * Math.min(1, dt * 6);
    blend(Math.min(1, dt * 3));
    draw();
    warm += dt;
    if (warm > 2.5) {
      acc += dt; frames++;
      if (frames >= 90) {
        const avg = acc / frames; acc = 0; frames = 0;
        if (avg > (coarse ? .045 : .024) && quality > .3) {
          quality *= .7;
          if (dpr > 1) { dpr = Math.max(1, dpr - .25); renderer.setPixelRatio(dpr); }
          placedAspect = 0; resize();
        }
      }
    }
  };
  const run = () => { if (raf || still() || document.hidden) return; prev = 0; raf = requestAnimationFrame(frame); };
  const halt = () => { cancelAnimationFrame(raf); raf = 0; };
  const refresh = () => { if (still()) { halt(); Object.assign(cur, JSON.parse(JSON.stringify(target))); apply(); draw(); } else run(); };

  const onTheme = () => { target = PAL[palKey()]; if (still()) { window.clearTimeout(redraw); redraw = window.setTimeout(refresh, 120); } };
  const mo = new MutationObserver(onTheme);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-ap"] });
  // Image fixe : on ne redessine qu'une fois le redimensionnement terminé.
  let redraw = 0;
  const onResize = () => { resize(); if (still()) { window.clearTimeout(redraw); redraw = window.setTimeout(draw, 250); } };
  const onVis = () => (document.hidden ? halt() : run());
  window.addEventListener("resize", onResize);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onMove, { passive: true });
  window.addEventListener("touchmove", onTouch, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", onVis);
  reduce.addEventListener("change", refresh);
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); halt(); });
  canvas.addEventListener("webglcontextrestored", () => refresh());
  refresh();

  return () => {
    halt(); mo.disconnect(); window.clearTimeout(redraw);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onMove);
    window.removeEventListener("touchmove", onTouch);
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVis);
    reduce.removeEventListener("change", refresh);
    geo.dispose(); (blades.material as import("three").Material).dispose();
    ground.geometry.dispose(); (ground.material as import("three").Material).dispose();
    renderer.dispose(); canvas.remove();
  };
}
