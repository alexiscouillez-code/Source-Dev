"use client";

import { useEffect } from "react";

/** Global motion layer: reveals, counters, nav state, custom cursor, card glow, step line. */
export default function MotionRoot() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---- Reveal on view
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.classList.add("in");
          el.querySelectorAll(":scope > .mask").forEach((m) => m.classList.add("in"));
          if (el.dataset.count) countUp(el, reduce);
          io.unobserve(el);
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" },
    );
    document.querySelectorAll(".reveal, [data-io], [data-count]").forEach((el) => io.observe(el));
    // clip-path hides the element's own box from IntersectionObserver: watch the parent instead
    new Set(Array.from(document.querySelectorAll(".mask"), (m) => m.parentElement!)).forEach((parent) => io.observe(parent));

    // ---- Path lengths for .draw
    document.querySelectorAll<SVGPathElement>("path.draw").forEach((p) => {
      p.style.setProperty("--len", String(Math.ceil(p.getTotalLength())));
    });

    // ---- Nav + steps progress
    const nav = document.querySelector(".nav");
    const steps = document.querySelector<HTMLElement>(".steps");
    const bands = document.querySelectorAll<HTMLElement>(".band");
    const onScroll = () => {
      nav?.classList.toggle("scrolled", window.scrollY > 40);
      bands.forEach((b) => {
        const r = b.getBoundingClientRect();
        const t = (window.innerHeight - r.top) / (window.innerHeight + r.height);
        if (t > -0.1 && t < 1.1) b.style.setProperty("--bp", t.toFixed(3));
      });
      if (steps) {
        const r = steps.getBoundingClientRect();
        const vh = window.innerHeight;
        const p = Math.min(1, Math.max(0, (vh * 0.6 - r.top) / r.height));
        steps.style.setProperty("--p", p.toFixed(3));
        steps.querySelectorAll<HTMLElement>(".step").forEach((s) => {
          const sr = s.getBoundingClientRect();
          s.classList.toggle("in", sr.top < vh * 0.6);
        });
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    // ---- Card spotlight
    const onCardMove = (e: PointerEvent) => {
      const c = (e.currentTarget as HTMLElement).getBoundingClientRect();
      (e.currentTarget as HTMLElement).style.setProperty("--hx", `${e.clientX - c.left}px`);
      (e.currentTarget as HTMLElement).style.setProperty("--hy", `${e.clientY - c.top}px`);
    };
    const cards = document.querySelectorAll<HTMLElement>(".fcard");
    cards.forEach((c) => c.addEventListener("pointermove", onCardMove));

    // ---- Custom cursor (fine pointers only)
    let raf = 0;
    const cursor = document.querySelector<HTMLElement>(".cursor");
    const fine = window.matchMedia("(pointer: fine)").matches;
    let cleanupCursor = () => {};
    if (cursor && fine && !reduce) {
      const dot = cursor.querySelector<HTMLElement>(".c-dot")!;
      const ring = cursor.querySelector<HTMLElement>(".c-ring")!;
      let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y;
      const move = (e: PointerEvent) => { x = e.clientX; y = e.clientY; };
      const over = (e: Event) => {
        const t = e.target as HTMLElement;
        cursor.classList.toggle("hover", !!t.closest("a, button, summary, input, label, select"));
      };
      const loop = () => {
        rx += (x - rx) * 0.16; ry += (y - ry) * 0.16;
        dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
        raf = requestAnimationFrame(loop);
      };
      window.addEventListener("pointermove", move, { passive: true });
      document.addEventListener("pointerover", over);
      loop();
      cleanupCursor = () => {
        window.removeEventListener("pointermove", move);
        document.removeEventListener("pointerover", over);
      };
    }

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      cards.forEach((c) => c.removeEventListener("pointermove", onCardMove));
      cancelAnimationFrame(raf);
      cleanupCursor();
    };
  }, []);

  return (
    <div className="cursor" aria-hidden="true">
      <div className="c-ring" />
      <div className="c-dot" />
    </div>
  );
}

function countUp(el: HTMLElement, reduce: boolean) {
  const target = Number(el.dataset.count);
  const suffix = el.dataset.suffix ?? "";
  const out = el.querySelector("[data-n]") ?? el;
  if (reduce) { out.textContent = target.toLocaleString("fr-FR") + suffix; return; }
  const t0 = performance.now();
  const dur = 1600;
  const tick = (t: number) => {
    const k = Math.min(1, (t - t0) / dur);
    const v = Math.round(target * (1 - Math.pow(1 - k, 4)));
    out.textContent = v.toLocaleString("fr-FR") + suffix;
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
