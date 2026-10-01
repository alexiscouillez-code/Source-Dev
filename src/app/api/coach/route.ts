import { NextResponse } from "next/server";
import type { ResultStatus } from "@/game/models/types";

const UNAVAILABLE = "Coach IA indisponible : aucune clé API configurée.";

const SYSTEM = [
  "Tu es un coach de trail. Tu expliques un résultat déjà calculé par un moteur déterministe.",
  "Tu ne modifies aucune stat, tu ne décides pas du vainqueur, tu ne calcules pas l’XP, tu ne changes pas les probabilités.",
  "Tu n’inventes aucun chiffre absent du JSON.",
  "Réponds en français, en trois paragraphes courts : ce qui s’est passé, où le temps et l’énergie ont été perdus, quoi tenter à la prochaine course.",
].join(" ");

export async function GET() {
  const available = hasCoachKey();
  return NextResponse.json({
    available,
    message: available ? "Le coach peut expliquer le résultat. Il ne le calcule pas." : UNAVAILABLE,
  });
}

export async function POST(request: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({ available: false, message: UNAVAILABLE }, { status: 503 });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "Résultat illisible." }, { status: 400 });
  }
  if (!isCoachPayload(payload)) {
    return NextResponse.json({ message: "Résultat incomplet." }, { status: 400 });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: JSON.stringify(slim(payload)) },
        ],
      }),
    });
    if (!response.ok) {
      return NextResponse.json({ available: true, message: "Le coach n’a pas répondu." }, { status: 502 });
    }
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text?.trim()) {
      return NextResponse.json({ available: true, message: "Réponse vide du coach." }, { status: 502 });
    }
    return NextResponse.json({ available: true, message: text.trim() });
  } catch {
    return NextResponse.json({ available: true, message: "Le coach n’a pas répondu." }, { status: 502 });
  }
}

function hasCoachKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function isCoachPayload(value: unknown): value is CoachPayload {
  if (!value || typeof value !== "object") return false;
  const result = value as CoachPayload;
  return (
    typeof result.raceName === "string" &&
    (result.status === "FINISH" || result.status === "DNF" || result.status === "ABANDON") &&
    typeof result.distanceKm === "number" &&
    Array.isArray(result.segmentLog) &&
    Array.isArray(result.actionLog) &&
    Array.isArray(result.eventLog)
  );
}

interface CoachPayload {
  raceName: string;
  status: ResultStatus;
  distanceKm: number;
  totalDistanceKm: number;
  elapsedMinutes: number;
  elevationGain: number;
  energy: number;
  hydration: number;
  fatigue: number;
  mental: number;
  xpGained: number;
  dnfReason: string | null;
  equipmentIds: string[];
  segmentLog: unknown[];
  actionLog: unknown[];
  eventLog: unknown[];
}

function slim(result: CoachPayload) {
  return {
    race: result.raceName,
    finalResult: result.status,
    dnfReason: result.dnfReason,
    distanceKm: result.distanceKm,
    totalDistanceKm: result.totalDistanceKm,
    elapsedMinutes: result.elapsedMinutes,
    elevationGain: result.elevationGain,
    energy: result.energy,
    hydration: result.hydration,
    fatigue: result.fatigue,
    mental: result.mental,
    xpGained: result.xpGained,
    equipment: result.equipmentIds,
    segments: result.segmentLog,
    actions: result.actionLog,
    events: result.eventLog,
  };
}
