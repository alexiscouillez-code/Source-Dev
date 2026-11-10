"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Petit « ? » qui explique un indicateur. S’ouvre au clic (ou au toucher), se ferme au clic
 * ailleurs, avec Échap ou au défilement. La bulle reste toujours dans l’écran.
 */
export default function InfoTip({ title, children }: { title: string; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean; measured: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null), tip = useRef<HTMLSpanElement>(null);
  const id = useId();

  const place = () => {
    const r = btn.current!.getBoundingClientRect();
    const w = Math.min(280, window.innerWidth - 32);
    const left = Math.max(16, Math.min(r.right - w + 8, window.innerWidth - w - 16));
    setPos({ left, top: r.bottom + 8, up: false, measured: false });
  };

  // Une fois la bulle affichée, on mesure sa hauteur : si elle déborde en bas (ou passe sous la
  // barre d’onglets sur mobile), elle s’ouvre au-dessus du « ? ».
  useLayoutEffect(() => {
    if (!pos || pos.measured || !tip.current || !btn.current) return;
    const r = btn.current.getBoundingClientRect(), h = tip.current.offsetHeight;
    const bar = document.querySelector<HTMLElement>(".tabbar");
    const bottom = window.innerHeight - (bar && getComputedStyle(bar).display !== "none" ? bar.offsetHeight + 24 : 16);
    const up = r.bottom + 8 + h > bottom && r.top - 8 - h >= 16;
    setPos({ ...pos, top: up ? r.top - 8 : Math.max(16, Math.min(r.bottom + 8, bottom - h)), up, measured: true });
  }, [pos]);

  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      if (e.type === "pointerdown" && (btn.current?.contains(e.target as Node) || tip.current?.contains(e.target as Node))) return;
      setPos(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  return (
    <>
      <button ref={btn} type="button" className={`info-q ${pos ? "on" : ""}`} aria-label={`C’est quoi, ${title} ?`} aria-expanded={!!pos} aria-controls={pos ? id : undefined}
        onClick={(e) => { e.stopPropagation(); if (pos) setPos(null); else place(); }}>?</button>
      {pos && createPortal(
        <span ref={tip} id={id} role="tooltip" className={`info-tip ${pos.up ? "up" : ""}`} style={{ left: pos.left, top: pos.top, visibility: pos.measured ? undefined : "hidden" }}>
          <b>{title}</b>
          {children}
        </span>,
        document.body,
      )}
    </>
  );
}

const UA = "La charge s’exprime en UA (unités arbitraires) : durée × intensité de l’effort (une heure de fractionné pèse environ deux fois une heure de footing), plus le coût des impacts et du dénivelé, la descente comptant davantage. Quand la sortie est analysée seconde par seconde, l’intensité vient du temps passé dans chaque zone cardiaque.";

/** Explications partagées des indicateurs de charge. */
export const EXPLAIN = {
  ctl: (
    <>
      <span className="p">Ta charge d’entraînement moyenne par jour sur les 6 dernières semaines. Elle monte lentement quand tu t’entraînes régulièrement : c’est ton <em>endurance de fond</em>.</span>
      <span className="p">Plus elle est haute, plus tu encaisses de volume sans te mettre dans le rouge.</span>
      <span className="p muted">{UA}</span>
    </>
  ),
  atl: (
    <>
      <span className="p">Ta charge moyenne par jour sur les 7 derniers jours. Elle réagit vite : une grosse semaine la fait grimper, quelques jours calmes la font redescendre.</span>
      <span className="p">Quand elle dépasse nettement ta forme de fond, tu accumules de la fatigue.</span>
    </>
  ),
  form: (
    <>
      <span className="p">Forme de fond moins fatigue.</span>
      <span className="p"><em>Positive</em> : tu as de la réserve, c’est le bon moment pour une séance clé ou une course.</span>
      <span className="p"><em>Légèrement négative</em> : normal en plein bloc d’entraînement, c’est ce qui te fait progresser.</span>
      <span className="p"><em>Très négative plusieurs jours</em> : il est temps d’alléger.</span>
    </>
  ),
  ratio: (
    <>
      <span className="p">La charge des 7 derniers jours comparée à ta moyenne des 6 dernières semaines.</span>
      <span className="p"><em>0,8 à 1,3</em> : progression maîtrisée.</span>
      <span className="p"><em>Au-dessus de 1,3</em> : la charge monte vite, ton corps a du mal à suivre.</span>
      <span className="p"><em>Sous 0,8</em> : tu lèves le pied, ta forme de fond va baisser doucement.</span>
    </>
  ),
  monotony: (
    <>
      <span className="p">Indique si tes journées d’entraînement se ressemblent toutes : la charge moyenne de la semaine divisée par sa variation d’un jour à l’autre.</span>
      <span className="p"><em>Au-delà de 2</em>, tes séances sont trop uniformes. Alterner jours faciles, jours durs et repos aide à mieux récupérer.</span>
    </>
  ),
  vo2: (
    <>
      <span className="p">La quantité maximale d’oxygène que ton corps peut utiliser, par minute et par kilo. Plus elle est élevée, plus ton moteur aérobie est puissant.</span>
      <span className="p">Ici, elle est estimée à partir de <em>tout ton historique de course</em> : pour chaque sortie, l’allure donne l’effort fourni et la fréquence cardiaque dit quelle part de ta capacité tu as utilisée.</span>
      <span className="p">Chaque mois compte, les plus récents pèsent davantage : le poids d’un mois est divisé par deux tous les 3 mois.</span>
    </>
  ),
};
