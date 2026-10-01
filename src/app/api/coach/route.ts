import { NextResponse } from "next/server";
import type { ResultStatus, SegmentLog } from "@/game/models/types";

const UNAVAILABLE = "Coach IA indisponible : aucune clé API configurée.";
const MODELS = ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.8-flash"] as const;

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
  const key = process.env.GEMINI_API_KEY;
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
    const text = await explainWithGemini(key, JSON.stringify(slim(payload)));
    if (!text) {
      return NextResponse.json({ available: true, message: "Le coach n’a pas répondu." }, { status: 502 });
    }
    return NextResponse.json({ available: true, message: text });
  } catch {
    return NextResponse.json({ available: true, message: "Le coach n’a pas répondu." }, { status: 502 });
  }
}

async function explainWithGemini(key: string, userText: string): Promise<string | null> {
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents: [{ role: "user", parts: [{ text: userText }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1500,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        },
      );
      if (response.ok) {
        const data = (await response.json()) as GeminiResponse;
        const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
        if (text) return text;
      } else {
        console.error("Coach Gemini status", model, response.status);
      }
      if (response.status !== 429 && response.status !== 503) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return null;
}

function hasCoachKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
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
  segmentLog: SegmentLog[];
  actionLog: unknown[];
  eventLog: unknown[];
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

function isSegment(value: SegmentLog): value is SegmentLog {
  return Boolean(value) && typeof value.segmentName === "string";
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
    statHistory: result.segmentLog.filter(isSegment).map((segment) => ({
      segment: segment.segmentName,
      energy: [segment.energyBefore, segment.energyAfter],
      hydration: [segment.hydrationBefore, segment.hydrationAfter],
      fatigue: [segment.fatigueBefore, segment.fatigueAfter],
      mental: [segment.mentalBefore, segment.mentalAfter],
    })),
  };
}
