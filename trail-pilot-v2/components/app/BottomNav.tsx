"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";

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
/** Pastille sur une icône : un point, ou un nombre ; `label` est lu par les lecteurs d'écran. */
export interface Badge { label: string; count?: number }
/** Message affiché dans la barre (île dynamique). `k` change à chaque nouveau message. */
export interface IslandMessage { text: string; k: number }

/** Événement de balayage entre onglets : `p` de −1 (vers la section précédente) à 1 (suivante), null au relâché. */
export const SWIPE_EVENT = "tp-swipe";
const LONG_PRESS_MS = 480;

/**
 * Barre de navigation inférieure flottante (téléphone et tablette).
 *
 * - Pilule centrée en bas de l'écran : une icône par section ; la section active s'élargit et affiche son nom
 *   (au survol aussi, à la souris). Un fond glisse d'une section à l'autre, avec un léger rebond ; pendant un
 *   balayage de la page, il suit le doigt vers la section voisine.
 * - Pastilles : point ou nombre sur une icône (check-in à faire, nouvelles sorties…).
 * - Appui long (ou clic droit, ou touche Menu) sur une icône : ses raccourcis s'ouvrent au-dessus.
 * - Bouton + (dégradé orange, jaune, vert et halo) : menu d'actions rapides. Pendant une synchro, un anneau
 *   tourne autour de lui.
 * - Île dynamique : un message (enregistrement, synchro…) s'affiche dans la barre elle-même, puis elle revient.
 * - La barre se range quand on fait défiler vers le bas et revient en remontant et à chaque changement d'écran.
 * - Couleurs propres à chaque apparence (bottomnav.css). Sans animation si l'appareil demande moins de mouvement.
 */
