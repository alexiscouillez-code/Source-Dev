/**
 * Programmes de renforcement guidés, selon la phase du plan (mêmes contenus que la description des séances) :
 *  - général (Fondation, Entretien) : gainage et force de base ;
 *  - dynamique (Développement) : élasticité, pieds réactifs ;
 *  - descente (Spécifique) : travail excentrique, ce qui protège les cuisses en fin de course.
 * Chaque exercice a une dose (durée ou répétitions), deux consignes, l’erreur à éviter, et une version
 * plus facile et plus dure. Les durées servent au minuteur du mode guidé.
 */
export interface Exercise {
  id: string; name: string;
  /** Durée en secondes, ou nombre de répétitions (par côté si `sides`) */
  seconds?: number; reps?: number; sides?: boolean;
  cues: [string, string]; avoid: string; easier: string; harder: string;
}
export interface StrengthProgram { key: "general" | "dynamique" | "descente"; title: string; why: string; rounds: number; rest: number; roundRest: number; exercises: Exercise[] }

const GENERAL: Exercise[] = [
  { id: "planche", name: "Gainage face", seconds: 40, cues: ["Appuis sur les avant-bras, coudes sous les épaules.", "Corps aligné de la tête aux talons, nombril rentré."], avoid: "Le bassin qui s’affaisse ou les fesses en l’air.", easier: "Genoux au sol.", harder: "Lever un pied 2 s, en alternant." },
  { id: "lateral", name: "Gainage latéral", seconds: 30, sides: true, cues: ["Coude sous l’épaule, pieds empilés.", "Hanches hautes, corps en ligne droite."], avoid: "Les hanches qui tombent vers le sol.", easier: "Genou du bas au sol.", harder: "Lever la jambe du dessus." },
  { id: "pont", name: "Pont fessier", seconds: 40, cues: ["Sur le dos, pieds à plat, genoux pliés.", "Monte le bassin en serrant les fessiers, sans creuser le dos."], avoid: "Pousser avec le bas du dos au lieu des fessiers.", easier: "Tenir en haut 2 s, puis redescendre.", harder: "Sur une jambe." },
  { id: "squat", name: "Squat", seconds: 40, cues: ["Pieds largeur de hanches, poids sur les talons.", "Descends comme pour t’asseoir, genoux dans l’axe des pieds."], avoid: "Les genoux qui rentrent vers l’intérieur.", easier: "S’asseoir sur une chaise et se relever.", harder: "Tenir une charge (sac à dos rempli)." },
  { id: "fente", name: "Fentes avant", seconds: 40, cues: ["Grand pas en avant, buste droit.", "Le genou arrière descend vers le sol, celui de devant reste au-dessus du pied."], avoid: "Le genou avant qui dépasse largement les orteils.", easier: "Fentes sur place, sans pas.", harder: "Fentes marchées avec un sac lesté." },
  { id: "mollets", name: "Montées de mollets", seconds: 40, cues: ["Sur une marche, talons dans le vide.", "Monte haut sur la pointe, redescends lentement."], avoid: "Rebondir en bas du mouvement.", easier: "Au sol, deux pieds.", harder: "Sur une jambe." },
  { id: "equilibre", name: "Équilibre sur une jambe", seconds: 30, sides: true, cues: ["Debout sur un pied, genou légèrement fléchi.", "Regard fixe, bassin horizontal."], avoid: "Bloquer le genou en extension.", easier: "Toucher un mur du bout des doigts.", harder: "Yeux fermés, ou sur un coussin." },
];
const DYNAMIQUE: Exercise[] = [
  { id: "squat-saute", name: "Squats sautés", seconds: 30, cues: ["Demi-squat, puis saut vertical en poussant fort.", "Réception souple sur l’avant du pied, genoux fléchis."], avoid: "Atterrir jambes tendues ou bruyamment.", easier: "Squat rapide, montée sur la pointe sans sauter.", harder: "Saut plus haut, réception tenue 1 s." },
  { id: "fentes-alt", name: "Fentes alternées", seconds: 30, cues: ["Fente, puis retour et changement de jambe.", "Rythme régulier, buste droit."], avoid: "Le genou avant qui part vers l’intérieur.", easier: "Fentes arrière, plus stables.", harder: "Fentes sautées." },
  { id: "marche", name: "Montées de genou sur marche", seconds: 30, sides: true, cues: ["Pose un pied sur une marche ou un banc, monte en poussant sur ce pied.", "Monte le genou opposé à hauteur de hanche."], avoid: "Pousser avec le pied resté au sol.", easier: "Marche plus basse, sans montée de genou.", harder: "Marche plus haute, mouvement rapide." },
  { id: "corde", name: "Sauts légers", seconds: 30, cues: ["Petits sauts sur l’avant du pied, chevilles toniques.", "Contact au sol le plus court possible."], avoid: "Talons qui touchent le sol.", easier: "Montées de pointes rapides sans sauter.", harder: "Sur un pied, en alternant." },
  { id: "bond", name: "Bondissements", seconds: 30, cues: ["Foulées bondissantes sur 15 à 20 m, ou sur place.", "Bras actifs, genou haut à chaque impulsion."], avoid: "Allonger la foulée en se penchant en arrière.", easier: "Skipping (montées de genoux rapides).", harder: "Bondissements en légère montée." },
  { id: "lateral", name: "Gainage latéral", seconds: 30, sides: true, cues: ["Coude sous l’épaule, pieds empilés.", "Hanches hautes, corps en ligne droite."], avoid: "Les hanches qui tombent vers le sol.", easier: "Genou du bas au sol.", harder: "Lever la jambe du dessus." },
];
const DESCENTE: Exercise[] = [
  { id: "squat-lent", name: "Squats lents", reps: 10, cues: ["Descends en comptant 4 secondes, remonte en 1 seconde.", "Poids sur les talons, genoux dans l’axe."], avoid: "Se laisser tomber en bas du mouvement.", easier: "Descendre seulement à mi-hauteur.", harder: "Pause de 2 s en bas, ou sac lesté." },
  { id: "fente-arriere", name: "Fentes arrière", reps: 10, sides: true, cues: ["Grand pas en arrière, descente contrôlée.", "Le poids reste sur la jambe avant."], avoid: "Pousser surtout avec la jambe arrière.", easier: "Amplitude réduite.", harder: "Descente en 3 secondes, sac lesté." },
  { id: "descente-marche", name: "Descentes de marche sur une jambe", reps: 8, sides: true, cues: ["Debout sur une marche, l’autre pied dans le vide.", "Descends lentement jusqu’à effleurer le sol du talon, puis remonte."], avoid: "Le genou qui rentre vers l’intérieur.", easier: "Marche plus basse.", harder: "Marche plus haute, descente en 4 s." },
  { id: "chaise", name: "Chaise contre un mur", seconds: 40, cues: ["Dos au mur, cuisses parallèles au sol.", "Genoux au-dessus des chevilles, respire normalement."], avoid: "Bloquer la respiration.", easier: "Cuisses moins fléchies.", harder: "Sur une jambe quelques secondes, en alternant." },
  { id: "mollets-exc", name: "Mollets excentriques", reps: 10, sides: true, cues: ["Monte sur la pointe avec les deux pieds sur une marche.", "Redescends sur un seul pied en 3 secondes."], avoid: "Redescendre d’un coup.", easier: "Deux pieds en montée et en descente.", harder: "Sac lesté." },
  { id: "planche", name: "Gainage face", seconds: 40, cues: ["Appuis sur les avant-bras, coudes sous les épaules.", "Corps aligné de la tête aux talons, nombril rentré."], avoid: "Le bassin qui s’affaisse ou les fesses en l’air.", easier: "Genoux au sol.", harder: "Lever un pied 2 s, en alternant." },
];

export function strengthProgram(phase: string, minutes: number): StrengthProgram {
  const rounds = minutes >= 40 ? 3 : 2;
  if (phase === "Développement") return { key: "dynamique", title: "Renforcement dynamique", why: "Des appuis plus réactifs et élastiques : tu dépenses moins d’énergie à chaque foulée, surtout en relance.", rounds, rest: 30, roundRest: 90, exercises: DYNAMIQUE };
  if (phase === "Spécifique") return { key: "descente", title: "Renforcement pour la descente", why: "Le travail excentrique (freiner en contrôlant) prépare les cuisses aux descentes : c’est ce qui évite les jambes détruites en fin de course.", rounds, rest: 40, roundRest: 90, exercises: DESCENTE };
  return { key: "general", title: "Renforcement général", why: "Gainage et force de base : une posture qui tient quand la fatigue arrive, et moins de risque de blessure.", rounds, rest: 20, roundRest: 60, exercises: GENERAL };
}

export const dose = (e: Exercise) => (e.seconds ? `${e.seconds} s` : `${e.reps} répétitions`) + (e.sides ? " par côté" : "");
