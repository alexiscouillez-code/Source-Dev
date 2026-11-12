"use client";

import { useState } from "react";
import StrengthGuide from "./StrengthGuide";

/** Séance (ou partie de séance) de renforcement : ouvre la fiche des exercices et le mode guidé. */
export const hasStrength = (s: { template: string; title: string }) => s.template === "strength" || /renforcement/i.test(s.title);

export default function StrengthButton({ s, onDone }: { s: { template: string; title: string; phase: string; duration_min: number }; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  if (!hasStrength(s)) return null;
  return (
    <>
      <button className="btn ghost sm" onClick={() => setOpen(true)}>Renfo guidé</button>
      {open && <StrengthGuide phase={s.phase} minutes={s.template === "strength" ? s.duration_min : 20} onClose={() => setOpen(false)} onDone={onDone} />}
    </>
  );
}
