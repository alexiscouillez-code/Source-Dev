"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, dayLabel, fmtDur, fmtKm, fmtNum } from "./client";
import type { Ctx } from "./AppShell";
import { IconCompare, IconFlag, IconPlus } from "./icons";
import { getPick, openPanel, PICK_EVENT, setPick, togglePick, type PickState } from "./panel";
import { setQuick } from "./quick";
import type { RaceEntry } from "@/lib/races";

const TONE = { mieux: "ok", prevu: "", moins: "lite", inconnu: "dim" } as const;

/**
 * Mes courses : toutes les courses au même endroit. À venir (course principale et préparation, compte à rebours,
 * temps estimé) puis courues, par année (temps, résultat face à l'estimation, débrief fait ou à faire).
 * Toucher une course passée ouvre sa fiche et son débrief ; « Comparer » permet d'en choisir deux.
 */
export default function Races({ go, toast }: Ctx) {
  const [list, setList] = useState<RaceEntry[] | null>(null);
  const load = useCallback(async () => { try { setList((await api<{ races: RaceEntry[] }>("/api/races?all=1")).races); } catch (e) { toast(e instanceof Error ? e.message : "Erreur"); setList([]); } }, [toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const on = () => { load(); }; window.addEventListener("tp-synced", on); window.addEventListener("tp-panel-closed", on); return () => { window.removeEventListener("tp-synced", on); window.removeEventListener("tp-panel-closed", on); }; }, [load]);
  const [pick, setP] = useState<PickState>(getPick());
  useEffect(() => { const on = (e: Event) => setP((e as CustomEvent<PickState>).detail); window.addEventListener(PICK_EVENT, on); return () => window.removeEventListener(PICK_EVENT, on); }, []);

  const upcoming = useMemo(() => (list ?? []).filter((r) => !r.past), [list]);
  const past = useMemo(() => (list ?? []).filter((r) => r.past), [list]);
  const years = useMemo(() => [...new Set(past.map((r) => r.date.slice(0, 4)))], [past]);
  const done = past.filter((r) => r.activity);
  const km = done.reduce((t, r) => t + (r.activity?.distanceKm ?? 0), 0), gain = done.reduce((t, r) => t + (r.activity?.gainM ?? 0), 0);
  const todo = past.filter((r) => r.activity && !r.debriefDone).length;

  const openRace = (r: RaceEntry, el: HTMLElement) => {
    if (pick.on) { if (r.activity) togglePick(r.activity.id, el); else toast("Pas de sortie enregistrée pour cette course."); return; }
    if (r.past) { openPanel({ kind: "race", key: r.key }, el); return; }
    // Course à venir : la principale dans le Planning, une course de préparation dans sa rubrique.
    setQuick({ kind: "jump", sel: r.main ? ".race" : "[data-fold=plan-sides]" });
    go("plan");
  };

  return (
    <>
      <header className="head">
        <div><span className="eyebrow">{list ? `${past.length} courue${past.length > 1 ? "s" : ""} · ${upcoming.length} à venir` : "Courses"}</span><h1>Mes courses</h1></div>
        <div className="row">
          {done.length >= 2 && <button type="button" className={`btn ghost sm${pick.on ? " on" : ""}`} aria-pressed={pick.on} onClick={() => setPick(pick.on ? { on: false, ids: [] } : { on: true, ids: [] })}><IconCompare />{pick.on ? "Annuler" : "Comparer"}</button>}
          <button type="button" className="btn sm" onClick={() => { setQuick({ kind: "jump", sel: "[data-fold=plan-sides] .btn", text: "Ajouter une course", press: true }); go("plan"); }}><IconPlus />Ajouter</button>
        </div>
      </header>
      {!list ? <div className="skeleton" style={{ height: 260 }} /> : (
        <>
          {done.length > 0 && (
            <div className="races-kpis reveal">
              <div><b className="num-up">{done.length}</b><small>course{done.length > 1 ? "s" : ""} courue{done.length > 1 ? "s" : ""}</small></div>
              <div><b className="num-up">{fmtKm(km)}</b><small>km de course</small></div>
              <div><b className="num-up">{fmtNum(gain)}</b><small>m D+</small></div>
              <div><b className="num-up">{todo}</b><small>débrief{todo > 1 ? "s" : ""} à faire</small></div>
            </div>
          )}
          {pick.on && <p className="note small races-pick">Touche deux courses courues pour comparer leurs sorties.</p>}

          <section className="card" style={{ marginTop: 14 }} aria-labelledby="races-next">
            <div className="card-head"><h2 id="races-next">À venir</h2></div>
            {upcoming.length === 0 ? (
              <p className="empty">Aucune course prévue. Choisis ta prochaine course principale dans le Planning, ou ajoute une course de préparation.</p>
            ) : (
              <ul className="races-list">
                {upcoming.map((r, i) => (
                  <li key={r.key} style={{ ["--i" as string]: i }}>
                    <button type="button" className={`race-row is-next${r.main ? " is-main" : ""}`} onClick={(e) => openRace(r, e.currentTarget)}>
                      <span className="rr-count" aria-hidden="true"><b>{r.daysTo}</b><small>jour{r.daysTo > 1 ? "s" : ""}</small></span>
                      <span className="rr-main">
                        <span className="rr-name">{r.main ? <IconFlag /> : null}{r.name}</span>
                        <span className="rr-meta">{dayLabel(r.date, { weekday: "short", day: "numeric", month: "long", year: "numeric" })}{r.distanceKm ? ` · ${fmtKm(r.distanceKm)} km` : ""}{r.gainM ? ` · ${fmtNum(r.gainM)} m D+` : ""}</span>
                      </span>
                      <span className="rr-side">
                        {r.estimate ? <><b className="mono">{fmtDur(r.estimate.low)} – {fmtDur(r.estimate.high)}</b><small>estimé</small></> : <span className="chip dim">{r.main ? "Principale" : r.priority === "B" ? "Objectif secondaire" : "Entraînement"}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" style={{ marginTop: 14 }} aria-labelledby="races-done">
            <div className="card-head"><h2 id="races-done">Courues</h2>{past.length > 0 && <span className="small muted">Touche une course pour son débrief</span>}</div>
            {past.length === 0 ? (
              <p className="empty">Tes courses passées apparaîtront ici avec leur temps, l’écart avec l’estimation et leur débrief.</p>
            ) : years.map((y) => (
              <div key={y} className="races-year">
                <h3 className="races-y"><span>{y}</span></h3>
                <ul className="races-list">
                  {past.filter((r) => r.date.startsWith(y)).map((r, i) => {
                    const picked = !!r.activity && pick.ids.includes(r.activity.id);
                    return (
                      <li key={r.key} style={{ ["--i" as string]: i }}>
                        <button type="button" className={`race-row${r.main ? " is-main" : ""}${picked ? " is-picked" : ""}${pick.on && !r.activity ? " is-off" : ""}`} aria-pressed={pick.on ? picked : undefined} onClick={(e) => openRace(r, e.currentTarget)}>
                          <span className="rr-date" aria-hidden="true"><b>{Number(r.date.slice(8, 10))}</b><small>{dayLabel(r.date, { month: "short" }).replace(".", "")}</small></span>
                          <span className="rr-main">
                            <span className="rr-name">{r.main ? <IconFlag /> : null}{r.name}</span>
                            <span className="rr-meta">{r.activity ? `${r.activity.distanceKm ? `${fmtKm(r.activity.distanceKm)} km` : ""}${r.activity.gainM ? ` · ${fmtNum(r.activity.gainM)} m D+` : ""}` : "Sortie pas encore importée"}{r.edition ? ` · déjà courue en ${r.edition.date.slice(0, 4)}` : ""}</span>
                          </span>
                          <span className="rr-side">
                            {r.activity && <b className="mono">{fmtDur(r.activity.durationMin)}</b>}
                            {r.result ? <span className={`chip ${TONE[r.result.tone]}`}>{r.result.tone === "mieux" ? "Mieux que prévu" : r.result.tone === "prevu" ? "Comme prévu" : r.result.tone === "moins" ? "Plus long que prévu" : "—"}</span>
                              : r.activity && !r.debriefDone ? <span className="chip ember">Débrief à faire</span> : null}
                          </span>
                          {pick.on && <span className="pick-mark" aria-hidden="true" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
