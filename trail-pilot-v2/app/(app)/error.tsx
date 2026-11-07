"use client";

import { useEffect } from "react";
import { reportError } from "@/components/ErrorReporter";

/** Écran affiché si une partie de l’espace plante : l’erreur est signalée et on peut réessayer. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportError(error); }, [error]);
  return (
    <main style={{ minHeight: "70vh", display: "grid", placeContent: "center", gap: 14, padding: 24, textAlign: "center", maxWidth: 520, margin: "0 auto" }}>
      <span className="eyebrow">Oups</span>
      <h1 style={{ margin: 0, fontSize: 30 }}>Quelque chose s’est mal passé.</h1>
      <p className="soft" style={{ margin: 0 }}>L’erreur nous a été signalée automatiquement. Tes données ne sont pas perdues.</p>
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="btn" onClick={reset}>Réessayer</button>
        <a className="btn ghost" href="/espace">Recharger mon espace</a>
      </div>
    </main>
  );
}
