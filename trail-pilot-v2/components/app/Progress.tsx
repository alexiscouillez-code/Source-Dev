"use client";

import { useEffect, useState } from "react";
import { api, dayLabel, fmtDur, fmtKm, fmtNum } from "./client";
import type { Progress as Data } from "@/lib/progress";

const monthShort = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");

/** Progression : volume mois par mois, records, chronos sur tes boucles et historique des courses. */
export default function Progress() {
  const [d, setD] = useState<Data | null>(null);
  const [metric, setMetric] = useState<"km" | "gain" | "minutes">("km");
  useEffect(() => { api<Data>("/api/progress").then(setD).catch(() => setD(null)); }, []);
  if (!d || (!d.months.some((m) => m.count) && !d.records.length)) return null;
  const vals = d.months.map((m) => m[metric]), max = Math.max(1, ...vals);
  const fmt = (v: number) => (metric === "km" ? `${fmtKm(v)} km` : metric === "gain" ? `${fmtNum(v)} m` : fmtDur(v));
  return (
    <section className="card progress" style={{ marginTop: 14 }} aria-labelledby="prog-title">
      <div className="card-head">
        <h2 id="prog-title">Progression</h2>
        <div className="seg sm" role="group" aria-label="Mesure">
          {([["km", "Distance"], ["gain", "D+"], ["minutes", "Temps"]] as const).map(([k, l]) => <button key={k} className={metric === k ? "on" : ""} onClick={() => setMetric(k)}>{l}</button>)}
        </div>
      </div>
      <div className="month-bars" role="img" aria-label={`Volume par mois sur 12 mois (${metric === "km" ? "distance" : metric === "gain" ? "dénivelé" : "temps"})`}>
        {d.months.map((m, i) => (
          <div key={m.month} title={`${monthShort(m.month)} : ${fmt(m[metric])}`}>
            <span className="mb-v">{m[metric] ? fmt(m[metric]).replace(" km", "").replace(" m", "") : ""}</span>
            <i key={metric} style={{ ["--h" as string]: `${(m[metric] / max) * 100}%`, ["--d" as string]: `${i * 35}ms` }} />
            <small><span className="mfull">{monthShort(m.month)}</span><span className="m1">{monthShort(m.month).charAt(0).toUpperCase()}</span></small>
          </div>
        ))}
      </div>

      {d.records.length > 0 && (
        <div className="records">
          {d.records.map((r) => (
            <div key={r.label}><small>{r.label}</small><b>{r.value}</b><span className="muted">{r.name ? `${r.name} · ` : ""}{r.label === "Plus gros mois" ? new Date(`${r.date}T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : dayLabel(r.date, { day: "numeric", month: "short", year: "numeric" })}</span></div>
          ))}
        </div>
      )}

      {d.loops.length > 0 && (
        <>
          <h3 style={{ margin: "6px 0 0" }}>Tes boucles habituelles</h3>
          <ul className="list loops">
            {d.loops.map((l) => {
              const gainVsFirst = l.first.minutes - l.last.minutes;
              return (
                <li key={l.name + l.km} className="item" style={{ gridTemplateColumns: "1fr auto" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="t">{l.name}</div>
                    <div className="s">{fmtKm(l.km)} km{l.gain ? ` · ${fmtNum(l.gain)} m D+` : ""} · courue {l.runs} fois · dernière fois {fmtDur(l.last.minutes)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <b className="mono">{fmtDur(l.best.minutes)}</b>
                    <div className="small muted">record du {dayLabel(l.best.date, { day: "numeric", month: "short" })}</div>
                    {Math.abs(gainVsFirst) >= 1 && <span className={`chip ${gainVsFirst > 0 ? "ok" : "dim"}`}>{gainVsFirst > 0 ? "−" : "+"}{fmtDur(Math.abs(Math.round(gainVsFirst)))} vs 1re fois</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {d.races.length > 0 && (
        <>
          <h3 style={{ margin: "6px 0 0" }}>Tes courses</h3>
          <ul className="list">
            {d.races.map((r) => (
              <li key={r.name + r.date} className="item" style={{ gridTemplateColumns: "1fr auto" }}>
                <div><div className="t">⚑ {r.name}</div><div className="s">{dayLabel(r.date, { day: "numeric", month: "long", year: "numeric" })}{r.km ? ` · ${fmtKm(r.km)} km` : ""}{r.gain ? ` · ${fmtNum(r.gain)} m D+` : ""}</div></div>
                <b className="mono">{r.minutes ? fmtDur(r.minutes) : "—"}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
