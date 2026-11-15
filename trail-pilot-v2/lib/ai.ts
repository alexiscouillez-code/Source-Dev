import "server-only";
import { recordFail, recordOk } from "./status";

/**
 * Appel court à l’IA du site (Groq, sinon Anthropic), avec le même réglage que la lecture des commentaires.
 * Renvoie le texte de la réponse, ou null en cas d’échec (l’échec est noté dans l’état des connexions).
 */
export const aiProvider = () => (process.env.GROQ_API_KEY ? "groq" : process.env.ANTHROPIC_API_KEY ? "anthropic" : null);
export const aiConfigured = () => aiProvider() !== null;

export async function aiText(system: string, user: string, o: { maxTokens?: number; timeoutMs?: number; temperature?: number } = {}): Promise<string | null> {
  const p = aiProvider();
  if (!p) return null;
  try {
    const res = p === "groq"
      ? await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: process.env.COACH_MODEL || "openai/gpt-oss-120b", max_completion_tokens: o.maxTokens ?? 900, temperature: o.temperature ?? 0.3, reasoning_effort: "low", include_reasoning: false, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
        signal: AbortSignal.timeout(o.timeoutMs ?? 20000),
      })
      : await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: process.env.COACH_MODEL || "claude-sonnet-5-5", max_tokens: o.maxTokens ?? 900, system, messages: [{ role: "user", content: user }] }),
        signal: AbortSignal.timeout(o.timeoutMs ?? 20000),
      });
    if (!res.ok) { await recordFail("ia", `Réponse ${res.status}`); console.error("IA", res.status); return null; }
    const text = p === "groq"
      ? ((await res.json()) as { choices?: { message?: { content?: string | null } }[] }).choices?.[0]?.message?.content ?? ""
      : (((await res.json()) as { content?: { type: string; text?: string }[] }).content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("");
    await recordOk("ia");
    return text;
  } catch (e) {
    await recordFail("ia", e);
    console.error("IA", e instanceof Error ? e.message : e);
    return null;
  }
}
