import type { Avatar, Hair } from "./types.ts";

export const SKINS = ["#f3d2b5", "#e0b08a", "#c68642", "#8d5524"] as const;
export const SKIN_LABELS = ["Clair", "Pêche", "Doré", "Foncé"] as const;
export const JERSEYS = ["#2f5d9f", "#1f4d3a", "#c45c36", "#243044"] as const;
export const JERSEY_LABELS = ["Gentiane", "Sapin", "Rouille", "Nuit"] as const;

export const HAIR_OPTIONS: { id: Hair; label: string }[] = [
  { id: "court", label: "Courts" },
  { id: "chignon", label: "Chignon" },
  { id: "casquette", label: "Casquette" },
  { id: "rase", label: "Rasés" },
];

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

function colorAt(list: readonly string[], index: number, fallback: string): string {
  return list[index] ?? fallback;
}

export function createRunner(avatar: Avatar): SVGGElement {
  const skin = colorAt(SKINS, avatar.skin, "#e0b08a");
  const jersey = colorAt(JERSEYS, avatar.jersey, "#1f4d3a");
  const hair = "#2a2118";
  const ink = "#243044";

  const runner = el("g", { class: "runner" });
  const bob = el("g", { class: "bob" });
  runner.append(bob);

  bob.append(
    el("line", {
      x1: "-1",
      y1: "-16",
      x2: "-8",
      y2: "0",
      stroke: ink,
      "stroke-width": "3.1",
      "stroke-linecap": "round",
    }),
  );
  bob.append(
    el("line", {
      x1: "1",
      y1: "-16",
      x2: "9",
      y2: "-0.5",
      stroke: ink,
      "stroke-width": "3.1",
      "stroke-linecap": "round",
    }),
  );
  bob.append(
    el("line", {
      x1: "0",
      y1: "-27",
      x2: "0",
      y2: "-15",
      stroke: jersey,
      "stroke-width": "6.5",
      "stroke-linecap": "round",
    }),
  );
  bob.append(
    el("rect", {
      x: "-8",
      y: "-26",
      width: "5",
      height: "8",
      rx: "1.2",
      fill: "#6b4f3a",
    }),
  );
  bob.append(
    el("line", {
      x1: "1",
      y1: "-23",
      x2: "8",
      y2: "-18",
      stroke: jersey,
      "stroke-width": "2.4",
      "stroke-linecap": "round",
    }),
  );
  bob.append(el("circle", { cx: "1.5", cy: "-33", r: "5.3", fill: skin }));
  appendHair(bob, avatar.hair, hair, jersey);
  return runner;
}

function appendHair(
  parent: SVGGElement,
  style: Hair,
  hair: string,
  jersey: string,
): void {
  if (style === "court") {
    parent.append(
      el("path", {
        d: "M-3.2 -34.2 Q1.5 -40.5 7 -33.2 Q2 -35.5 -3.2 -34.2 Z",
        fill: hair,
      }),
    );
    return;
  }
  if (style === "chignon") {
    parent.append(
      el("path", {
        d: "M-2.4 -34 Q1.5 -39 6.4 -33.4 Q1.5 -35.2 -2.4 -34 Z",
        fill: hair,
      }),
    );
    parent.append(el("circle", { cx: "-3.2", cy: "-32.5", r: "2.5", fill: hair }));
    return;
  }
  if (style === "casquette") {
    parent.append(
      el("path", {
        d: "M-3.4 -34.5 Q1.4 -40 6.6 -33.6 L11.5 -33.2 L6.2 -31.6 Q1 -33.4 -3.4 -34.5 Z",
        fill: jersey,
      }),
    );
    parent.append(
      el("path", {
        d: "M-2.2 -35.2 Q1.4 -39.2 5.6 -34.4",
        fill: "none",
        stroke: "#142018",
        "stroke-width": "0.6",
      }),
    );
  }
}

export function runnerBadge(avatar: Avatar): SVGSVGElement {
  const svg = el("svg", {
    viewBox: "-16 -48 36 52",
    width: "36",
    height: "42",
    "aria-hidden": "true",
  });
  svg.append(createRunner(avatar));
  return svg;
}

export function fillPreview(svg: SVGSVGElement, avatar: Avatar): void {
  svg.replaceChildren();
  const defs = el("defs", {});
  const sky = el("linearGradient", { id: "preview-sky", x1: "0", y1: "0", x2: "0", y2: "1" });
  sky.append(el("stop", { offset: "0", "stop-color": "#8eb6d2" }));
  sky.append(el("stop", { offset: "1", "stop-color": "#f3dcc8" }));
  defs.append(sky);
  svg.append(defs);
  svg.append(el("rect", { width: "280", height: "220", fill: "url(#preview-sky)" }));
  svg.append(el("circle", { cx: "214", cy: "48", r: "16", fill: "#f6e2b0" }));
  svg.append(
    el("path", {
      d: "M0 168 C40 150 70 120 110 132 C150 144 170 168 210 150 C240 138 260 156 280 148 L280 220 L0 220 Z",
      fill: "#6d8f5c",
    }),
  );
  svg.append(
    el("path", {
      d: "M0 176 C50 166 90 150 140 160 C190 170 230 156 280 166",
      fill: "none",
      stroke: "#f7f3ea",
      "stroke-width": "2",
    }),
  );
  const actor = el("g", { transform: "translate(132 168) scale(1.85)" });
  actor.append(createRunner(avatar));
  svg.append(actor);
}
