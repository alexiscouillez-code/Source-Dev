"use client";

import { fmtPace, sessionTarget } from "@/lib/engine/paces";
import type { Targets } from "./client";

/** Consigne chiffrée d’une séance : allure sur plat et fréquence cardiaque, tirées de ta VO2max. */
export function SessionTarget({ targets, template, rpe }: { targets: Targets | undefined; template: string; rpe: number }) {
  if (!targets) return null;
  const t = sessionTarget(targets as Parameters<typeof sessionTarget>[0], template, rpe);
  const z = t.zones && targets.zones.length ? [targets.zones[t.zones[0] - 1], targets.zones[t.zones[1] - 1]] : null;
  if (!t.pace && !z) return null;
  return (
    <div className="target">
      {t.pace && <span><small>Allure sur plat</small><b className="mono">{fmtPace(t.pace.fast)}–{fmtPace(t.pace.slow)} /km</b></span>}
      {z && <span><small>Fréquence cardiaque{z[0].z === z[1].z ? ` · zone ${z[0].z}` : ` · zones ${z[0].z}-${z[1].z}`}</small><b className="mono">{z[0].low}–{z[1].high} bpm</b></span>}
      {t.hint && <em>{t.hint}</em>}
    </div>
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
