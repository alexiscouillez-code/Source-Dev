"use client";

import { useEffect, useMemo, useState, type PointerEvent as RPointerEvent } from "react";
import { api, dayLabel, fmtDur, fmtKm, fmtNum, SPORT_LABEL } from "./client";
import { IconX } from "./icons";
import { paceOf, splitsOf, type RunDetail } from "./RunFiche";
import { paceText } from "./story";
import type { PanelProps } from "./Panels";

type Side = "a" | "b";
interface Row { k: string; a: number | null; b: number | null; fmt: (v: number) => string; diff: (d: number) => string; better?: "low" | "high" }

const signed = (n: number, f: (v: number) => string) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${f(Math.abs(n))}`;
const durFmt = (m: number) => fmtDur(Math.round(m));

/**
 * Comparaison de deux sorties (ou deux courses, ou deux éditions d'une même course), côte à côte :
 * duel chiffre par chiffre (barres qui partent du centre, le meilleur côté marqué), profils d'altitude
 * superposés, allure de chaque kilomètre et écart cumulé kilomètre après kilomètre, zones cardiaques.
 * Les courbes se dessinent à l'ouverture et se lisent du doigt (repère et valeurs des deux sorties).
 */
export default function Compare({ a, b, close }: PanelProps & { a: number; b: number }) {
  const [d, setD] = useState<{ a: RunDetail; b: RunDetail } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([api<RunDetail>(`/api/activities/${a}`), api<RunDetail>(`/api/activities/${b}`)])
      // La plus ancienne à gauche (A), la plus récente à droite (B).
      .then(([x, y]) => setD(x.activity.date <= y.activity.date ? { a: x, b: y } : { a: y, b: x }))
      .catch((e) => setErr(e instanceof Error ? e.message : "Erreur"));
  }, [a, b]);
  const head = (
    <header className="panel-head">
      <div className="panel-bar">
        <span className="eyebrow">Comparaison</span>
        <button type="button" className="iconbtn panel-x" aria-label="Fermer la comparaison" onClick={close}><IconX /></button>
      </div>
      <h2 id="panel-title" className="panel-title">{d ? "Face à face" : "Chargement…"}</h2>
      {d && (
        <div className="cmp-who">
          {(["a", "b"] as Side[]).map((s) => (
            <div key={s} className={`cmp-tag cmp-${s}`}>
              <i aria-hidden="true" />
              <b>{d[s].activity.name ?? SPORT_LABEL[d[s].activity.sport]}</b>
              <small>{dayLabel(d[s].activity.date, { day: "numeric", month: "short", year: "numeric" })}</small>
            </div>
          ))}
        </div>
      )}
    </header>
  );
  if (err) return <>{head}<div className="panel-body"><p className="note err">{err}</p></div></>;
  if (!d) return <>{head}<div className="panel-body"><div className="skeleton" style={{ height: 320 }} /></div></>;
  return <>{head}<Body d={d} /></>;
}

function Body({ d }: { d: { a: RunDetail; b: RunDetail } }) {
  const A = d.a.activity, B = d.b.activity;
  const pA = paceOf(A, d.a.moving), pB = paceOf(B, d.b.moving);
  const list: Row[] = [
    { k: "Distance", a: A.distance_km, b: B.distance_km, fmt: (v) => `${fmtKm(v)} km`, diff: (x) => `${signed(x, (v) => fmtKm(v))} km` },
    { k: "Dénivelé +", a: A.gain_m, b: B.gain_m, fmt: (v) => `${fmtNum(v)} m`, diff: (x) => `${signed(x, fmtNum)} m` },
    { k: "Durée", a: A.duration_min, b: B.duration_min, fmt: durFmt, diff: (x) => signed(x, durFmt) },
    { k: "Allure", a: pA, b: pB, fmt: (v) => `${paceText(v)} /km`, diff: (x) => `${signed(x, paceText)} /km`, better: "low" },
    { k: "Allure ajustée à la pente", a: A.insight?.gap ? 1000 / A.insight.gap * 60 : null, b: B.insight?.gap ? 1000 / B.insight.gap * 60 : null, fmt: (v) => `${paceText(v)} /km`, diff: (x) => `${signed(x, paceText)} /km`, better: "low" },
    { k: "FC moyenne", a: A.avg_hr, b: B.avg_hr, fmt: (v) => `${Math.round(v)} bpm`, diff: (x) => `${signed(Math.round(x), String)} bpm`, better: "low" },
    { k: "Charge", a: A.load, b: B.load, fmt: (v) => String(Math.round(v)), diff: (x) => signed(Math.round(x), String) },
    { k: "Tenue de l’endurance", a: A.insight?.dec ?? null, b: B.insight?.dec ?? null, fmt: (v) => `${String(v).replace(".", ",")} %`, diff: (x) => `${signed(Math.round(x * 10) / 10, (v) => String(v).replace(".", ","))} pt`, better: "low" },
    { k: "VO2max de la sortie", a: A.insight?.vo2 ?? null, b: B.insight?.vo2 ?? null, fmt: (v) => String(v).replace(".", ","), diff: (x) => signed(Math.round(x * 10) / 10, (v) => String(v).replace(".", ",")), better: "high" },
  ];
  const rows = list.filter((r) => r.a != null && r.b != null);

  const sA = splitsOf(d.a.km), sB = splitsOf(d.b.km);
  const facts = useMemo(() => insights(d, pA, pB), [d, pA, pB]);
  return (
    <div className="panel-body cmp">
      {facts.length > 0 && <ul className="cmp-facts reveal">{facts.map((f) => <li key={f}>{f}</li>)}</ul>}
      <section className="fiche-sec">
        <h3 className="fiche-h">Chiffre par chiffre</h3>
        <div className="duel" role="table" aria-label="Comparaison chiffre par chiffre">
          {rows.map((r, i) => {
            const max = Math.max(Math.abs(r.a!), Math.abs(r.b!)) || 1;
            const win: Side | null = !r.better || r.a === r.b ? null : (r.better === "low" ? r.a! < r.b! : r.a! > r.b!) ? "a" : "b";
            return (
              <div key={r.k} className="duel-row" role="row" style={{ ["--i" as string]: i }}>
                <span role="cell" className={`duel-v duel-a${win === "a" ? " win" : ""}`}>{r.fmt(r.a!)}</span>
                <span role="rowheader" className="duel-k">{r.k}<small>{r.a === r.b ? "identique" : r.diff(r.b! - r.a!)}</small></span>
                <span role="cell" className={`duel-v duel-b${win === "b" ? " win" : ""}`}>{r.fmt(r.b!)}</span>
                <span className="duel-bars" aria-hidden="true"><i className="duel-bar-a" style={{ ["--w" as string]: Math.abs(r.a!) / max }} /><i className="duel-bar-b" style={{ ["--w" as string]: Math.abs(r.b!) / max }} /></span>
              </div>
            );
          })}
        </div>
      </section>
      {d.a.profile && d.b.profile && A.distance_km && B.distance_km && (
        <section className="fiche-sec">
          <h3 className="fiche-h">Profils superposés</h3>
          <Lines label="Profils d’altitude des deux sorties" unit="m" xMax={Math.max(A.distance_km, B.distance_km)} xUnit="km"
            a={d.a.profile.map((z, i, l) => [(i / (l.length - 1)) * A.distance_km!, z])} b={d.b.profile.map((z, i, l) => [(i / (l.length - 1)) * B.distance_km!, z])}
            fmtY={(v) => `${Math.round(v)} m`} area />
        </section>
      )}
      {sA && sB && sA.length >= 2 && sB.length >= 2 && (
        <>
          <section className="fiche-sec">
            <h3 className="fiche-h">Allure au kilomètre</h3>
            <Lines label="Allure de chaque kilomètre" unit="/km" xMax={Math.max(sA.length, sB.length)} xUnit="km" invert
              a={sA.map((s, i) => [i + 1, s])} b={sB.map((s, i) => [i + 1, s])} fmtY={(v) => `${paceText(v)} /km`} />
          </section>
          <Gap a={d.a.km!} b={d.b.km!} />
        </>
      )}
      {A.insight?.zones && B.insight?.zones && (
        <section className="fiche-sec">
          <h3 className="fiche-h">Zones cardiaques</h3>
          {(["a", "b"] as Side[]).map((s) => {
            const z = d[s].activity.insight!.zones!, t = z.reduce((x, y) => x + y, 0) || 1;
            return (
              <div key={s} className={`cmp-zones cmp-${s}`}>
                <i className="cmp-dot" aria-hidden="true" />
                <div className="zbar" role="img" aria-label={`Sortie ${s.toUpperCase()} : ${z.map((m, k) => `zone ${k + 1} ${m} min`).join(", ")}`}>
                  {z.map((m, k) => m > 0 && <i key={k} className={`z${k + 1}`} style={{ flexGrow: m }}>{m / t > 0.12 ? `Z${k + 1}` : ""}</i>)}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

/** Quelques phrases qui résument l'écart entre les deux sorties. */
function insights(d: { a: RunDetail; b: RunDetail }, pA: number | null, pB: number | null): string[] {
  const A = d.a.activity, B = d.b.activity, out: string[] = [];
  const same = A.distance_km && B.distance_km && Math.abs(A.distance_km - B.distance_km) / Math.max(A.distance_km, B.distance_km) < 0.08 && Math.abs((A.gain_m ?? 0) - (B.gain_m ?? 0)) < Math.max(150, 0.15 * Math.max(A.gain_m ?? 0, B.gain_m ?? 0));
  if (same) {
    const dt = B.duration_min - A.duration_min;
    if (Math.abs(dt) >= 1) out.push(`Parcours comparable : la plus récente a été ${dt < 0 ? `plus rapide de ${fmtDur(-dt)}` : `plus lente de ${fmtDur(dt)}`}.`);
    else out.push("Parcours comparable, et presque le même temps.");
  } else if (A.distance_km && B.distance_km) {
    out.push(`La plus récente fait ${fmtKm(Math.abs(B.distance_km - A.distance_km))} km de ${B.distance_km > A.distance_km ? "plus" : "moins"}${B.gain_m != null && A.gain_m != null && Math.abs(B.gain_m - A.gain_m) >= 50 ? ` et ${fmtNum(Math.abs(B.gain_m - A.gain_m))} m de D+ de ${B.gain_m > A.gain_m ? "plus" : "moins"}` : ""}.`);
  }
  if (A.avg_hr && B.avg_hr && pA && pB) {
    const dHr = B.avg_hr - A.avg_hr, dP = pB - pA;
    if (dP <= 0 && dHr <= -2) out.push(`Plus vite et le cœur plus bas (${Math.round(dHr)} bpm) : un vrai signe de progrès.`);
    else if (dP >= 0 && dHr <= -4) out.push(`Cœur plus bas de ${Math.round(-dHr)} bpm pour une allure ${dP > 5 ? "un peu plus lente" : "proche"} : sortie plus économique.`);
    else if (dP <= -5 && dHr >= 4) out.push(`Plus rapide, mais ${Math.round(dHr)} bpm de plus : l’effort a été plus intense.`);
  }
  const gA = d.a.activity.insight?.gap, gB = d.b.activity.insight?.gap;
  if (gA && gB) { const sA = 60000 / gA, sB = 60000 / gB, x = sB - sA; if (Math.abs(x) >= 6) out.push(`À pente égale, la plus récente est ${x < 0 ? "plus rapide" : "plus lente"} de ${paceText(Math.abs(x))} /km.`); }
  return out.slice(0, 3);
}

/**
 * Deux courbes sur les mêmes axes (A et B), dessinées à l'ouverture. `invert` : les petites valeurs en haut
 * (une allure rapide est un petit nombre). Du doigt : un repère vertical et les valeurs des deux sorties.
 */
function Lines({ a, b, xMax, xUnit, fmtY, label, invert = false, area = false }: {
  a: [number, number][]; b: [number, number][]; xMax: number; xUnit: string; unit: string; fmtY: (v: number) => string; label: string; invert?: boolean; area?: boolean;
}) {
  const W = 340, H = 150, P = 6;
  const ys = [...a, ...b].map((p) => p[1]);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const x = (v: number) => P + (v / xMax) * (W - P * 2);
  const y = (v: number) => { const k = (v - lo) / (hi - lo); return invert ? P + k * (H - P * 2) : H - P - k * (H - P * 2); };
  const path = (l: [number, number][]) => l.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(" ");
  const fill = (l: [number, number][]) => `${path(l)} L${x(l[l.length - 1][0]).toFixed(1)} ${H} L${x(l[0][0]).toFixed(1)} ${H} Z`;
  const [at, setAt] = useState<number | null>(null);
  const near = (l: [number, number][], v: number) => l.reduce((best, p) => (Math.abs(p[0] - v) < Math.abs(best[0] - v) ? p : best), l[0]);
  const move = (e: RPointerEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); setAt(Math.max(0, Math.min(xMax, ((e.clientX - r.left) / r.width) * xMax))); };
  const pa = at != null ? near(a, at) : null, pb = at != null ? near(b, at) : null;
  return (
    <figure className={`cmp-lines${at != null ? " is-scrub" : ""}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ touchAction: "pan-y" }}
        onPointerDown={move} onPointerMove={(e) => { if (e.pointerType === "mouse" || e.buttons) move(e); }} onPointerLeave={() => setAt(null)}>
        {[0.25, 0.5, 0.75].map((k) => <line key={k} className="cmp-grid" x1={P} x2={W - P} y1={P + k * (H - P * 2)} y2={P + k * (H - P * 2)} />)}
        {area && <path className="cmp-area cmp-a" d={fill(a)} />}
        {area && <path className="cmp-area cmp-b" d={fill(b)} />}
        <path className="cmp-line cmp-a" d={path(a)} pathLength={1} />
        <path className="cmp-line cmp-b" d={path(b)} pathLength={1} />
        {at != null && <line className="cmp-guide" x1={x(at)} x2={x(at)} y1={0} y2={H} />}
        {pa && <circle className="cmp-pt cmp-a" cx={x(pa[0])} cy={y(pa[1])} r={4} />}
        {pb && <circle className="cmp-pt cmp-b" cx={x(pb[0])} cy={y(pb[1])} r={4} />}
      </svg>
      <figcaption className="cmp-cap">
        {at != null && pa && pb
          ? <><span>{xUnit} {fmtKm(at)}</span><b className="cmp-a">{fmtY(pa[1])}</b><b className="cmp-b">{fmtY(pb[1])}</b></>
          : <><span>0</span><span className="muted">Glisse le doigt sur la courbe</span><span>{fmtKm(xMax)} {xUnit}</span></>}
      </figcaption>
    </figure>
  );
}

