"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { decodePolyline, type LatLon } from "@/lib/polyline";

export interface MapLine { poly: string; id?: number; highlight?: boolean; label?: string }
export interface MapMarker { at: LatLon; label: string; kind?: "start" | "finish" | "aid"; id?: number }

const LAYERS = {
  relief: { url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", max: 17, attr: "Carte © <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>, SRTM · style © <a href=\"https://opentopomap.org\">OpenTopoMap</a> (CC-BY-SA)" },
  plan: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", max: 19, attr: "© <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>" },
} as const;

/** Carte des tracés GPS : sorties ou parcours de course, avec fond relief ou plan. */
const NO_MARKERS: MapMarker[] = [];

export default function TrackMap({ lines, markers = NO_MARKERS, height = 320, onSelect, onPick, fitKey, focus, hover, label }: {
  lines: MapLine[]; markers?: MapMarker[]; height?: number; onSelect?: (id: number) => void; label: string;
  /** Clic sur la carte (hors tracé) : choisit un point. */
  onPick?: (lat: number, lon: number) => void;
  /** Si fourni, la carte ne se recadre que lorsque cette clé change. */
  fitKey?: string;
  /** Tracé (id) vers lequel la carte « vole » quand il change. */
  focus?: number | null;
  /** Point mis en évidence (survol du profil d’altitude). */
  hover?: LatLon | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const tiles = useRef<import("leaflet").TileLayer | null>(null);
  const group = useRef<import("leaflet").FeatureGroup | null>(null);
  const [layer, setLayer] = useState<keyof typeof LAYERS>("relief");
  const [ready, setReady] = useState(false);
  const sel = useRef(onSelect); sel.current = onSelect;
  const pick = useRef(onPick); pick.current = onPick;
  const fitted = useRef<string | null>(null);
  const focused = useRef<number | null | undefined>(undefined);
  const hoverDot = useRef<import("leaflet").CircleMarker | null>(null);
  const tracer = useRef<import("leaflet").CircleMarker | null>(null);
  const drawn = useRef(false);

  // Création de la carte (une fois).
  useEffect(() => {
    let off = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (off || !el.current || map.current) return;
      const m = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
      m.on("focus", () => m.scrollWheelZoom.enable());
      m.on("blur", () => m.scrollWheelZoom.disable());
      m.on("click", (e) => pick.current?.(e.latlng.lat, e.latlng.lng));
      map.current = m; group.current = L.featureGroup().addTo(m);
      setReady(true);
    })();
    return () => { off = true; map.current?.remove(); map.current = null; };
  }, []);

  // Fond de carte.
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const L = (await import("leaflet")).default;
      tiles.current?.remove();
      const t = LAYERS[layer];
      tiles.current = L.tileLayer(t.url, { maxZoom: t.max, attribution: t.attr, subdomains: "abc", crossOrigin: true }).addTo(map.current!);
    })();
  }, [layer, ready]);

  // Tracés et repères.
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const L = (await import("leaflet")).default;
      const g = group.current!; g.clearLayers();
      const css = getComputedStyle(document.documentElement);
      const ember = css.getPropertyValue("--ember").trim() || "#ff6a2b";
      const many = lines.length > 1;
      const sorted = [...lines].sort((a, b) => Number(!!a.highlight) - Number(!!b.highlight));
      // Premier affichage : les tracés se dessinent du départ à l’arrivée, puis les repères apparaissent.
      const animate = !drawn.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      drawn.current = true;
      // Leaflet ne crée les éléments SVG qu’une fois la vue définie : on les récupère après le recadrage.
      const drawnLines: import("leaflet").Polyline[] = [], dots: import("leaflet").CircleMarker[] = [];
      // Un point « coureur » parcourt le tracé à vitesse régulière, du départ à l’arrivée.
      const runTracer = (L: typeof import("leaflet"), m: import("leaflet").Map, pts: import("leaflet").LatLng[], D: number) => {
        tracer.current?.remove();
        const dot = L.circleMarker(pts[0], { radius: 6, color: "#fff", weight: 3, fillColor: "#ff6a2b", fillOpacity: 1, interactive: false, className: "tm-tracer" }).addTo(m);
        tracer.current = dot;
        // Distances cumulées : le point avance à vitesse régulière le long du tracé.
        const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i - 1].distanceTo(pts[i]));
        const total = cum[cum.length - 1] || 1, t0 = performance.now();
        const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
        const step = (now: number) => {
          if (tracer.current !== dot) return;
          const k = Math.min(1, (now - t0) / D), d = ease(k) * total;
          let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
          const f = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
          dot.setLatLng([pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * f, pts[i - 1].lng + (pts[i].lng - pts[i - 1].lng) * f]);
          if (k < 1) requestAnimationFrame(step); else setTimeout(() => { if (tracer.current === dot) { dot.remove(); tracer.current = null; } }, 500);
        };
        requestAnimationFrame(step);
      };
      for (const l of sorted) {
        let pts: LatLon[] = [];
        try { pts = decodePolyline(l.poly); } catch { continue; }
        if (pts.length < 2) continue;
        const pl = L.polyline(pts, { color: l.highlight || !many ? ember : "#3b82f6", weight: l.highlight || !many ? 4 : 2.5, opacity: l.highlight || !many ? 0.95 : 0.55, lineJoin: "round", className: l.highlight && many ? "tm-sel" : undefined });
        (pl as unknown as { _tpId?: number })._tpId = l.id;
        if (l.label) pl.bindTooltip(l.label, { sticky: true });
        if (l.id != null && sel.current) pl.on("click", (ev) => { L.DomEvent.stopPropagation(ev); sel.current?.(l.id!); });
        pl.addTo(g);
        drawnLines.push(pl);
      }
      for (const mk of markers) {
        const color = mk.kind === "start" ? "#22c55e" : mk.kind === "finish" ? "#e5383b" : "#f4efe6";
        const dot = L.circleMarker(mk.at, { radius: mk.kind === "aid" ? (mk.id != null ? 7 : 5) : 6, color: "#0b0f14", weight: 2, fillColor: color, fillOpacity: 1 }).bindTooltip(mk.label).addTo(g);
        if (mk.id != null && sel.current) dot.on("click", (ev) => { L.DomEvent.stopPropagation(ev); sel.current?.(mk.id!); });
        dots.push(dot);
      }
      const b = g.getBounds();
      const refit = fitKey === undefined || fitted.current !== fitKey;
      // La carte vole vers le tracé choisi (sans recadrage complet).
      if (!refit && focus != null && focus !== focused.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const target = drawnLines.find((x) => (x as unknown as { _tpId?: number })._tpId === focus);
        if (target) {
          const m = map.current!;
          m.flyToBounds(target.getBounds(), { padding: [30, 30], maxZoom: 16, duration: 0.9 });
          // Une fois la carte posée, le parcours se dessine du départ à l’arrivée, suivi par un point.
          m.once("moveend", () => {
            const path = (target as unknown as { _path?: SVGPathElement })._path;
            const pts = (target.getLatLngs() as import("leaflet").LatLng[]).flat() as import("leaflet").LatLng[];
            if (!path || pts.length < 2 || !path.isConnected) return;
            const len = path.getTotalLength(), D = Math.min(2200, Math.max(900, len * 2.2));
            path.animate([{ strokeDasharray: `${len} ${len}`, strokeDashoffset: len }, { strokeDasharray: `${len} ${len}`, strokeDashoffset: 0 }], { duration: D, easing: "cubic-bezier(.45, 0, .2, 1)" });
            runTracer(L, m, pts, D);
          });
        }
      }
      focused.current = focus;
      if (refit) {
        fitted.current = fitKey ?? null;
        if (b.isValid()) map.current!.fitBounds(b, { padding: [18, 18], maxZoom: 15, animate: !animate });
        else map.current!.setView([46.6, 2.4], 5);
      }
      if (animate) {
        // Le tracé n’est mis en place qu’après le recadrage : on mesure à l’image suivante.
        const paths = drawnLines.map((l) => l.getElement() as SVGPathElement | undefined).filter((e): e is SVGPathElement => !!e);
        paths.forEach((el) => { el.style.opacity = "0"; });
        dots.forEach((d, i) => { const el = d.getElement() as SVGPathElement | undefined; if (el) { el.classList.add("tm-pop"); el.style.animationDelay = `${0.9 + i * 0.08}s`; } });
        requestAnimationFrame(() => requestAnimationFrame(() => paths.forEach((el, i) => {
          el.style.opacity = "";
          const len = el.getTotalLength();
          if (!len) return;
          el.style.setProperty("--len", `${Math.ceil(len)}`);
          el.style.animationDelay = `${Math.min(i, 12) * 0.06}s`;
          el.classList.add("tm-draw");
          // Une fois dessiné, on retire le pointillé : au zoom, Leaflet recalcule le tracé.
          el.addEventListener("animationend", () => { el.classList.remove("tm-draw"); el.style.removeProperty("--len"); el.style.animationDelay = ""; }, { once: true });
          // Parcours unique (course, sortie) : le coureur part dès que le tracé commence à se dessiner.
          if (!many && i === 0 && drawnLines[0]) {
            const pts = (drawnLines[0].getLatLngs() as import("leaflet").LatLng[]).flat() as import("leaflet").LatLng[];
            if (pts.length > 1) window.setTimeout(() => { if (map.current && el.isConnected) runTracer(L, map.current, pts, 1400); }, 120);
          }
        })));
      }
    })();
  }, [lines, markers, ready, fitKey, focus]);

  // Point lié au survol du profil d’altitude.
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!hover) { hoverDot.current?.remove(); hoverDot.current = null; return; }
      if (!hoverDot.current) hoverDot.current = L.circleMarker(hover, { radius: 7, color: "#fff", weight: 3, fillColor: "#ff6a2b", fillOpacity: 1, className: "tm-hover" }).addTo(map.current!);
      else hoverDot.current.setLatLng(hover);
    })();
  }, [hover, ready]);

  return (
    <div className="tmap" style={{ height }}>
      <div ref={el} className="tmap-canvas" role="region" aria-label={label} tabIndex={0} />
      <div className="seg sm tmap-layers" role="group" aria-label="Fond de carte">
        <button className={layer === "relief" ? "on" : ""} onClick={() => setLayer("relief")}>Relief</button>
        <button className={layer === "plan" ? "on" : ""} onClick={() => setLayer("plan")}>Plan</button>
      </div>
      {!ready && <div className="tmap-loading">Chargement de la carte…</div>}
    </div>
  );
}
