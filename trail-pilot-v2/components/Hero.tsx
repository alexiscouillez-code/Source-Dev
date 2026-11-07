"use client";

import { useEffect, useRef } from "react";
import { PHOTOS } from "@/lib/photos";

// Profil altimétrique réaliste (21,4 km · D+ 1 932 m) en coordonnées du panneau 320×96
const PROFILE = [
  [0, 86], [14, 84], [28, 79], [42, 80], [56, 72], [70, 66], [84, 68], [98, 58], [112, 51], [126, 54],
  [140, 44], [154, 37], [168, 40], [182, 31], [196, 26], [210, 29], [224, 20], [238, 14], [252, 17],
  [266, 10], [280, 8], [294, 18], [308, 30], [320, 38],
];
const LINE = PROFILE.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
const AREA = `${LINE} L320 96 L0 96 Z`;

export default function Hero() {
  const root = useRef<HTMLElement>(null);
  const line = useRef<SVGPathElement>(null);
  const clip = useRef<SVGRectElement>(null);
  const marker = useRef<SVGGElement>(null);
  const out = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const sec = root.current!;
    const stage = sec.querySelector<HTMLElement>(".hero-stage")!;
    const p = line.current!;
    const len = p.getTotalLength();
    p.style.strokeDasharray = `${len}`;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let scrollP = 0, intro = reduce ? 0.18 : 0, raf = 0;
    const t0 = performance.now();

    const onScroll = () => {
      const r = sec.getBoundingClientRect();
      scrollP = Math.min(1, Math.max(0, -r.top / Math.max(1, sec.offsetHeight - window.innerHeight)));
    };
    const set = (k: string, v: string) => { const el = out.current[k]; if (el && el.textContent !== v) el.textContent = v; };

    const frame = (t: number) => {
      if (!reduce) intro = Math.min(0.18, ((t - t0 - 600) / 1600) * 0.18);
      const d = Math.max(0, Math.max(intro, Math.min(1, 0.18 + scrollP * 0.82)));
      p.style.strokeDashoffset = `${len * (1 - d)}`;
      clip.current?.setAttribute("width", String(320 * d));
      const pt = p.getPointAtLength(len * d);
      marker.current?.setAttribute("transform", `translate(${pt.x} ${pt.y})`);
      stage.style.setProperty("--p", scrollP.toFixed(4));
      set("dist", (d * 21.4).toFixed(1).replace(".", ","));
      set("dplus", Math.round(d * 1932).toLocaleString("fr-FR"));
      set("alt", Math.round(1342 + (96 - pt.y) * 17.4).toLocaleString("fr-FR"));
      const secs = Math.round(d * 3 * 3600 + d * 24 * 60);
      set("time", `${Math.floor(secs / 3600)}:${String(Math.floor((secs % 3600) / 60)).padStart(2, "0")}`);
      raf = requestAnimationFrame(frame);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", onScroll); };
  }, []);

  const words = ["Je", "sais", "quoi", "faire"];
  const reg = (k: string) => (el: HTMLElement | null) => { out.current[k] = el; };

  return (
    <section className="hero" ref={root} aria-labelledby="hero-title">
      <div className="hero-stage">
        <div className="hero-media" aria-hidden="true">
          <img src={PHOTOS.dolomites.src} alt="" fetchPriority="high" decoding="async" />
        </div>
        <div className="hero-shade" aria-hidden="true" />
        <div className="hero-grain" aria-hidden="true" />

        <div className="hero-copy">
          <span className="kicker">Entraînement trail · Préparation de course</span>
          <h1 id="hero-title">
            {words.map((w, i) => (
              <span className="word" key={w}><span style={{ ["--i" as string]: i }}>{w}&nbsp;</span></span>
            ))}
            <br />
            <span className="word"><em style={{ ["--i" as string]: 4 }}>aujourd’hui.</em></span>
          </h1>
          <p className="hero-sub">Un check-in de dix secondes le soir. Le lendemain, une consigne claire : maintenir, alléger ou récupérer.</p>
          <div className="hero-cta">
            <a className="btn" href="/connexion?mode=inscription">Ouvrir mon espace <span className="arr">↗</span></a>
            <a className="btn btn-ghost" href="#decision">Comment ça marche</a>
          </div>
        </div>

        <aside className="telemetry" aria-hidden="true">
          <div className="tel-head">
            <span><i className="rec" /> Sortie longue</span>
            <span>Dolomites · 21,4 km</span>
          </div>
          <div className="tel-grid">
            <div><small>Distance</small><b><span ref={reg("dist")}>0,0</span><em>km</em></b></div>
            <div><small>D+</small><b><span ref={reg("dplus")}>0</span><em>m</em></b></div>
            <div><small>Altitude</small><b><span ref={reg("alt")}>1 342</span><em>m</em></b></div>
            <div><small>Temps</small><b><span ref={reg("time")}>0:00</span></b></div>
          </div>
          <svg className="tel-profile" viewBox="0 0 320 96" preserveAspectRatio="none">
            <defs>
              <linearGradient id="telfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ff6a2b" stopOpacity=".38" />
                <stop offset="1" stopColor="#ff6a2b" stopOpacity="0" />
              </linearGradient>
              <clipPath id="telclip"><rect ref={clip} x="0" y="0" width="0" height="96" /></clipPath>
            </defs>
            {[24, 48, 72].map((y) => <line key={y} x1="0" x2="320" y1={y} y2={y} stroke="#ffffff14" />)}
            <path d={AREA} fill="#ffffff0a" />
            <path d={AREA} fill="url(#telfill)" clipPath="url(#telclip)" />
            <path d={LINE} fill="none" stroke="#ffffff30" strokeWidth="1.5" />
            <path ref={line} d={LINE} fill="none" stroke="#ff6a2b" strokeWidth="2" strokeLinejoin="round" />
            <g ref={marker}><line x1="0" x2="0" y1="-96" y2="96" stroke="#ffffff40" /><circle r="4" fill="#fff" /></g>
          </svg>
        </aside>

        <div className="scroll-cue mono" aria-hidden="true"><i /> Défiler</div>
        <p className="photo-credit">Photo : {PHOTOS.dolomites.author} / Unsplash</p>
      </div>
    </section>
  );
}
