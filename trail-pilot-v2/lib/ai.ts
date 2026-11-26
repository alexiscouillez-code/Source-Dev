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

/**
 * Lecture d'une photo (étiquette d'un produit, assiette) : renvoie l'objet JSON produit par le modèle, ou null.
 * Fournisseur : VISION_BASE_URL (compatible OpenAI, sert aux tests), sinon Groq, sinon Anthropic.
 * L'image n'est conservée nulle part : elle part dans la requête et c'est tout.
 */
export const visionConfigured = () => !!(process.env.VISION_BASE_URL || process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY);

export async function aiVisionJson(system: string, prompt: string, image: string, o: { maxTokens?: number; timeoutMs?: number } = {}): Promise<Record<string, unknown> | null> {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!m) return null;
  const custom = process.env.VISION_BASE_URL, groq = process.env.GROQ_API_KEY, claude = process.env.ANTHROPIC_API_KEY;
  try {
    let raw: string;
    if (custom || groq) {
      const base = custom || "https://api.groq.com/openai/v1";
      const send = (jsonMode: boolean) => fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${custom ? process.env.VISION_API_KEY ?? "" : groq}` },
        body: JSON.stringify({
          model: process.env.VISION_MODEL || "qwen/qwen3.8-27b", max_completion_tokens: o.maxTokens ?? 600, temperature: 0.1,
          ...(custom ? {} : { reasoning_effort: "none" }), ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
          messages: [{ role: "system", content: system }, { role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image } }] }],
        }),
        signal: AbortSignal.timeout(o.timeoutMs ?? 25000),
      });
      let res = await send(true);
      if (res.status === 400) res = await send(false);
      if (!res.ok) throw new Error(`Réponse ${res.status}`);
      raw = ((await res.json()) as { choices?: { message?: { content?: string | null } }[] }).choices?.[0]?.message?.content ?? "";
    } else if (claude) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": claude, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: process.env.VISION_MODEL || process.env.COACH_MODEL || "claude-sonnet-5-5", max_tokens: o.maxTokens ?? 600, system,
          messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } }, { type: "text", text: prompt }] }] }),
        signal: AbortSignal.timeout(o.timeoutMs ?? 25000),
      });
      if (!res.ok) throw new Error(`Réponse ${res.status}`);
      raw = (((await res.json()) as { content?: { type: string; text?: string }[] }).content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("");
    } else return null;
    await recordOk("ia");
    const txt = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
    const a = txt.indexOf("{"), b = txt.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    const parsed = JSON.parse(txt.slice(a, b + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    await recordFail("ia", e);
    console.error("IA photo", e instanceof Error ? e.message : e);
    return null;
  }
}