/** Écart cumulé kilomètre par kilomètre : barres au-dessus quand la plus récente est en avance. */
function Gap({ a, b }: { a: number[]; b: number[] }) {
  const n = Math.min(a.length, b.length);
  const gaps = Array.from({ length: n }, (_, i) => b[i] - a[i]); // secondes : négatif = B en avance
  const max = Math.max(30, ...gaps.map(Math.abs));
  const last = gaps[n - 1];
  const fmt = (s: number) => { const v = Math.abs(Math.round(s)); return v >= 60 ? `${Math.floor(v / 60)} min ${String(v % 60).padStart(2, "0")}` : `${v} s`; };
  return (
    <section className="fiche-sec">
      <div className="row between"><h3 className="fiche-h">Écart cumulé</h3><span className="small muted">au km {n} : {last === 0 ? "à égalité" : `${fmt(last)} ${last < 0 ? "d’avance" : "de retard"}`} pour la plus récente</span></div>
      <div className="cmp-gap" role="img" aria-label={`Écart cumulé au fil des kilomètres ; au kilomètre ${n}, ${fmt(last)} ${last < 0 ? "d’avance" : "de retard"} pour la plus récente.`}>
        {gaps.map((g, i) => (
          <span key={i} className={g < 0 ? "ahead" : g > 0 ? "behind" : ""} style={{ ["--h" as string]: Math.abs(g) / max, ["--i" as string]: i }} title={`km ${i + 1} : ${g === 0 ? "égalité" : `${fmt(g)} ${g < 0 ? "d’avance" : "de retard"}`}`} />
        ))}
      </div>
      <div className="cmp-gap-leg small muted"><span><i className="ahead" />En avance (plus récente)</span><span><i className="behind" />En retard</span></div>
    </section>
  );
}
