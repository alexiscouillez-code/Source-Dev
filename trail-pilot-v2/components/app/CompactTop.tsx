"use client";

import { useEffect, useState } from "react";

/**
 * En-tête compact (téléphone) : quand le grand titre de la page sort de l'écran en défilant, une petite barre
 * apparaît en haut avec ce titre ; la toucher remonte en haut de page. En défilant, le grand titre rétrécit et
 * s'estompe un peu avant de passer dans la barre (comme les titres d'iOS).
 */
export default function CompactTop({ tab, version }: { tab: string; version?: unknown }) {
  const [title, setTitle] = useState("");
  const [show, setShow] = useState(false);

  useEffect(() => {
    const phone = window.matchMedia("(max-width: 900px)"), reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let h1: HTMLElement | null = null, raf = 0;
    const update = () => {
      raf = 0;
      if (!h1 || !h1.isConnected) h1 = document.querySelector<HTMLElement>(".view .head h1");
      if (!h1) { setShow(false); return; }
      setTitle(h1.textContent?.trim() ?? "");
      const r = h1.getBoundingClientRect();
      setShow(phone.matches && r.bottom < 52);
      // Le grand titre rétrécit et s'estompe sur les 90 premiers pixels de défilement.
      const k = Math.max(0, Math.min(1, window.scrollY / 90));
      if (phone.matches && !reduce.matches) {
        h1.style.transformOrigin = "0 100%";
        h1.style.transform = k ? `scale(${(1 - 0.14 * k).toFixed(3)})` : "";
        h1.style.opacity = k ? String(1 - 0.45 * k) : "";
      } else { h1.style.transform = ""; h1.style.opacity = ""; }
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    // Le titre de la nouvelle page arrive après la transition : on relit plusieurs fois au début.
    const timers = [0, 120, 450, 900].map((ms) => window.setTimeout(() => { h1 = null; on(); }, ms));
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); timers.forEach(clearTimeout); cancelAnimationFrame(raf); };
  }, [tab, version]);

  return (
    <button type="button" className={`ctop${show ? " is-on" : ""}`} aria-hidden={!show} tabIndex={show ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
      aria-label={`${title}. Remonter en haut de la page`}>
      <span className="ctop-title">{title}</span>
    </button>
  );
}
