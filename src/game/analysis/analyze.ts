import { formatDuration, formatKm, signed } from "@/game/format";
import type { ActionLog, RaceResult, SegmentLog } from "@/game/models/types";

export interface Analysis {
  bestSegment: string;
  criticalSegment: string;
  bestDecision: string;
  worstDecision: string;
  summary: string;
}

export function analyzeRun(result: RaceResult): Analysis {
  return {
    bestSegment: describeSegment(bestSegment(result.segmentLog), "Meilleur segment"),
    criticalSegment: describeSegment(worstSegment(result.segmentLog), "Segment critique"),
    bestDecision: describeDecision(bestAction(result.actionLog), "Meilleure décision"),
    worstDecision: describeDecision(worstAction(result.actionLog), "Plus grosse erreur"),
    summary: summarize(result),
  };
}

function summarize(result: RaceResult): string {
  const distance = `${formatKm(result.distanceKm)} km`;
  const time = formatDuration(result.elapsedMinutes);
  if (result.status === "FINISH") {
    return `Arrivée en ${time} sur ${distance}, D+ ${Math.round(result.elevationGain).toLocaleString("fr-FR")} m. Énergie ${result.energy}, hydratation ${result.hydration}, fatigue ${result.fatigue}, mental ${result.mental}.`;
  }
  if (result.status === "ABANDON") {
    return `Abandon à ${distance} (${time}). ${result.dnfReason ?? "Abandon volontaire"}.`;
  }
  return `DNF à ${distance} (${time}). Cause : ${result.dnfReason ?? "inconnue"}.`;
}

function segmentScore(log: SegmentLog): number {
  const distance = Math.max(0.1, log.distanceKm);
  const energyLoss = log.energyBefore - log.energyAfter;
  const fatigueGain = log.fatigueAfter - log.fatigueBefore;
  const mental = log.mentalAfter - log.mentalBefore;
  return -(energyLoss / distance) * 2 - fatigueGain / distance + mental;
}

function bestSegment(logs: SegmentLog[]): SegmentLog | null {
  return logs.reduce<SegmentLog | null>((best, log) => {
    if (!best || segmentScore(log) > segmentScore(best)) return log;
    return best;
  }, null);
}

function worstSegment(logs: SegmentLog[]): SegmentLog | null {
  return logs.reduce<SegmentLog | null>((worst, log) => {
    if (!worst || segmentScore(log) < segmentScore(worst)) return log;
    return worst;
  }, null);
}

function decisionScore(action: ActionLog): number {
  const delta = action.delta;
  return (
    delta.energy * 1.5 +
    delta.hydration +
    delta.mental * 1.2 -
    delta.fatigue * 1.2 -
    delta.minutes * 0.05
  );
}

function bestAction(logs: ActionLog[]): ActionLog | null {
  return logs.reduce<ActionLog | null>((best, log) => {
    if (!best || decisionScore(log) > decisionScore(best)) return log;
    return best;
  }, null);
}

function worstAction(logs: ActionLog[]): ActionLog | null {
  return logs.reduce<ActionLog | null>((worst, log) => {
    if (!worst || decisionScore(log) < decisionScore(worst)) return log;
    return worst;
  }, null);
}

function describeSegment(log: SegmentLog | null, title: string): string {
  if (!log) return `${title} : pas encore de segment.`;
  const energy = log.energyBefore - log.energyAfter;
  const fatigue = log.fatigueAfter - log.fatigueBefore;
  return `${title} : ${log.segmentName}. Énergie ${signed(-energy)}, fatigue ${signed(fatigue)}, ${formatDuration(log.minutes)}.`;
}

function describeDecision(action: ActionLog | null, title: string): string {
  if (!action) return `${title} : aucune décision.`;
  const delta = action.delta;
  return `${title} : ${action.label}. Énergie ${signed(delta.energy)}, hydratation ${signed(delta.hydration)}, fatigue ${signed(delta.fatigue)}, mental ${signed(delta.mental)}, temps ${signed(delta.minutes)} min.`;
}
