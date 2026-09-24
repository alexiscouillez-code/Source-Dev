import { createRunner } from "./avatar.ts";
import {
  cameraFor,
  pointAtKm,
  segmentIndexAtKm,
  segmentProfiles,
  segmentStartKm,
  type ProfilePoint,
} from "./profile.ts";
import { totalKm } from "./races.ts";
import type { Avatar, Landmark, Race, Terrain } from "./types.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  return node;
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

const TERRAIN_STROKE: Record<Terrain, string> = {
  valley: "#d7e2c3",
  forest: "#c5d7b4",
  alpine: "#e4d4a4",
  rock: "#ddd6cc",
  snow: "#f7fbfd",
};

export function drawWorld(
  svg: SVGSVGElement,
  race: Race,
  points: ProfilePoint[],
  visualKm: number,
  avatar: Avatar,
  moving: boolean,
): void {
  svg.replaceChildren();
  const total = totalKm(race);
  const camera = cameraFor(total, Math.min(total, Math.max(0, visualKm)));
  const uid = "world";

  const defs = el("defs", {});
  const sky = el("linearGradient", { id: `${uid}-sky`, x1: "0", y1: "0", x2: "0", y2: "1" });
  sky.append(el("stop", { offset: "0", "stop-color": "#7eafd0" }));
  sky.append(el("stop", { offset: "0.55", "stop-color": "#d7e6f0" }));
  sky.append(el("stop", { offset: "1", "stop-color": "#f3dcc8" }));
  const ground = el("linearGradient", {
    id: `${uid}-ground`,
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
  });
  ground.append(el("stop", { offset: "0", "stop-color": "#8eaa72" }));
  ground.append(el("stop", { offset: "1", "stop-color": "#3d5340" }));
  defs.append(sky, ground);
  svg.append(defs);

  svg.append(el("rect", { width: "960", height: "420", fill: `url(#${uid}-sky)` }));
  svg.append(el("circle", { cx: "790", cy: "74", r: "46", fill: "#f6e2b0", opacity: "0.35" }));
  svg.append(el("circle", { cx: "790", cy: "74", r: "26", fill: "#f8e7c0" }));

  const shift = (camera.start / Math.max(total, 1)) * 80;
  svg.append(
    el("path", {
      d: ridge(4, 214, 58, shift * 0.35),
      fill: "#c5d0d4",
    }),
  );
  svg.append(
    el("path", {
      d: ridge(9, 248, 46, shift * 0.7),
      fill: "#8ea0a4",
    }),
  );

  const sliced = sliceProfile(points, camera.start, camera.end);
  const range = altitudeRange(sliced);
  const xFor = (km: number) =>
    36 + ((km - camera.start) / Math.max(camera.end - camera.start, 0.001)) * 888;
  const yFor = (alt: number) => {
    const t = (alt - range.min) / Math.max(range.max - range.min, 1);
    return 360 - t * 300;
  };

  const groundPath = pathFrom(sliced, xFor, yFor) + " L924 420 L36 420 Z";
  svg.append(el("path", { d: groundPath, fill: `url(#${uid}-ground)` }));

  drawSegments(svg, race, camera, xFor, yFor, visualKm);
  drawProps(svg, race, camera, xFor, yFor, points);
  drawLandmarks(svg, race, camera, xFor, yFor, points);
  drawAvatar(svg, points, visualKm, xFor, yFor, avatar, moving);
  drawTicks(svg, camera, xFor);

  const place = placeName(race, visualKm);
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    `Profil de ${race.short}, coureur au kilomètre ${visualKm.toFixed(1).replace(".", ",")} vers ${place}`,
  );
  svg.dataset.avatarKm = visualKm.toFixed(2);
}

