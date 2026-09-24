import { formatInt, formatKm } from "./format.ts";

export type CommentInput = {
  finished: boolean;
  finishTown: string;
  segmentsCleared: number;
  gate: string | null;
  kmApplied: number;
  elevationApplied: number;
  segmentKm: number;
  segmentElevation: number;
  kmFull: boolean;
  elevationFull: boolean;
  kmRemaining: number;
  elevationRemaining: number;
};

/** One remark about the outing that was just logged. No plan, no second paragraph. */
export function coachComment(input: CommentInput): string {
  if (input.finished) {
    return `Arrivée à ${input.finishTown}. Distance et dénivelé du parcours sont couverts.`;
  }

  if (input.segmentsCleared > 0) {
    const gate = input.gate ?? "le point suivant";
    if (input.segmentsCleared === 1) {
      return `Tronçon couvert. L'avatar avance jusqu'à ${gate}.`;
    }
    return `${input.segmentsCleared} tronçons couverts. L'avatar avance jusqu'à ${gate}.`;
  }

  if (input.kmFull) {
    return `Les kilomètres du tronçon sont pleins. Encore ${formatInt(input.elevationRemaining)} m de D+ avant d'avancer.`;
  }

  if (input.elevationFull) {
    return `Le D+ du tronçon est plein. Encore ${formatKm(input.kmRemaining)} km avant d'avancer.`;
  }

  if (input.kmApplied <= 0 && input.elevationApplied <= 0) {
    return "Cette sortie ne couvre rien de plus sur le tronçon.";
  }

  const kmShare =
    input.segmentKm > 0 ? input.kmApplied / input.segmentKm : 0;
  const elevShare =
    input.segmentElevation > 0
      ? input.elevationApplied / input.segmentElevation
      : 0;

  if (kmShare > elevShare * 1.4) {
    return "Sortie plate : les kilomètres avancent, le dénivelé très peu.";
  }
  if (elevShare > kmShare * 1.4) {
    return "Sortie raide : le dénivelé avance, les kilomètres très peu.";
  }
  return "Distance et dénivelé remplissent le tronçon ensemble.";
}
