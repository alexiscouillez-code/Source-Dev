"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, dayLabel, fmtDur, fmtKm, fmtNum, SPORT_LABEL } from "./client";
import { IconCompare, IconSearch } from "./icons";
import { FicheHead } from "./Fiche";
import { haptic } from "@/components/haptics";
import type { PanelProps } from "./Panels";

interface Lite { id: number; date: string; name: string | null; sport: string; distance_km: number | null; gain_m: number | null; duration_min: number; avg_hr: number | null; source: string; strava: boolean }
interface AllResp { activities: Lite[]; strava: { connected: boolean; historyDone: boolean; oldest: string | null } }

const PAGE = 60;
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, " ");
const MONTHS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
/** Tout ce qu'on peut taper pour retrouver une sortie : nom, sport, date (jour, mois, année), distance, dénivelé. */
const hay = (a: Lite) => {
  const m = Number(a.date.slice(5, 7)) - 1;
  return norm([a.name ?? "", SPORT_LABEL[a.sport] ?? a.sport, a.date, `${Number(a.date.slice(8, 10))} ${MONTHS[m]} ${a.date.slice(0, 4)}`, MONTHS[m].slice(0, 4),
    a.distance_km ? `${Math.round(a.distance_km)} km ${fmtKm(a.distance_km)}km` : "", a.gain_m ? `${a.gain_m} m d+` : "", a.strava ? "strava" : ""].join(" "));
};
/** Deux sorties comparables : même famille de sport, distance à 12 % près, dénivelé proche. */
const near = (a: Lite, b: Lite) => {
  const foot = (s: string) => ["trail", "course", "rando"].includes(s);
  if (a.id === b.id || foot(a.sport) !== foot(b.sport) || !a.distance_km || !b.distance_km) return false;
  const dk = Math.abs(a.distance_km - b.distance_km) / Math.max(a.distance_km, b.distance_km);
  const dg = Math.abs((a.gain_m ?? 0) - (b.gain_m ?? 0));
  return dk <= 0.12 && dg <= Math.max(150, 0.2 * Math.max(a.gain_m ?? 0, b.gain_m ?? 0));
};

/**
 * Choix des deux sorties à comparer, dans tout l'historique (Strava compris) : recherche instantanée sur le
 * nom, la date, la distance ou le dénivelé, filtres par sport, et dès qu'une sortie est choisie, les sorties
 * comparables (même distance, même dénivelé) en tête. L'historique Strava plus ancien que 120 jours
 * s'importe d'un toucher.
 */
