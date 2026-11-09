"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export type ZoneKey = "glutes" | "hipflex" | "adductors" | "quads" | "hamstrings" | "knees" | "shins" | "calves" | "ankles" | "feet" | "lumbar" | "core";
interface Props { intensity: Record<ZoneKey, number>; selected: ZoneKey | null; onSelect: (z: ZoneKey | null) => void; view: "front" | "back"; skin: boolean }
interface Manifest {
  version: number; bytes: number; min: [number, number, number]; scale: [number, number, number];
  offsets: { positions: number; normals: number; indices: number }; credit: string;
  parts: { n: string; g: "skin" | "bone" | "muscle"; z: ZoneKey | null; s: string; v: number; vc: number; i: number; ic: number }[];
}

/**
 * Corps humain complet issu de l’atlas anatomique BodyParts3D (CC BY 4.0) : peau translucide,
 * squelette et muscles réels. Les muscles de chaque zone prennent la couleur de leur sollicitation.
 */
export default function Body3D({ intensity, selected, onSelect, view, skin }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState<number | null>(0);
  const [failed, setFailed] = useState(false);
  const api = useRef<{ paint: (i: Props["intensity"], s: ZoneKey | null) => void; turn: (v: "front" | "back") => void; focus: (z: ZoneKey | null) => void; skin: (on: boolean) => void } | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const latest = useRef({ intensity, selected, view, skin });
  latest.current = { intensity, selected, view, skin };

  useEffect(() => {
    const el = host.current!;
    let disposed = false;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
    scene.add(new THREE.HemisphereLight(0xf2f5f8, 0x2a1f1c, 1.25));
    const key = new THREE.DirectionalLight(0xfff4ea, 2.6); key.position.set(1.4, 2.6, 2.4); scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd6ff, 0.8); fill.position.set(-2, 1.2, 1.5); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xff8a4c, 1.4); rim.position.set(-1.2, 1.6, -2.6); scene.add(rim);

    const pivot = new THREE.Group(); scene.add(pivot);
    const body = new THREE.Group(); pivot.add(body);

    // ---------- Matériaux ----------
    const MUSCLE = new THREE.Color(0x9a3b34), MUSCLE_DIM = new THREE.Color(0x7b3a35);
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.72, metalness: 0 });
    const plainMuscle = new THREE.MeshStandardMaterial({ color: MUSCLE_DIM, roughness: 0.55, metalness: 0.02 });
    const zoneMats = new Map<ZoneKey, THREE.MeshStandardMaterial>();
    const skinMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(0xcfe3ff) }, uStrength: { value: 0.55 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.6); gl_FragColor = vec4(uColor, f * uStrength); }`,
    });

    const zoneMeshes: THREE.Mesh[] = [];
    const zoneCenters = new Map<ZoneKey, THREE.Vector3>();
    let skinMesh: THREE.Mesh | null = null;
    let introAt = 0; // entrée en scène : squelette, muscles, peau, puis les zones s’allument
    let shadowMat: THREE.MeshBasicMaterial | null = null;
    const fitDistance = () => height * (camera.aspect < 0.85 ? 2.75 : 2.35);
    let height = 1.75, center = new THREE.Vector3(0, 0.88, 0);

    // ---------- Caméra et interaction ----------
    let rotY = 0, target = 0, dragging = false, moved = 0, lastX = 0, auto = !reduce, lastTouch = 0;
    const cam = { y: 0.95, d: 4.1, ty: 0.95, td: 4.1 };
    const placeCamera = () => { camera.position.set(0, cam.y + 0.05, cam.d); camera.lookAt(0, cam.y, 0); };
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const pick = (x: number, y: number) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return (ray.intersectObjects(zoneMeshes, false)[0]?.object.userData.zone as ZoneKey | undefined) ?? null;
    };
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch0 = 0, pinchD = 0;
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      renderer.domElement.setPointerCapture(e.pointerId);
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); pinchD = cam.td; }
      dragging = true; moved = 0; lastX = e.clientX; auto = false; lastTouch = performance.now();
    };
    const move = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); cam.td = THREE.MathUtils.clamp(pinchD * (pinch0 / Math.max(1, d)), 1.1, 4.6); moved = 99; return; }
      if (dragging) { const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx); target += dx * 0.009; }
      else renderer.domElement.style.cursor = pick(e.clientX, e.clientY) ? "pointer" : "grab";
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) { dragging = false; if (moved < 6) onSelectRef.current(pick(e.clientX, e.clientY)); }
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); cam.td = THREE.MathUtils.clamp(cam.td * (1 + e.deltaY * 0.0012), 1.1, 4.6); };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointercancel", up);
    renderer.domElement.addEventListener("wheel", wheel, { passive: false });
    renderer.domElement.style.touchAction = "pan-y";

    // ---------- Couleurs ----------
    const cool = new THREE.Color(), ember = new THREE.Color(), hot = new THREE.Color(0xe0242b), tmp = new THREE.Color();
    let current: { i: Props["intensity"]; s: ZoneKey | null } = { i: latest.current.intensity, s: latest.current.selected };
    const paint = (i: Props["intensity"], s: ZoneKey | null) => {
      current = { i, s };
      if (introAt && s) { introAt = 0; boneMat.transparent = false; boneMat.opacity = 1; boneMat.needsUpdate = true; pivot.position.y = 0; }
      if (introAt) return;
      const light = document.documentElement.dataset.theme === "light";
      cool.set(light ? 0x6f8fb0 : 0x4f7ca8); ember.set(0xff6a2b);
      skinMat.uniforms.uColor.value.set(light ? 0x3c4650 : 0xcfe3ff);
      skinMat.uniforms.uStrength.value = light ? 0.45 : 0.55;
      if (shadowMat) shadowMat.opacity = light ? 0.07 : 0.22;
      for (const [z, m] of zoneMats) {
        const v = i[z] ?? 0;
        // Sous ta moyenne : muscle naturel teinté de bleu ; au-dessus : braise puis rouge vif.
        if (v < 0.35) tmp.copy(MUSCLE).lerp(cool, ((0.35 - v) / 0.35) * 0.55);
        else if (v < 0.7) tmp.copy(MUSCLE).lerp(ember, (v - 0.35) / 0.35);
        else tmp.copy(ember).lerp(hot, (v - 0.7) / 0.3);
        m.color.copy(tmp);
        m.emissive.copy(tmp).multiplyScalar(s === z ? 0.55 : v >= 0.35 ? 0.12 + (v - 0.35) * 0.35 : 0.02);
        m.transparent = s != null && s !== z; m.opacity = m.transparent ? 0.42 : 1; m.depthWrite = !m.transparent;
        m.needsUpdate = true;
      }
      plainMuscle.transparent = s != null; plainMuscle.opacity = s ? 0.35 : 1; plainMuscle.depthWrite = !s; plainMuscle.needsUpdate = true;
    };
    const focus = (z: ZoneKey | null) => {
      const c = z ? zoneCenters.get(z) : null;
      if (c) { cam.ty = c.y; cam.td = Math.max(1.5, Math.min(2.4, height * 1.2)); }
      else { cam.ty = center.y; cam.td = fitDistance(); }
    };

    // ---------- Chargement du modèle ----------
    (async () => {
      try {
        const m: Manifest = await (await fetch("/xray/body.json")).json();
        const res = await fetch("/xray/body.bin");
        if (!res.ok || !res.body) throw new Error("modèle");
        const reader = res.body.getReader();
        const bin = new Uint8Array(m.bytes);
        let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done || disposed) break;
          const n = Math.max(0, Math.min(value.length, m.bytes - got));
          bin.set(value.subarray(0, n), got);
          got += value.length;
          setProgress(Math.min(99, Math.round((got / m.bytes) * 100)));
        }
        if (disposed) return;
        const P = new Int16Array(bin.buffer, m.offsets.positions, (m.offsets.normals - m.offsets.positions) / 2);
        const N = new Int8Array(bin.buffer, m.offsets.normals, P.length);
        const I = new Uint16Array(bin.buffer, m.offsets.indices, (m.bytes - m.offsets.indices) / 2);
        const deq = (q: number, k: number) => (q + 32767) * m.scale[k] + m.min[k];

        // Regroupement par (couche, zone) : peu d’appels de dessin, sélection par zone.
        const groups = new Map<string, Manifest["parts"]>();
        for (const p of m.parts) { const k = `${p.g}|${p.z ?? ""}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(p); }
        const box = new THREE.Box3();
        for (const [k, parts] of groups) {
          const [g, z] = k.split("|") as [Manifest["parts"][number]["g"], ZoneKey | ""];
          const vc = parts.reduce((s, p) => s + p.vc, 0), ic = parts.reduce((s, p) => s + p.ic, 0);
          const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), idx = new Uint32Array(ic);
          let vo = 0, io = 0;
          for (const p of parts) {
            for (let v = 0; v < p.vc; v++) for (let c = 0; c < 3; c++) {
              pos[(vo + v) * 3 + c] = deq(P[(p.v + v) * 3 + c], c);
              nor[(vo + v) * 3 + c] = N[(p.v + v) * 3 + c] / 127;
            }
            for (let i = 0; i < p.ic; i++) idx[io + i] = I[p.i + i] + vo;
            vo += p.vc; io += p.ic;
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
          geo.setIndex(new THREE.BufferAttribute(idx, 1));
          geo.computeBoundingBox(); geo.computeBoundingSphere();
          let material: THREE.Material;
          if (g === "skin") material = skinMat;
          else if (g === "bone") material = boneMat;
          else if (z) { if (!zoneMats.has(z)) zoneMats.set(z, new THREE.MeshStandardMaterial({ color: MUSCLE, roughness: 0.5, metalness: 0.02 })); material = zoneMats.get(z)!; }
          else material = plainMuscle;
          const mesh = new THREE.Mesh(geo, material);
          if (g === "skin") { mesh.renderOrder = 10; skinMesh = mesh; mesh.visible = latest.current.skin; }
          if (g === "muscle" && z) { mesh.userData.zone = z; zoneMeshes.push(mesh); zoneCenters.set(z, geo.boundingBox!.getCenter(new THREE.Vector3())); }
          body.add(mesh);
          box.union(geo.boundingBox!);
        }
        // Centrage, et le corps face à la caméra (les quadriceps devant les fessiers).
        const c = box.getCenter(new THREE.Vector3());
        body.position.set(-c.x, -box.min.y, -c.z);
        for (const v of zoneCenters.values()) v.add(body.position);
        height = box.max.y - box.min.y; center = new THREE.Vector3(0, height / 2, 0);
        const q = zoneCenters.get("quads"), gl = zoneCenters.get("glutes");
        if (q && gl && q.z < gl.z) { body.rotation.y = Math.PI; body.position.x *= -1; body.position.z *= -1; for (const v of zoneCenters.values()) v.set(-v.x, v.y, -v.z); }
        cam.y = cam.ty = center.y; cam.d = cam.td = fitDistance();
        shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.36, 64), shadowMat);
        shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; pivot.add(shadow);
        paint(latest.current.intensity, latest.current.selected);
        if (latest.current.selected) focus(latest.current.selected);
        if (!reduce && !latest.current.selected) {
          introAt = performance.now();
          for (const mm of [boneMat, plainMuscle, ...zoneMats.values()]) { mm.transparent = true; mm.opacity = 0; mm.needsUpdate = true; }
          cam.d = cam.td * 1.18;
        }
        setProgress(null);
      } catch { if (!disposed) setFailed(true); }
    })();

    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    const mo = new MutationObserver(() => paint(current.i, current.s));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    let raf = 0, visible = true;
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }); io.observe(el);
    const t0 = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      // Rotation lente au repos, qui reprend quelques secondes après la dernière manipulation.
      if (!auto && !reduce && !dragging && !current.s && lastTouch && now - lastTouch > 7000) auto = true;
      if (auto) target += 0.003;
      rotY += (target - rotY) * 0.1;
      pivot.rotation.y = rotY;
      cam.y += (cam.ty - cam.y) * 0.08; cam.d += (cam.td - cam.d) * 0.08; placeCamera();
      if (introAt) {
        const e = (now - introAt) / 1000;
        const ease = (a: number, d: number) => { const x = THREE.MathUtils.clamp((e - a) / d, 0, 1); return 1 - Math.pow(1 - x, 3); };
        boneMat.opacity = ease(0, 0.7);
        const mus = ease(0.45, 0.8);
        plainMuscle.opacity = mus;
        skinMat.uniforms.uStrength.value = (document.documentElement.dataset.theme === "light" ? 0.45 : 0.55) * ease(1.0, 0.7);
        pivot.position.y = (1 - ease(0, 1.2)) * -0.06;
        // Les zones les plus sollicitées s’allument en premier, avec un éclat qui retombe.
        const order = [...zoneMats.keys()].sort((a, b) => (current.i[b] ?? 0) - (current.i[a] ?? 0));
        order.forEach((z, k) => {
          const mm = zoneMats.get(z)!, start = 1.25 + k * 0.11;
          mm.opacity = Math.max(mus * 0.85, ease(start, 0.35));
          const flash = e > start ? Math.exp(-(e - start) * 3.2) * Math.min(1, (e - start) * 8) : 0;
          mm.emissive.copy(mm.color).multiplyScalar(0.12 + flash * 0.9 * Math.max(0.35, current.i[z] ?? 0));
        });
        if (e > 1.25 + order.length * 0.11 + 1) {
          introAt = 0;
          boneMat.transparent = false; boneMat.opacity = 1; boneMat.needsUpdate = true;
          pivot.position.y = 0;
          paint(current.i, current.s);
        }
      }
      if (current.s) { const p = 0.45 + Math.sin((now - t0) / 260) * 0.15; const mm = zoneMats.get(current.s); if (mm) mm.emissive.copy(mm.color).multiplyScalar(p); }
      else if (!introAt && !reduce) {
        // Les zones les plus chargées « respirent » doucement.
        const breath = 0.5 + 0.5 * Math.sin((now - t0) / 700);
        for (const [z, mm] of zoneMats) { const v = current.i[z] ?? 0; if (v >= 0.7) mm.emissive.copy(mm.color).multiplyScalar(0.12 + (v - 0.35) * 0.35 + breath * 0.22 * (v - 0.6)); }
      }
      renderer.render(scene, camera);
    };
    placeCamera();
    raf = requestAnimationFrame(loop);

    api.current = {
      paint,
      turn: (v) => { auto = false; const base = Math.round(target / (Math.PI * 2)) * Math.PI * 2; target = base + (v === "back" ? Math.PI : 0); },
      focus,
      skin: (on) => { if (skinMesh) skinMesh.visible = on; },
    };
    return () => {
      disposed = true;
      cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); io.disconnect();
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointercancel", up);
      renderer.domElement.removeEventListener("wheel", wheel);
      scene.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((mm) => mm.dispose()); } });
      renderer.dispose(); el.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => { api.current?.paint(intensity, selected); api.current?.focus(selected); }, [intensity, selected]);
  useEffect(() => { api.current?.turn(view); }, [view]);
  useEffect(() => { api.current?.skin(skin); }, [skin]);

  return (
    <div className="body3d" aria-hidden="true">
      <div ref={host} className="body3d-canvas" />
      {failed ? <div className="body3d-loading"><span>Le modèle 3D n’a pas pu être chargé. Le détail par zone reste disponible.</span></div>
        : progress != null && <div className="body3d-loading"><span>Chargement du modèle anatomique… {progress} %</span><i className="body3d-bar"><b style={{ width: `${progress}%` }} /></i></div>}
    </div>
  );
}
