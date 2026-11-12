"use client";

import { useState } from "react";
import { api } from "./client";
import Fold from "./Fold";

/** « Un retour ? » : signaler un bug, proposer une idée, faire une remarque, sans quitter l’appli. */
export default function Feedback({ toast, page }: { toast: (m: string) => void; page: string }) {
  const [kind, setKind] = useState<"bug" | "idee" | "autre">("idee");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await api("/api/feedback", { method: "POST", body: { kind, text, page } }); setText(""); toast("Merci ! Ton retour est bien arrivé."); }
    catch (e2) { toast(e2 instanceof Error ? e2.message : "Erreur"); }
    finally { setBusy(false); }
  }
  return (
    <Fold id="acc-feedback" title="Un retour ?" aside={<span className="chip dim">Bug, idée, remarque</span>}>
      <form className="form" onSubmit={send}>
        <div className="db-tags" role="radiogroup" aria-label="Type de retour">
          {([["bug", "Un bug"], ["idee", "Une idée"], ["autre", "Une remarque"]] as const).map(([k, l]) => (
            <button type="button" key={k} role="radio" aria-checked={kind === k} className={`db-tag ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div>
        <label className="field">Ton message
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} required minLength={3}
            placeholder={kind === "bug" ? "Ce que tu faisais, ce qui s’est passé, sur quel appareil…" : "Ce qui te manque, ce qui t’agace, ce qui t’aide…"} />
        </label>
        <div className="row"><button className="btn sm" disabled={busy || text.trim().length < 3}>{busy ? "Envoi…" : "Envoyer"}</button></div>
      </form>
    </Fold>
  );
}
