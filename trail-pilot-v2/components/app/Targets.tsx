"use client";

import { fmtPace, sessionTarget } from "@/lib/engine/paces";
import type { Targets } from "./client";
import { stepsFor } from "./workout";

/** Consigne chiffrée d’une séance : allure sur plat et fréquence cardiaque, tirées de ta VO2max. */
export function SessionTarget({ targets, template, rpe, duration, title }: { targets: Targets | undefined; template: string; rpe: number; duration?: number; title?: string }) {
  if (!targets) return null;
  const t = sessionTarget(targets as Parameters<typeof sessionTarget>[0], template, rpe);
  const z = t.zones && targets.zones.length ? [targets.zones[t.zones[0] - 1], targets.zones[t.zones[1] - 1]] : null;
  if (!t.pace && !z) {
    if (template === "strength" || template === "race") return null;
    return <p className="target-missing">Renseigne ta FC max (et ta VO2max si ta montre la donne) dans Compte : chaque séance affichera ses allures et son cardio cibles.</p>;
  }
  return (
    <>
    <div className="target">
      {t.pace && <span><small>Allure sur plat</small><b className="mono">{fmtPace(t.pace.fast)}–{fmtPace(t.pace.slow)} /km</b></span>}
      {z && <span><small>Fréquence cardiaque{z[0].z === z[1].z ? ` · zone ${z[0].z}` : ` · zones ${z[0].z}-${z[1].z}`}</small><b className="mono">{z[0].low}–{z[1].high} bpm</b></span>}
      {t.hint && <em>{t.hint}</em>}
    </div>
    {duration != null && <Steps targets={targets} template={template} duration={duration} title={title ?? ""} />}
    </>
  );
}

/** Déroulé de la séance, étape par étape, avec l’allure et le cardio de chacune. */
function Steps({ targets, template, duration, title }: { targets: Targets; template: string; duration: number; title: string }) {
  const steps = stepsFor({ template, duration_min: duration, title });
  if (steps.length < 2) return null;
  const bpm = (z?: [number, number]) => { if (!z) return null; const lo = targets.zones.find((x) => x.z === z[0]), hi = targets.zones.find((x) => x.z === z[1]); return lo && hi ? `${lo.low}–${hi.high} bpm` : null; };
  const pace = (k?: "E" | "T" | "I") => { const p = k ? targets.paces.find((x) => x.key === k) : null; return p ? `${fmtPace(p.fast)}–${fmtPace(p.slow)} /km` : null; };
  const fmtMin = (m: number) => (m < 1 ? `${Math.round(m * 60)} s` : Number.isInteger(m) ? `${m} min` : `${String(m).replace(".", ",")} min`);
  const rows: { lead: string; name: string; detail: string; kind: string }[] = [];
  steps.forEach((s) => {
    // Le marqueur de répétition suit les étapes répétées : on l’affiche en tête du bloc.
    if (s.repeat) { rows.splice(s.repeat.from, 0, { lead: `${s.repeat.times} ×`, name: "à répéter :", detail: "", kind: "rep" }); return; }
    rows.push({ lead: s.open ? "—" : fmtMin(s.min ?? 0), name: s.name, detail: [pace(s.pace), bpm(s.zone)].filter(Boolean).join(" · ") + (s.notes ? `${pace(s.pace) || bpm(s.zone) ? " — " : ""}${s.notes}` : ""), kind: s.intensity === 0 ? "work" : s.intensity === 4 ? "rest" : "easy" });
  });
  return (
    <ol className="steps">
      {rows.map((r, k) => <li key={k} className={`st-${r.kind}`}><b>{r.lead}</b><span>{r.name}{r.detail && <small>{r.detail}</small>}</span></li>)}
    </ol>
  );
}

/** Tableau des allures et des zones cardio personnelles. */
export function TargetsTable({ targets }: { targets: Targets }) {
  if (!targets.paces.length && !targets.zones.length) return null;
  return (
    <div className="targets-grid">
      {targets.paces.length > 0 && (
        <div>
          <h3 style={{ marginBottom: 8 }}>Tes allures d’entraînement</h3>
          <ul className="tlist">
            {targets.paces.map((p) => (
              <li key={p.key}><span><b>{p.label}</b><small>{p.use}</small></span><span className="mono">{fmtPace(p.fast)}–{fmtPace(p.slow)}<small> /km</small></span></li>
            ))}
          </ul>
        </div>
      )}
      {targets.zones.length > 0 && (
        <div>
          <h3 style={{ marginBottom: 8 }}>Tes zones cardio</h3>
          <ul className="tlist">
            {targets.zones.map((z) => (
              <li key={z.z}><span><b><i className={`zchip z${z.z}`}>Z{z.z}</i>{z.label}</b></span><span className="mono">{z.low}–{z.high}<small> bpm</small></span></li>
            ))}
          </ul>
          <p className="muted small" style={{ margin: "8px 0 0" }}>{targets.method === "reserve" ? "Calculées sur ta réserve cardiaque (FC max et FC repos)." : "Calculées sur ta FC max. Ajoute ta FC repos pour des zones plus justes."}</p>
        </div>
      )}
    </div>
  );
}
