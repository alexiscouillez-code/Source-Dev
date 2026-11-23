/**
 * Action rapide demandée depuis le bouton + de la barre du bas, reprise par l'écran qui s'ouvre ensuite
 * (Séances : ajouter une sortie ou lire un fichier ; Aujourd'hui : ouvrir le check-in).
 * Une seule action en attente ; elle est consommée par le premier écran qui la prend.
 */
export type Quick = { kind: "add" } | { kind: "file"; file: File } | { kind: "checkin" };

let pending: Quick | null = null;
export const QUICK_EVENT = "tp-quick";

/** Dépose une action ; l'écran déjà ouvert est prévenu tout de suite. */
export function setQuick(q: Quick) {
  pending = q;
  window.dispatchEvent(new CustomEvent(QUICK_EVENT));
}

/** Prend l'action en attente si elle est de l'un des types voulus. */
export function takeQuick<K extends Quick["kind"]>(...kinds: K[]): Extract<Quick, { kind: K }> | null {
  if (!pending || !kinds.includes(pending.kind as K)) return null;
  const q = pending as Extract<Quick, { kind: K }>;
  pending = null;
  return q;
}
