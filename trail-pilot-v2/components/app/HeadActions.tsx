"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { IconMore } from "./icons";

export interface HeadAction {
  id: string;
  label: string;
  /** Petite ligne sous le nom, dans le menu ⋯. */
  hint?: string;
  Icon?: () => React.JSX.Element;
  /** `el` : le bouton touché (ou ⋯ depuis le menu), d'où une fiche peut s'agrandir. */
  run: (el: HTMLElement) => void;
  disabled?: boolean;
  /** Action principale : elle reste visible sur téléphone, les autres passent dans le menu ⋯. */
  primary?: boolean;
  /** Bouton plein (orange) plutôt que discret. */
  filled?: boolean;
  dialog?: boolean;
}

/**
 * Boutons d'en-tête de page. Sur ordinateur, tous en ligne ; sur téléphone, à partir de trois actions, seule
 * l'action principale reste et les autres s'ouvrent depuis un bouton ⋯ (menu au clavier : flèches, Échap).
 */
export default function HeadActions({ actions, label }: { actions: HeadAction[]; label: string }) {
  const list = actions.filter(Boolean);
  const collapse = list.length >= 3 && list.some((a) => a.primary);
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"left" | "right">("right");
  const box = useRef<HTMLDivElement>(null), more = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const id = useId();

  // Le menu s'ouvre du côté où il tient à l'écran.
  useLayoutEffect(() => {
    if (!open || !box.current) return;
    const r = more.current!.getBoundingClientRect();
    setSide(r.right - 260 < 12 ? "left" : "right");
  }, [open]);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus();
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); more.current?.focus(); } };
    document.addEventListener("pointerdown", out);
    window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", out); window.removeEventListener("keydown", esc); };
  }, [open]);
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])")];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div className={`head-acts${collapse ? " is-collapsible" : ""}`} ref={box}>
      {list.map((a) => (
        <button key={a.id} type="button" className={`btn${a.filled ? "" : " ghost"} sm${a.primary ? " ha-main" : " ha-extra"}`} disabled={a.disabled}
          aria-haspopup={a.dialog ? "dialog" : undefined} onClick={(e) => a.run(e.currentTarget)}>
          {a.Icon && <a.Icon />}{a.label}
        </button>
      ))}
      {collapse && (
        <>
          <button ref={more} type="button" className="btn ghost sm ha-more" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
            <IconMore />
          </button>
          {open && (
            <div className={`ha-menu is-${side}`} id={id} role="menu" aria-label={label} ref={menu} onKeyDown={keys}>
              {list.filter((a) => !a.primary).map((a, i) => (
                <button key={a.id} type="button" role="menuitem" className="ha-item" disabled={a.disabled} style={{ ["--i" as string]: i }}
                  onClick={() => { setOpen(false); a.run(more.current!); }}>
                  {a.Icon && <span className="ha-ico" aria-hidden="true"><a.Icon /></span>}
                  <span className="ha-txt"><b>{a.label}</b>{a.hint && <small>{a.hint}</small>}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
