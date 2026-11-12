import type { Verdict } from "./decision";

/**
 * Ce que dit un commentaire libre (check-in ou jour du calendrier), ramené à quelques signaux.
 * L’IA ne fait que lire le texte et remplir ces signaux ; ce sont des règles fixes, ci-dessous, qui décident
 * de l’effet sur le planning. Un commentaire ne peut qu’alléger une séance, jamais la durcir.
 */
export interface NoteSignals {
  fatigue: 0 | 1 | 2;
  douleur: 0 | 1 | 2;
  malade: boolean;
  /** Temps disponible ce jour-là */
  temps: "normal" | "court" | "aucun";
  /** Ce qui a été compris, en une phrase courte */
  resume: string;
  source: "ia" | "mots-cles";
}

const lvl = (v: unknown): 0 | 1 | 2 => (v === 2 || v === "2" ? 2 : v === 1 || v === "1" ? 1 : 0);

/** Valide ce que renvoie l’IA : tout champ inattendu est ignoré, toute valeur hors bornes ramenée à « rien à signaler ». */
export function cleanSignals(o: unknown, source: NoteSignals["source"]): NoteSignals | null {
  if (!o || typeof o !== "object") return null;
  const x = o as Record<string, unknown>;
  const temps = x.temps === "court" || x.temps === "aucun" ? x.temps : "normal";
  const resume = typeof x.resume === "string" ? x.resume.replace(/\s+/g, " ").trim().slice(0, 160) : "";
  return { fatigue: lvl(x.fatigue), douleur: lvl(x.douleur), malade: x.malade === true, temps, resume, source };
}

const plain = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, " ");

/** Lecture par mots-clés, quand l’IA n’est pas disponible. Volontairement prudente : dans le doute, rien à signaler. */
export function keywordSignals(text: string): NoteSignals {
  // Les négations (« pas de douleur », « plus mal ») sont retirées avant la recherche.
  const t = plain(text).replace(/\b(pas|plus|aucune?|sans|zero)\s+(de\s+|d\s+)?(douleurs?|mal|gene|fatigue|courbatures?|fievre)\b/g, " ");
  const has = (re: RegExp) => re.test(t);
  const malade = has(/\b(fievre|grippe|malade|angine|gastro|covid|rhume|bronchite|nausee|vomi)/);
  const douleur: 0 | 1 | 2 = has(/\b(blessure|blesse|dechirure|entorse|claquage|boite|grosse douleur|tres mal|vraiment mal|douleur vive|douleur forte)/) ? 2
    : has(/\b(douleur|mal a|mal au|mal aux|gene|raide|tendinite|tiraille|pique|sensible)/) ? 1 : 0;
  const fatigue: 0 | 1 | 2 = has(/\b(epuise|creve|claque|lessive|extenue|au bout du rouleau|nuit blanche|tres fatigue|hs|rince)/) ? 2
    : has(/\b(fatigue|mal dormi|nuit courte|nuit hachee|peu dormi|stress|grosse journee|courbatur|jambes lourdes|lourd)/) ? 1 : 0;
  const temps: NoteSignals["temps"] = has(/\b(pas le temps|aucun creneau|pas de creneau|impossible aujourd|pas dispo|pas disponible)/) ? "aucun"
    : has(/\b(peu de temps|creneau court|presse|\d{2} ?min max|pas beaucoup de temps|journee chargee)/) ? "court" : "normal";
  const parts = [malade && "malade", douleur === 2 ? "douleur marquée" : douleur === 1 ? "gêne ou douleur légère" : "", fatigue === 2 ? "grosse fatigue" : fatigue === 1 ? "un peu de fatigue" : "", temps === "aucun" ? "pas de créneau" : temps === "court" ? "peu de temps" : ""].filter(Boolean);
  return { fatigue, douleur, malade, temps, resume: parts.length ? `Repéré : ${parts.join(", ")}.` : "Rien qui demande d’adapter la séance.", source: "mots-cles" };
}

/** Effet d’un commentaire sur une séance, hors check-in : au pire du repos, au mieux rien. */
export function noteCap(s: NoteSignals | null | undefined, sameDay: boolean): Verdict {
  if (!s) return "ok";
  if (s.malade || s.douleur === 2 || (sameDay && s.temps === "aucun")) return "rest";
  if (s.fatigue === 2 || s.douleur === 1 || (sameDay && s.temps === "court")) return "lite";
  return "ok";
}

export const quiet = (s: NoteSignals | null | undefined) => !s || (!s.malade && !s.douleur && !s.fatigue && s.temps === "normal");