export function drawMinimap(
  svg: SVGSVGElement,
  race: Race,
  points: ProfilePoint[],
  visualKm: number,
): void {
  svg.replaceChildren();
  const total = totalKm(race);
  const camera = cameraFor(total, Math.min(total, Math.max(0, visualKm)));
  const range = altitudeRange(points);
  const xFor = (km: number) => 8 + (km / Math.max(total, 0.001)) * 944;
  const yFor = (alt: number) => {
    const t = (alt - range.min) / Math.max(range.max - range.min, 1);
    return 52 - t * 40;
  };
  svg.append(el("rect", { width: "960", height: "72", fill: "#efe8dc" }));
  const d = pathFrom(points, xFor, yFor);
  svg.append(el("path", { d: `${d} L${xFor(total)} 64 L8 64 Z`, fill: "#d5e0cc" }));
  svg.append(
    el("path", {
      d,
      fill: "none",
      stroke: "#1f4d3a",
      "stroke-width": "2",
    }),
  );
  const x0 = xFor(camera.start);
  const x1 = xFor(camera.end);
  svg.append(
    el("rect", {
      x: String(x0),
      y: "6",
      width: String(Math.max(2, x1 - x0)),
      height: "52",
      fill: "rgba(184, 90, 50, 0.16)",
      stroke: "#8d3d22",
      "stroke-width": "1",
    }),
  );
  const ax = xFor(Math.min(total, visualKm));
  svg.append(
    el("line", {
      x1: String(ax),
      y1: "8",
      x2: String(ax),
      y2: "58",
      stroke: "#8d3d22",
      "stroke-width": "2",
    }),
  );
  svg.append(text("8", "68", "0", "start"));
  svg.append(text("952", "68", `${total} km`, "end"));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Profil entier, ${total} kilomètres`);
}

function drawSegments(
  svg: SVGSVGElement,
  race: Race,
  camera: { start: number; end: number },
  xFor: (km: number) => number,
  yFor: (alt: number) => number,
  visualKm: number,
): void {
  const lines = segmentProfiles(race);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const segment = race.segments[i];
    if (!line || !segment) continue;
    const start = segmentStartKm(race, i);
    const end = start + segment.km;
    if (end < camera.start || start > camera.end) continue;
    const visible = line.filter(
      (point) => point.km >= camera.start - 0.02 && point.km <= camera.end + 0.02,
    );
    if (visible.length < 2) continue;
    const d = pathFrom(visible, xFor, yFor);
    const status =
      visualKm >= end - 0.001 ? "done" : visualKm >= start - 0.001 ? "current" : "ahead";
    svg.append(
      el("path", {
        d,
        fill: "none",
        stroke: TERRAIN_STROKE[segment.terrain],
        "stroke-width": "11",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
    );
    svg.append(
      el("path", {
        d,
        fill: "none",
        stroke:
          status === "current"
            ? "#e2a13a"
            : status === "done"
              ? "#fffaf3"
              : "rgba(255,250,243,0.45)",
        "stroke-width": "2.4",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
    );
  }
}

function drawProps(
  svg: SVGSVGElement,
  race: Race,
  camera: { start: number; end: number },
  xFor: (km: number) => number,
  yFor: (alt: number) => number,
  points: ProfilePoint[],
): void {
  for (let km = camera.start; km < camera.end; km += 0.85) {
    const point = pointAtKm(points, km);
    const index = segmentIndexAtKm(race, km);
    const segment = race.segments[index];
    if (!segment) continue;
    const x = xFor(km);
    const y = yFor(point.alt);
    const seed = Math.round(km * 10);
    if ((segment.terrain === "forest" || segment.terrain === "valley") && point.alt < 1900) {
      if (hash(seed) > 0.35) drawTree(svg, x, y, seed);
    } else if (point.alt > 2300 && hash(seed) > 0.4) {
      drawSnowCap(svg, x, y);
    } else if (
      (segment.terrain === "rock" || segment.terrain === "alpine") &&
      hash(seed) > 0.55
    ) {
      drawRock(svg, x, y, seed);
    }
  }
}

function drawTree(svg: SVGSVGElement, x: number, y: number, seed: number): void {
  const h = 16 + hash(seed + 3) * 12;
  svg.append(
    el("line", {
      x1: String(x),
      y1: String(y),
      x2: String(x),
      y2: String(y - h * 0.38),
      stroke: "#5c4636",
      "stroke-width": "1.5",
    }),
  );
  svg.append(
    el("polygon", {
      points: `${x},${y - h} ${x - 7},${y - h * 0.32} ${x + 7},${y - h * 0.32}`,
      fill: hash(seed) > 0.5 ? "#2c5a38" : "#3f7348",
    }),
  );
}

function drawRock(svg: SVGSVGElement, x: number, y: number, seed: number): void {
  const w = 4 + hash(seed) * 4;
  svg.append(
    el("ellipse", {
      cx: String(x),
      cy: String(y - 2),
      rx: String(w),
      ry: "2.4",
      fill: "#8b837a",
    }),
  );
}

function drawSnowCap(svg: SVGSVGElement, x: number, y: number): void {
  svg.append(
    el("polygon", {
      points: `${x},${y - 14} ${x - 6},${y - 1} ${x + 6},${y - 1}`,
      fill: "#f7fbfd",
    }),
  );
}

function drawLandmarks(
  svg: SVGSVGElement,
  race: Race,
  camera: { start: number; end: number },
  xFor: (km: number) => number,
  yFor: (alt: number) => number,
  points: ProfilePoint[],
): void {
  const start = race.segments[0];
  if (start && camera.start <= 0 && camera.end >= 0) {
    placeMarker(svg, start.from, "village", pointAtKm(points, 0), xFor, yFor);
  }
  for (let i = 0; i < race.segments.length; i += 1) {
    const segment = race.segments[i];
    if (!segment) continue;
    const km = segmentStartKm(race, i) + segment.km;
    if (km < camera.start || km > camera.end) continue;
    placeMarker(svg, segment.to, segment.landmark, pointAtKm(points, km), xFor, yFor);
  }
}

function placeMarker(
  svg: SVGSVGElement,
  label: string,
  kind: Landmark,
  point: ProfilePoint,
  xFor: (km: number) => number,
  yFor: (alt: number) => number,
): void {
  const x = xFor(point.km);
  const y = yFor(point.alt);
  drawLandmarkIcon(svg, kind, x, y - 8);
  const anchor = x < 80 ? "start" : x > 880 ? "end" : "middle";
  const labelY = y < 70 ? y + 22 : y - 22;
  svg.append(text(String(x), String(labelY), label, anchor, true));
}

function drawLandmarkIcon(
  svg: SVGSVGElement,
  kind: Landmark,
  x: number,
  y: number,
): void {
  if (kind === "village") {
    svg.append(el("polygon", { points: `${x},${y - 10} ${x - 6},${y - 4} ${x + 6},${y - 4}`, fill: "#8d3d22" }));
    svg.append(el("rect", { x: String(x - 4), y: String(y - 4), width: "8", height: "6", fill: "#f4efe4" }));
    return;
  }
  if (kind === "lake") {
    svg.append(el("ellipse", { cx: String(x), cy: String(y - 2), rx: "8", ry: "3.2", fill: "#6aa4bc" }));
    return;
  }
  if (kind === "col") {
    svg.append(el("circle", { cx: String(x - 3), cy: String(y - 2), r: "2.2", fill: "#6e675f" }));
    svg.append(el("circle", { cx: String(x + 2), cy: String(y - 1), r: "2.6", fill: "#8a8178" }));
    svg.append(
      el("line", {
        x1: String(x),
        y1: String(y - 2),
        x2: String(x),
        y2: String(y - 12),
        stroke: "#f4efe4",
        "stroke-width": "1.2",
      }),
    );
    return;
  }
  if (kind === "summit") {
    svg.append(el("polygon", { points: `${x},${y - 12} ${x - 6},${y} ${x + 6},${y}`, fill: "#f7fbfd", stroke: "#8a8178", "stroke-width": "0.6" }));
    return;
  }
  svg.append(
    el("path", {
      d: `M${x - 6} ${y} L${x - 6} ${y - 10} Q${x} ${y - 16} ${x + 6} ${y - 10} L${x + 6} ${y}`,
      fill: "none",
      stroke: "#f7f3ea",
      "stroke-width": "1.6",
    }),
  );
}

function drawAvatar(
  svg: SVGSVGElement,
  points: ProfilePoint[],
  visualKm: number,
  xFor: (km: number) => number,
  yFor: (alt: number) => number,
  avatar: Avatar,
  moving: boolean,
): void {
  const here = pointAtKm(points, visualKm);
  const ahead = pointAtKm(points, visualKm + 0.2);
  const x = xFor(here.km);
  const y = yFor(here.alt);
  const x2 = xFor(ahead.km);
  const y2 = yFor(ahead.alt);
  const deg = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI;
  const lean = Math.max(-18, Math.min(18, deg));
  const actor = el("g", {
    class: moving ? "actor is-moving" : "actor",
    transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`,
  });
  actor.append(
    el("ellipse", {
      cx: "0",
      cy: "3",
      rx: "12",
      ry: "3.2",
      fill: "rgba(20, 28, 24, 0.25)",
    }),
  );
  const body = el("g", { transform: `scale(1.45) rotate(${lean.toFixed(1)})` });
  body.append(createRunner(avatar));
  actor.append(body);
  actor.dataset.km = visualKm.toFixed(2);
  svg.append(actor);
}