export default function BottomNav({ items, active, onSelect, actions = [], badges = {}, shortcuts = {}, message = null, onDismiss, busy = false, label = "Sections", plusLabel = "Actions rapides" }: {
  items: NavItem[];
  active: string;
  onSelect: (id: string) => void;
  actions?: QuickAction[];
  badges?: Record<string, Badge | null | undefined>;
  shortcuts?: Record<string, QuickAction[] | undefined>;
  message?: IslandMessage | null;
  onDismiss?: () => void;
  busy?: boolean;
  label?: string;
  plusLabel?: string;
}) {
  const bar = useRef<HTMLDivElement>(null), ind = useRef<HTMLSpanElement>(null), plus = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null), ctxMenu = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null), fileAction = useRef<QuickAction | null>(null);
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<{ id: string; x: number } | null>(null);
  const [hidden, setHidden] = useState(false);
  const [bump, setBump] = useState<{ id: string; k: number } | null>(null);
  const menuId = useId(), ctxId = useId();
  const press = useRef<{ id: string; x: number; y: number; t: number; fired: boolean } | null>(null);

  // ---------- Fond de la section active ----------
  const dragP = useRef<number | null>(null);
  const place = useCallback(() => {
    const b = bar.current, i = ind.current;
    if (!b || !i) return;
    const list = [...b.querySelectorAll<HTMLElement>(".bnav-item")];
    const at = list.findIndex((el) => el.getAttribute("aria-current") === "page");
    if (at < 0) { i.style.opacity = "0"; return; }
    i.style.opacity = "1";
    let x = list[at].offsetLeft, w = list[at].offsetWidth;
    // Balayage en cours : le fond va vers la section voisine, à proportion du geste.
    const p = dragP.current;
    if (p) {
      const n = list[at + Math.sign(p)];
      if (n) { const k = Math.min(1, Math.abs(p)); x += (n.offsetLeft - x) * k; w += (n.offsetWidth - w) * k; }
    }
    i.style.width = `${w}px`;
    i.style.transform = `translateX(${x}px)`;
  }, []);
  useLayoutEffect(() => {
    place();
    const ro = new ResizeObserver(place);
    bar.current?.querySelectorAll(".bnav-item").forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [active, items, place, message]);
  useEffect(() => {
    const on = (e: Event) => {
      const p = (e as CustomEvent<{ p: number | null }>).detail.p;
      dragP.current = p;
      ind.current?.classList.toggle("is-drag", p != null);
      place();
    };
    window.addEventListener(SWIPE_EVENT, on);
    return () => window.removeEventListener(SWIPE_EVENT, on);
  }, [place]);

  // ---------- Rangement au défilement ----------
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
  useEffect(() => { if (open || ctx || message || busy) setHidden(false); }, [open, ctx, message, busy]);
  useEffect(() => { setHidden(false); calm.current = performance.now() + 1500; }, [active]);

  // ---------- Menus (bouton + et raccourcis) ----------
  const closeAll = useCallback((focus: HTMLElement | null = null) => { setOpen(false); setCtx(null); focus?.focus(); }, []);
  useEffect(() => {
    if (!open && !ctx) return;
    (open ? menu : ctxMenu).current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const back = open ? plus.current : bar.current?.querySelector<HTMLElement>(`.bnav-item[data-tab="${ctx?.id}"]`) ?? null;
      closeAll(back);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, ctx, closeAll]);

  const menuKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const list = [...e.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]")];
    const at = list.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : (at + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
    list[next]?.focus();
  };

  const run = (a: QuickAction) => {
    if (a.file) {
      fileAction.current = a;
      if (fileInput.current) { fileInput.current.accept = a.file.accept; fileInput.current.click(); }
      closeAll();
      return;
    }
    closeAll();
    a.onSelect?.();
  };

  // ---------- Appui long sur une icône ----------
  const openCtx = (id: string, el: HTMLElement) => {
    if (!shortcuts[id]?.length) return false;
    const b = el.closest(".bnav-pill")!.getBoundingClientRect(), r = el.getBoundingClientRect();
    setOpen(false);
    setCtx({ id, x: r.left + r.width / 2 - b.left });
    try { navigator.vibrate?.(10); } catch { /* non pris en charge */ }
    return true;
  };
  const down = (id: string) => (e: RPointerEvent<HTMLButtonElement>) => {
    if (e.button > 0) return;
    const el = e.currentTarget;
    const t = window.setTimeout(() => { if (press.current?.id === id && openCtx(id, el)) press.current.fired = true; }, LONG_PRESS_MS);
    press.current = { id, x: e.clientX, y: e.clientY, t, fired: false };
  };
  const moveP = (e: RPointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) { window.clearTimeout(p.t); press.current = null; }
  };
  const upP = () => { const p = press.current; if (p && !p.fired) { window.clearTimeout(p.t); press.current = null; } };

  const ctxItems = ctx ? shortcuts[ctx.id] ?? [] : [];
  const ctxName = ctx ? items.find((x) => x.id === ctx.id)?.label ?? "" : "";

  return (
    <nav className={`bnav${hidden ? " is-hidden" : ""}${open || ctx ? " is-open" : ""}`} aria-label={label}>
      {(open || ctx) && <div className="bnav-scrim" aria-hidden="true" onClick={() => closeAll()} />}
      <div className={`bnav-pill${message ? " is-msg" : ""}`}>
        <div className="bnav-bar" ref={bar} aria-hidden={message ? true : undefined}>
          <span className="bnav-ind" ref={ind} aria-hidden="true" />
          {items.map(({ id, label: l, Icon }) => {
            const on = id === active, bd = badges[id];
            return (
              <button key={id} type="button" data-tab={id} className="bnav-item" aria-current={on ? "page" : undefined}
                tabIndex={message ? -1 : undefined} aria-haspopup={shortcuts[id]?.length ? "menu" : undefined}
                onPointerDown={down(id)} onPointerMove={moveP} onPointerUp={upP} onPointerCancel={upP} onPointerLeave={upP}
                onContextMenu={(e) => { e.preventDefault(); if (!press.current?.fired) openCtx(id, e.currentTarget); }}
                onKeyDown={(e) => { if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); openCtx(id, e.currentTarget); } }}
                onClick={(e) => {
                  if (press.current?.fired) { press.current = null; e.preventDefault(); return; }
                  setBump({ id, k: Date.now() }); onSelect(id);
                }}>
                <span className="bnav-ico" key={bump?.id === id ? bump.k : 0}>
                  <Icon />
                  {bd && <span className={`bnav-badge${bd.count ? " has-n" : ""}`} aria-hidden="true">{bd.count ? (bd.count > 9 ? "9+" : bd.count) : ""}</span>}
                </span>
                <span className="bnav-label">{l}</span>
                {bd && <span className="sr-only">, {bd.label}</span>}
              </button>
            );
          })}
        </div>
        {actions.length > 0 && (
          <>
            <span className="bnav-sep" aria-hidden="true" />
            <button ref={plus} type="button" className={`bnav-plus${busy ? " is-busy" : ""}`} aria-label={busy ? `${plusLabel} (synchro en cours)` : plusLabel} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
              tabIndex={message ? -1 : undefined} onClick={() => { setCtx(null); setOpen((o) => !o); }}>
              <span className="bnav-glow" aria-hidden="true" />
              {busy && <svg className="bnav-ring" viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="27" pathLength="100" /></svg>}
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </>
        )}
        {message && (
          // Île dynamique : la barre s'efface derrière le message ; un toucher le ferme.
          <button type="button" className="bnav-msg" key={message.k} onClick={onDismiss} aria-label={`${message.text} Toucher pour fermer.`}>
            <span className="bnav-msg-dot" aria-hidden="true" />
            <span className="bnav-msg-txt" role="status">{message.text}</span>
          </button>
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
        {ctx && (
          <div className="bnav-menu bnav-ctx" id={ctxId} role="menu" aria-label={`Raccourcis : ${ctxName}`} ref={ctxMenu} onKeyDown={menuKeys}
            style={{ ["--cx" as string]: `${ctx.x}px` }}>
            <span className="bnav-ctx-title" aria-hidden="true">{ctxName}</span>
            {ctxItems.map((a, i) => (
              <button key={a.id} type="button" role="menuitem" className="bnav-act" style={{ ["--i" as string]: ctxItems.length - 1 - i }} onClick={() => run(a)}>
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
