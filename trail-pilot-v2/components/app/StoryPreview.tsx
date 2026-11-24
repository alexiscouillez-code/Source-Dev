"use client";

import { useEffect, useRef, useState } from "react";
import { shareImage } from "./story";
import { haptic } from "@/components/haptics";

/**
 * Aperçu d'une image story avant de la partager : la carte arrive en se redressant, comme posée sur la table.
 * « Partager » ouvre la feuille de partage du téléphone (ou télécharge l'image sur ordinateur).
 */
export default function StoryPreview({ make, filename, title, onClose, toast }: {
  make: () => Promise<Blob>; filename: string; title: string; onClose: () => void; toast: (m: string) => void;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const shareBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let u = "";
    let off = false;
    make().then((b) => { if (off) return; setBlob(b); u = URL.createObjectURL(b); setUrl(u); window.setTimeout(() => shareBtn.current?.focus({ preventScroll: true }), 50); }).catch(() => setFailed(true));
    return () => { off = true; if (u) URL.revokeObjectURL(u); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Échap ferme l'aperçu (et pas la fiche dessous).
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onClose]);
  async function share() {
    if (!blob) return;
    haptic("tap");
    const r = await shareImage(blob, filename, title);
    if (r === "downloaded") toast("Image téléchargée : ajoute-la à ta story depuis ta galerie.");
    if (r !== "cancelled") onClose();
  }
  return (
    <div className="story-prev" role="dialog" aria-modal="true" aria-label="Aperçu de l’image à partager" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`story-frame${url ? " is-ready" : ""}`}>
        {url ? <img src={url} alt="Aperçu de l’image à partager en story" /> : (
          <div className="story-load">{failed ? "Impossible de créer l’image pour le moment." : <><span className="story-dots" aria-hidden="true"><i /><i /><i /></span>Création de l’image…</>}</div>
        )}
      </div>
      <div className="story-acts">
        <button ref={shareBtn} type="button" className="btn" disabled={!blob} onClick={share}>Partager</button>
        <button type="button" className="btn ghost" onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}