function drawTicks(
  svg: SVGSVGElement,
  camera: { start: number; end: number },
  xFor: (km: number) => number,
): void {
  const first = Math.ceil(camera.start / 5) * 5;
  for (let km = first; km < camera.end; km += 5) {
    const x = xFor(km);
    svg.append(
      el("line", {
        x1: String(x),
        y1: "400",
        x2: String(x),
        y2: "408",
        stroke: "rgba(255,250,243,0.7)",
        "stroke-width": "1",
      }),
    );
    svg.append(text(String(x), "418", String(km), "middle"));
  }
}

function sliceProfile(
  points: ProfilePoint[],
  start: number,
  end: number,
): ProfilePoint[] {
  const sliced: ProfilePoint[] = [pointAtKm(points, start)];
  for (const point of points) {
    if (point.km > start && point.km < end) sliced.push(point);
  }
  sliced.push(pointAtKm(points, end));
  return sliced;
}

function altitudeRange(points: ProfilePoint[]): { min: number; max: number } {
  const first = points[0];
  if (!first) return { min: 0, max: 1 };
  let min = first.alt;
  let max = first.alt;
  for (const point of points) {
    if (point.alt < min) min = point.alt;
    if (point.alt > max) max = point.alt;
  }
  const pad = Math.max(80, (max - min) * 0.22);
  return { min: min - pad, max: max + pad };
}

