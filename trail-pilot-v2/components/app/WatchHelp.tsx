"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Mode d’emploi du fichier montre (.fit) : affiché au premier téléchargement d’une séance, puis sur demande
 * (événement « tp-watch-help »). Envoyer directement sur la montre demanderait un accord commercial avec Garmin.
 */
export default function WatchHelp() {
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => setOpen((e as CustomEvent<string>).detail || "");
    window.addEventListener("tp-watch-help", on);
    return () => window.removeEventListener("tp-watch-help", on);
  }, []);
  useEffect(() => { if (open == null) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open]);
  if (open == null) return null;
  return createPortal(
    <div className="sheet-back" role="dialog" aria-modal="true" aria-labelledby="wh-title" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
      <div className="sheet wh">
        <div className="row between"><h2 id="wh-title" style={{ margin: 0 }}>Mettre la séance sur ta montre</h2><button className="iconbtn" aria-label="Fermer" onClick={() => setOpen(null)}>×</button></div>
        {open && <p className="soft small" style={{ margin: 0 }}>Fichier téléchargé : <b className="mono">{open}</b></p>}
        <section>
          <h3>Garmin, depuis un ordinateur</h3>
          <ol>
            <li>Branche la montre à l’ordinateur avec son câble.</li>
            <li>Ouvre la montre comme une clé USB (sur Mac, avec l’outil gratuit Android File Transfer pour certains modèles), puis le dossier <b className="mono">GARMIN/NewFiles</b>.</li>
            <li>Copie le fichier téléchargé dans ce dossier, puis débranche la montre.</li>
            <li>Sur la montre : <b>Entraînement › Séances</b>. La séance y est, avec ses étapes et ses zones cardio.</li>
          </ol>
        </section>
        <section>
          <h3>Depuis un téléphone</h3>
          <p>Garmin Connect n’importe pas ce type de fichier depuis le téléphone. Le plus simple : télécharge la séance depuis un ordinateur, ou recopie ses étapes dans Garmin Connect (Entraînement › Séances › Créer). Le déroulé affiché dans Trail Pilot donne chaque étape avec sa durée et sa zone.</p>
        </section>
        <section>
          <h3>Autres montres</h3>
          <p>Coros, Suunto, Wahoo : le fichier .fit s’importe en général depuis leur appli ou leur site (rubrique entraînements). Chaque marque a sa démarche, vérifie dans son aide.</p>
        </section>
        <p className="muted small" style={{ margin: 0 }}>L’envoi direct sur la montre, sans câble, demande un accord avec Garmin : la demande est en cours de préparation.</p>
        <button className="btn" onClick={() => setOpen(null)}>J’ai compris</button>
      </div>
    </div>, document.body);
}
