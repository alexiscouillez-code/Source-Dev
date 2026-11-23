"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

export interface NavItem { id: string; label: string; Icon: () => React.JSX.Element }
export interface QuickAction {
  id: string;
  label: string;
  hint?: string;
  Icon: () => React.JSX.Element;
  /** Action au toucher. */
  onSelect?: () => void;
  /** Ou : choix d'un fichier (le sélecteur s'ouvre directement depuis le toucher, comme l'exigent les téléphones). */
  file?: { accept: string; onFile: (f: File) => void };
}

/**
 * Barre de navigation inférieure flottante (téléphone et tablette).
 *
 * - Pilule centrée en bas de l'écran : une icône par section ; la section active s'élargit et affiche son nom
 *   (au survol aussi, à la souris). Un fond glisse d'une section à l'autre, avec un léger rebond.
 * - Bouton + à droite (dégradé orange, jaune, vert et halo) : ouvre un petit menu d'actions rapides qui se
 *   déploie au-dessus, élément par élément. Échap ou un toucher à côté le referme.
 * - La barre se range quand on fait défiler vers le bas et revient dès qu'on remonte (et à chaque changement
 *   d'écran ; un saut de défilement d'un coup ne la range pas).
 * - Ses couleurs suivent l'apparence du site (Jour, Nuit, Verre, Topo, Frontale) : voir bottomnav.css.
 * - Sans animation si l'appareil demande moins de mouvement.
 */
export default function BottomNav({ items, active, onSelect, actions = [], label = "Sections", plusLabel = "Actions rapides" }: {
  items: NavItem[];
  active: string;
  onSelect: (id: string) => void;
  actions?: QuickAction[];
  label?: string;
  plusLabel?: string;
}) {
  const bar = useRef<HTMLDivElement>(null), ind = useRef<HTMLSpanElement>(null), plus = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null), fileInput = useRef<HTMLInputElement>(null), fileAction = useRef<QuickAction | null>(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [bump, setBump] = useState<{ id: string; k: number } | null>(null);
  const menuId = useId();

  // Fond de la section active : suit sa position et sa largeur (qui change pendant que le nom s'affiche).
  useLayoutEffect(() => {
    const b = bar.current, i = ind.current;
    if (!b || !i) return;
    const place = () => {
      const on = b.querySelector<HTMLElement>(".bnav-item[aria-current=page]");
      if (!on) { i.style.opacity = "0"; return; }
      i.style.opacity = "1";
      i.style.width = `${on.offsetWidth}px`;
      i.style.transform = `translateX(${on.offsetLeft}px)`;
    };
    place();
    const ro = new ResizeObserver(place);
    b.querySelectorAll(".bnav-item").forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [active, items]);

  // La barre se range en descendant, revient en remontant (et toujours près du haut de la page).
  // Juste après un changement d'écran, le défilement vient de l'appli (retour en haut, carte amenée à l'écran) : on l'ignore.
  const calm = useRef(0);
  useEffect(() => {
    let last = window.scrollY, raf = 0;
    const on = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY, d = y - last;
        if (Math.abs(d) < 6) return;
        last = y;
        // Un saut d'un coup (changement d'écran, fenêtre ouverte, lien interne) n'est pas un défilement : la barre reste.
        if (Math.abs(d) > 260 || document.querySelector(".sheet-back") || performance.now() < calm.current) { setHidden(false); return; }
        setHidden(d > 0 && y > 140);
      });
    };
    // Rotation de l'écran ou fenêtre redimensionnée : le défilement qui suit n'est pas un geste.
    const resize = () => { setHidden(false); calm.current = performance.now() + 800; last = window.scrollY; };
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", resize); cancelAnimationFrame(raf); };
  }, []);
  useEffect(() => { if (open) setHidden(false); }, [open]);
  // Nouvel écran : la barre revient.
  useEffect(() => { setHidden(false); calm.current = performance.now() + 1500; }, [active]);

  const close = useCallback((focus = true) => { setOpen(false); if (focus) plus.current?.focus(); }, []);
  // Menu ouvert : focus sur la première action, Échap pour fermer.
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, close]);

  const menuKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const list = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const at = list.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : (at + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
    list[next]?.focus();
  };

  const run = (a: QuickAction) => {
    if (a.file) {
      fileAction.current = a;
      if (fileInput.current) { fileInput.current.accept = a.file.accept; fileInput.current.click(); }
      close(false);
      return;
    }
    close(false);
    a.onSelect?.();
  };

  return (
    <nav className={`bnav${hidden ? " is-hidden" : ""}${open ? " is-open" : ""}`} aria-label={label}>
      {open && <div className="bnav-scrim" aria-hidden="true" onClick={() => close(false)} />}
      <div className="bnav-pill">
        <div className="bnav-bar" ref={bar}>
          <span className="bnav-ind" ref={ind} aria-hidden="true" />
          {items.map(({ id, label: l, Icon }) => {
            const on = id === active;
            return (
              <button key={id} type="button" data-tab={id} className="bnav-item" aria-current={on ? "page" : undefined}
                onClick={() => { setBump({ id, k: Date.now() }); onSelect(id); }}>
                <span className="bnav-ico" key={bump?.id === id ? bump.k : 0}><Icon /></span>
                <span className="bnav-label">{l}</span>
              </button>
            );
          })}
        </div>
        {actions.length > 0 && (
          <>
            <span className="bnav-sep" aria-hidden="true" />
            <button ref={plus} type="button" className="bnav-plus" aria-label={plusLabel} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
              onClick={() => setOpen((o) => !o)}>
              <span className="bnav-glow" aria-hidden="true" />
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </>
        )}
        {actions.length > 0 && (
          <div className="bnav-menu" id={menuId} role="menu" aria-label={plusLabel} ref={menu} hidden={!open} onKeyDown={menuKeys}>
            {actions.map((a, i) => (
              <button key={a.id} type="button" role="menuitem" className="bnav-act" style={{ ["--i" as string]: actions.length - 1 - i }} onClick={() => run(a)}>
                <span className="bnav-act-ico" aria-hidden="true"><a.Icon /></span>
                <span className="bnav-act-txt"><b>{a.label}</b>{a.hint && <small>{a.hint}</small>}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <input ref={fileInput} type="file" hidden tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) fileAction.current?.file?.onFile(f); e.target.value = ""; }} />
    </nav>
  );
}
