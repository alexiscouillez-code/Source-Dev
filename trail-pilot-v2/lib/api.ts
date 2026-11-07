import "server-only";
import { getUser, type User } from "./auth";
import { logError } from "./errors";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });

/** Enveloppe commune des routes : session obligatoire, erreurs lisibles, aucune fuite de pile. */
export function withUser(handler: (user: User, request: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>) {
  return async (request: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const user = await getUser();
    if (!user) return json({ error: "Connecte-toi pour continuer." }, 401);
    try {
      return await handler(user, request, ctx);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      await logError("api", err, { url: new URL(request.url).pathname, userId: user.id });
      return json({ error: "Une erreur est survenue. Réessaie dans un instant." }, 500);
    }
  };
}

export async function body<T = Record<string, unknown>>(request: Request): Promise<T> {
  try { return (await request.json()) as T; } catch { throw new HttpError(400, "Requête invalide."); }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isoDate(v: unknown, field = "Date"): string {
  if (typeof v !== "string" || !DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T12:00:00Z`))) throw new HttpError(400, `${field} invalide.`);
  return v;
}
export function num(v: unknown, min: number, max: number, field: string, optional = false): number | null {
  if ((v === null || v === undefined || v === "") && optional) return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${field} : valeur attendue entre ${min} et ${max}.`);
  return n;
}
export const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "") || null;
