"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Fiche, FicheHead, useFiche } from "./Fiche";

/** État ouvert / replié d’une carte, retenu sur l’appareil. */
export function useFold(id: string, defaultOpen = false) {
  const [open, setOpen] = useState(() => {
    try { const v = localStorage.getItem(`tp-fold:${id}`); return v == null ? defaultOpen : v === "1"; } catch { return defaultOpen; }
  });
  const set = useCallback((v: boolean) => { setOpen(v); try { localStorage.setItem(`tp-fold:${id}`, v ? "1" : "0"); } catch { /* stockage indisponible */ } }, [id]);
  return [open, set] as const;
}

/**
 * Carte déroulante : l’en-tête (titre, résumé, chevron) reste visible, le contenu ne s’affiche qu’à l’ouverture.
 * Sert à alléger les écrans chargés : on voit l’essentiel d’un coup d’œil et on déplie ce dont on a besoin.
 * Le contenu replié n’est pas monté (une carte ou un graphique ne se charge qu’à l’ouverture).
 */
export default function Fold({ fiche, ...p }: Parameters<typeof InlineFold>[0] & {
  /** En fiche : l'en-tête reste dans la page, le contenu s'ouvre par-dessus (au lieu de se déplier en dessous). */
  fiche?: boolean;
}) {
  return fiche ? <FicheFold {...p} /> : <InlineFold {...p} />;
}

/** Rubrique dont le contenu s'ouvre en fiche : l'en-tête (titre, résumé) s'agrandit jusqu'à la fiche. */
function FicheFold({ id, title, eyebrow, aside, className = "", style, sectionRef, children }: Parameters<typeof InlineFold>[0]) {
  const f = useFiche<true>();
  const box = useRef<HTMLElement | null>(null);
  const set = (el: HTMLElement | null) => {
    box.current = el;
    if (typeof sectionRef === "function") sectionRef(el); else if (sectionRef && typeof sectionRef === "object") (sectionRef as React.MutableRefObject<HTMLElement | null>).current = el;
  };
  const open = () => f.open(true, box.current);
  return (
    <section ref={set} data-fold={id} className={`card fold is-fiche ${className}`} style={style}>
      <div className="card-head fold-head" onClick={(e) => { if (!(e.target as HTMLElement).closest("a, input, select, .tip, button:not(.fold-btn)")) open(); }}>
        <div style={{ minWidth: 0 }}>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 style={eyebrow ? { marginTop: 4 } : undefined}><button type="button" className="fold-btn" aria-haspopup="dialog" onClick={(e) => { e.stopPropagation(); open(); }}>{title}</button></h2>
        </div>
        <span className="fold-aside">{aside}<i className="fold-chev" aria-hidden="true">›</i></span>
      </div>
      <Fiche ctl={f} kind="fold">
        {f.value && (
          <>
            <FicheHead eyebrow={eyebrow ?? "Planning"} title={title} chips={aside} onClose={f.close} />
            <div className={`panel-body fold-fiche ${className}`} data-fold-fiche={id}>{children}</div>
          </>
        )}
      </Fiche>
    </section>
  );
}

function InlineFold({ id, title, eyebrow, aside, defaultOpen = false, open: forced, onToggle, className = "", style, sectionRef, children }: {
  id: string; title: React.ReactNode; eyebrow?: string; aside?: React.ReactNode; defaultOpen?: boolean;
  /** Mode contrôlé (facultatif) : l’écran décide de l’ouverture, par exemple pour ouvrir la carte depuis un bouton. */
  open?: boolean; onToggle?: (open: boolean) => void;
  className?: string; style?: React.CSSProperties; sectionRef?: React.Ref<HTMLElement>; children: React.ReactNode;
}) {
  const [own, setOwn] = useFold(id, defaultOpen);
  const open = forced ?? own;
  const toggle = () => (onToggle ? onToggle(!open) : setOwn(!open));
  const body = useId();
  return (
    <section ref={sectionRef} data-fold={id} className={`card fold ${open ? "is-open" : "is-closed"} ${className}`} style={style}>
      {/* Tout l’en-tête est cliquable, sauf les boutons et liens qu’il contient. */}
      <div className="card-head fold-head" onClick={(e) => { if (!(e.target as HTMLElement).closest("a, input, select, .tip, button:not(.fold-btn)")) toggle(); }}>
        <div style={{ minWidth: 0 }}>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 style={eyebrow ? { marginTop: 4 } : undefined}><button type="button" className="fold-btn" aria-expanded={open} aria-controls={body} onClick={(e) => { e.stopPropagation(); toggle(); }}>{title}</button></h2>
        </div>
        <span className="fold-aside">{aside}<i className="fold-chev" aria-hidden="true">›</i></span>
      </div>
      {open && <div className="fold-body" id={body}>{children}</div>}
    </section>
  );
}
