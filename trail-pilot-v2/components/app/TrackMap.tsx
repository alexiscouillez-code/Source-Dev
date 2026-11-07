"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { decodePolyline, type LatLon } from "@/lib/polyline";

export interface MapLine { poly: string; id?: number; highlight?: boolean; label?: string }
export interface MapMarker { at: LatLon; label: string; kind?: "start" | "finish" | "aid" }

const LAYERS = {
  relief: { url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", max: 17, attr: "Carte © <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>, SRTM · style © <a href=\"https://opentopomap.org\">OpenTopoMap</a> (CC-BY-SA)" },
  plan: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", max: 19, attr: "© <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>" },
} as const;

/** Carte des tracés GPS : sorties ou parcours de course, avec fond relief ou plan. */
const NO_MARKERS: MapMarker[] = [];

export default function TrackMap({ lines, markers = NO_MARKERS, height = 320, onSelect, label }: {
  lines: MapLine[]; markers?: MapMarker[]; height?: number; onSelect?: (id: number) => void; label: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const tiles = useRef<import("leaflet").TileLayer | null>(null);
  const group = useRef<import("leaflet").FeatureGroup | null>(null);
  const [layer, setLayer] = useState<keyof typeof LAYERS>("relief");
  const [ready, setReady] = useState(false);
  const sel = useRef(onSelect); sel.current = onSelect;
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
      for (const l of sorted) {
        let pts: LatLon[] = [];
        try { pts = decodePolyline(l.poly); } catch { continue; }
        if (pts.length < 2) continue;
        const pl = L.polyline(pts, { color: l.highlight || !many ? ember : "#3b82f6", weight: l.highlight || !many ? 4 : 2.5, opacity: l.highlight || !many ? 0.95 : 0.55, lineJoin: "round" });
        if (l.label) pl.bindTooltip(l.label, { sticky: true });
        if (l.id != null && sel.current) pl.on("click", () => sel.current?.(l.id!));
        pl.addTo(g);
        drawnLines.push(pl);
      }
      for (const mk of markers) {
        const color = mk.kind === "start" ? "#22c55e" : mk.kind === "finish" ? "#e5383b" : "#f4efe6";
        dots.push(L.circleMarker(mk.at, { radius: mk.kind === "aid" ? 5 : 6, color: "#0b0f14", weight: 2, fillColor: color, fillOpacity: 1 }).bindTooltip(mk.label).addTo(g));
      }
      const b = g.getBounds();
      if (b.isValid()) map.current!.fitBounds(b, { padding: [18, 18], maxZoom: 15, animate: false });
      else map.current!.setView([45.9, 6.8], 9);
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
        })));
      }
    })();
  }, [lines, markers, ready]);

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