function pathFrom(
  points: ProfilePoint[],
  xFor: (km: number) => number,
  yFor: (alt: number) => number,
): string {
  return points
    .map((point, index) => {
      const cmd = index === 0 ? "M" : "L";
      return `${cmd}${xFor(point.km).toFixed(1)} ${yFor(point.alt).toFixed(1)}`;
    })
    .join(" ");
}

function ridge(seed: number, baseY: number, amp: number, shift: number): string {
  let d = "M0 420";
  for (let x = 0; x <= 960; x += 40) {
    const n = hash(seed + x);
    const y = baseY - amp * (0.35 + n) - Math.sin((x + shift) / 140) * amp * 0.35;
    d += ` L${x} ${y.toFixed(1)}`;
  }
  return `${d} L960 420 Z`;
}

function text(
  x: string,
  y: string,
  value: string,
  anchor: string,
  halo = false,
): SVGTextElement {
  const node = el("text", {
    x,
    y,
    "text-anchor": anchor,
    "font-size": halo ? "12" : "11",
    "font-family": "Outfit, system-ui, sans-serif",
    fill: halo ? "#1c2430" : "rgba(255,250,243,0.85)",
  });
  if (halo) {
    node.setAttribute("stroke", "#f7f3ea");
    node.setAttribute("stroke-width", "3");
    node.setAttribute("paint-order", "stroke");
  }
  node.textContent = value;
  return node;
}

function placeName(race: Race, visualKm: number): string {
  const index = segmentIndexAtKm(race, visualKm);
  return race.segments[index]?.to ?? "l'arrivée";
}