export default function ComparePicker({ first, keep, close, swap, toast }: PanelProps & { first?: number; keep?: number }) {
  const [data, setData] = useState<AllResp | null>(null);
  const [q, setQ] = useState("");
  const [sport, setSport] = useState<string>("all");
  const [ids, setIds] = useState<number[]>(() => [first ?? keep].filter((x): x is number => x != null));
  const [shown, setShown] = useState(PAGE);
  const [importing, setImporting] = useState<{ n: number; oldest: string | null } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const load = useCallback(() => api<AllResp>("/api/activities/all").then(setData).catch((e) => toast(e instanceof Error ? e.message : "Erreur")), [toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (window.matchMedia("(pointer: fine)").matches) window.setTimeout(() => input.current?.focus({ preventScroll: true }), 420); }, []);
  useEffect(() => { setShown(PAGE); }, [q, sport]);

  const list = useMemo(() => data?.activities ?? [], [data]);
  const byId = useMemo(() => new Map(list.map((a) => [a.id, a])), [list]);
  const sports = useMemo(() => { const m = new Map<string, number>(); for (const a of list) m.set(a.sport, (m.get(a.sport) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s); }, [list]);
  const index = useMemo(() => list.map((a) => [a, hay(a)] as const), [list]);
  const words = useMemo(() => norm(q).split(/\s+/).filter(Boolean), [q]);
  const results = useMemo(() => index.filter(([a, h]) => (sport === "all" || a.sport === sport) && words.every((w) => h.includes(w))).map(([a]) => a), [index, words, sport]);
  const anchor = ids.length === 1 ? byId.get(ids[0]) ?? null : null;
  const similar = useMemo(() => (anchor && !words.length ? list.filter((b) => near(anchor, b)).slice(0, 6) : []), [anchor, list, words.length]);

  const toggle = (id: number) => {
    haptic("tap");
    setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 2 ? [...cur, id] : [cur[0], id]));
  };
  async function importAll() {
    setImporting({ n: 0, oldest: data?.strava.oldest ?? null });
    try {
      let n = 0;
      for (let k = 0; k < 40; k++) {
        const r = await api<{ imported: number; done: boolean; oldest: string | null; total: number }>("/api/strava/history", { method: "POST" });
        n += r.imported;
        setImporting({ n, oldest: r.oldest });
        if (r.done) break;
      }
      await load();
      toast(n ? `${fmtNum(n)} sortie${n > 1 ? "s" : ""} Strava de plus.` : "Ton historique Strava est déjà complet.");
    } catch (e) { toast(e instanceof Error ? e.message : "Import interrompu."); await load(); }
    finally { setImporting(null); }
  }

  const row = (a: Lite, i: number) => {
    const on = ids.includes(a.id), side = ids.indexOf(a.id);
    return (
      <li key={a.id} style={{ ["--i" as string]: Math.min(i, 14) }}>
        <button type="button" className={`cp-row${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(a.id)}>
          <span className="cp-date" aria-hidden="true"><b>{Number(a.date.slice(8, 10))}</b><small>{dayLabel(a.date, { month: "short" }).replace(".", "")} {a.date.slice(2, 4)}</small></span>
          <span className="cp-main">
            <span className="cp-name">{a.name ?? SPORT_LABEL[a.sport] ?? "Sortie"}</span>
            <span className="cp-meta">{[SPORT_LABEL[a.sport] ?? a.sport, a.distance_km ? `${fmtKm(a.distance_km)} km` : null, a.gain_m ? `${fmtNum(a.gain_m)} m D+` : null, fmtDur(a.duration_min)].filter(Boolean).join(" · ")}</span>
          </span>
          <span className={`cp-check${on ? ` cp-${side === 0 ? "a" : "b"}` : ""}`} aria-hidden="true">{on ? (side === 0 ? "A" : "B") : ""}</span>
        </button>
      </li>
    );
  };
  const slot = (k: 0 | 1) => {
    const a = ids[k] != null ? byId.get(ids[k]) : null;
    return (
      <div className={`cp-slot cp-${k === 0 ? "a" : "b"}${a ? " is-full" : ""}`} key={a?.id ?? `e${k}`}>
        <i aria-hidden="true">{k === 0 ? "A" : "B"}</i>
        {a ? (
          <>
            <span><b>{a.name ?? SPORT_LABEL[a.sport]}</b><small>{dayLabel(a.date, { day: "numeric", month: "short", year: "numeric" })}{a.distance_km ? ` · ${fmtKm(a.distance_km)} km` : ""}</small></span>
            <button type="button" className="iconbtn sm" aria-label={`Retirer ${a.name ?? "cette sortie"}`} onClick={() => setIds((c) => c.filter((x) => x !== a.id))}>×</button>
          </>
        ) : <span className="muted small">{k === 0 ? "Première sortie" : "Deuxième sortie"}</span>}
      </div>
    );
  };
  const s = data?.strava;
  return (
    <>
      <FicheHead eyebrow="Comparer" title="Choisis 2 sorties" onClose={close} />
      <div className="panel-body cp">
        <div className="cp-slots">{slot(0)}{slot(1)}</div>
        <label className="cp-search">
          <IconSearch />
          <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, lieu, date, distance… « Salève », « 2025 », « 21 km »" aria-label="Rechercher une sortie" enterKeyHint="search" />
          {q && <button type="button" className="link small" onClick={() => setQ("")}>Effacer</button>}
        </label>
        {sports.length > 1 && (
          <div className="cp-sports" role="radiogroup" aria-label="Sport">
            {["all", ...sports].map((x) => (
              <button key={x} type="button" role="radio" aria-checked={sport === x} className={`chip${sport === x ? " on" : ""}`} onClick={() => setSport(x)}>{x === "all" ? "Tout" : SPORT_LABEL[x] ?? x}</button>
            ))}
          </div>
        )}
        {s?.connected && !s.historyDone && (
          <div className="banner cp-strava">
            <div>
              <b>{importing ? `Import en cours… ${fmtNum(importing.n)} sortie${importing.n > 1 ? "s" : ""}` : "Tout ton historique Strava"}</b>
              <div className="small muted">{importing?.oldest ? `Jusqu’au ${dayLabel(importing.oldest, { day: "numeric", month: "long", year: "numeric" })} pour l’instant.` : s.oldest ? `Tes sorties Strava sont importées depuis le ${dayLabel(s.oldest, { day: "numeric", month: "long", year: "numeric" })}.` : "Importe tes anciennes sorties pour les comparer."}</div>
            </div>
            <button type="button" className="btn strava sm" onClick={importAll} disabled={!!importing}>{importing ? "Import…" : "Tout importer"}</button>
          </div>
        )}
        {!data ? <div className="skeleton" style={{ height: 260 }} /> : (
          <>
            {similar.length > 0 && (
              <section className="cp-sec">
                <h3 className="fiche-h">Comparables à « {anchor?.name ?? "ta sortie"} »</h3>
                <ul className="cp-list">{similar.map(row)}</ul>
              </section>
            )}
            <section className="cp-sec">
              <h3 className="fiche-h" aria-live="polite">{words.length || sport !== "all" ? `${fmtNum(results.length)} résultat${results.length > 1 ? "s" : ""}` : `Toutes tes sorties · ${fmtNum(list.length)}`}</h3>
              {results.length === 0 ? <p className="empty">Aucune sortie ne correspond à « {q} ».</p> : <ul className="cp-list">{results.slice(0, shown).map(row)}</ul>}
              {results.length > shown && <button type="button" className="btn ghost sm" onClick={() => setShown((n) => n + PAGE)}>Afficher plus ({fmtNum(results.length - shown)})</button>}
            </section>
          </>
        )}
      </div>
      <div className={`cp-go${ids.length === 2 ? " is-ready" : ""}`}>
        <button type="button" className={`btn${ids.length < 2 ? " ghost" : ""}`} disabled={ids.length < 2} onClick={(e) => swap({ kind: "compare", a: ids[0], b: ids[1] }, e.currentTarget)}>
          <IconCompare />{ids.length < 2 ? `Choisis encore ${2 - ids.length} sortie${ids.length ? "" : "s"}` : "Comparer"}
        </button>
      </div>
    </>
  );
}
