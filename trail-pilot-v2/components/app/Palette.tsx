"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconSearch } from "./icons";

export interface Command {
  id: string; label: string; group: string; hint?: string; keywords?: string;
  Icon?: () => React.JSX.Element;
  run: () => void;
}
export const PALETTE_EVENT = "tp-palette";
export const openPalette = () => window.dispatchEvent(new CustomEvent(PALETTE_EVENT));

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, " ");
/** Score de correspondance : tous les mots de la recherche doivent apparaître ; le début du libellé compte plus. */
function score(c: Command, q: string[]) {
  if (!q.length) return 1;
  const label = norm(c.label), all = `${label} ${norm(c.hint ?? "")} ${norm(c.keywords ?? "")} ${norm(c.group)}`;
  let s = 0;
  for (const w of q) {
    const i = all.indexOf(w);
    if (i < 0) return 0;
    s += label.startsWith(w) ? 6 : label.includes(` ${w}`) ? 4 : label.includes(w) ? 3 : 1;
  }
  return s;
}

/**
 * Recherche rapide (Ctrl+K ou ⌘K) : pages, actions, raccourcis, sorties récentes, courses, apparences.
 * Flèches pour choisir, Entrée pour lancer, Échap pour fermer. La surbrillance glisse d'un résultat à l'autre.
 */
export default function Palette({ commands, extra }: { commands: Command[]; extra?: () => Promise<Command[]> }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const [more, setMore] = useState<Command[]>([]);
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null), hl = useRef<HTMLSpanElement>(null);
  const back = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    const on = () => setOpen(true);
    window.addEventListener("keydown", key);
    window.addEventListener(PALETTE_EVENT, on);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener(PALETTE_EVENT, on); };
  }, []);
  useEffect(() => {
    if (!open) return;
    back.current = document.activeElement as HTMLElement | null;
    setQ(""); setAt(0);
    window.setTimeout(() => input.current?.focus(), 20);
    extra?.().then(setMore).catch(() => {});
    return () => { back.current?.focus?.({ preventScroll: true }); };
  }, [open, extra]);

  const words = useMemo(() => norm(q).split(/\s+/).filter(Boolean), [q]);
  const results = useMemo(() => {
    const all = [...commands, ...more];
    const scored = all.map((c) => ({ c, s: score(c, words) })).filter((x) => x.s > 0);
    // Sans recherche : pages et actions d'abord ; avec recherche : les meilleurs, quel que soit leur groupe.
    if (words.length) scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, words.length ? 30 : 40).map((x) => x.c);
  }, [commands, more, words]);
  useEffect(() => { setAt(0); }, [q]);

  // Surbrillance qui glisse sous le résultat actif, et défilement pour le garder visible.
  useLayoutEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(`[data-i="${at}"]`), h = hl.current;
    if (!el || !h) { if (h) h.style.opacity = "0"; return; }
    h.style.opacity = "1";
    h.style.transform = `translateY(${el.offsetTop}px)`;
    h.style.height = `${el.offsetHeight}px`;
    el.scrollIntoView({ block: "nearest" });
  }, [at, results, open]);

  if (!open) return null;
  const run = (c: Command) => { setOpen(false); window.setTimeout(() => c.run(), 30); };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const c = results[at]; if (c) run(c); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };
  let last = "";
  return createPortal(
    <div className="pal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="pal" role="dialog" aria-modal="true" aria-label="Recherche rapide" onKeyDown={keys}>
        <label className="pal-field">
          <IconSearch />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Une page, une sortie, une course, un réglage…"
            role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={results[at] ? `pal-${results[at].id}` : undefined} aria-autocomplete="list" />
          <kbd>Échap</kbd>
        </label>
        <div className="pal-list" id="pal-list" role="listbox" ref={list} aria-label="Résultats">
          <span className="pal-hl" ref={hl} aria-hidden="true" />
          {results.length === 0 && <p className="pal-empty">Rien trouvé pour « {q} ».</p>}
          {results.map((c, i) => {
            const head = c.group !== last; last = c.group;
            return (
              <div key={c.id} className="pal-grp" style={{ ["--i" as string]: Math.min(i, 12) }}>
                {head && <div className="pal-g" aria-hidden="true">{c.group}</div>}
                <div id={`pal-${c.id}`} data-i={i} role="option" aria-selected={i === at} className={`pal-item${i === at ? " on" : ""}`}
                  onMouseMove={() => { if (at !== i) setAt(i); }} onClick={() => run(c)}>
                  <span className="pal-ico" aria-hidden="true">{c.Icon ? <c.Icon /> : null}</span>
                  <span className="pal-txt"><b>{c.label}</b>{c.hint && <small>{c.hint}</small>}</span>
                  {i === at && <kbd aria-hidden="true">↵</kbd>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="pal-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> choisir</span><span><kbd>↵</kbd> ouvrir</span><span><kbd>Ctrl</kbd><kbd>K</kbd> ouvrir / fermer</span></div>
      </div>
    </div>,
    document.body,
  );
}
