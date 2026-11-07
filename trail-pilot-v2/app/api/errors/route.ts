import { getUser } from "@/lib/auth";
import { logError } from "@/lib/errors";

// Limite simple par instance : 30 rapports par minute au plus.
let windowStart = 0, count = 0;

/** Erreurs remontées par le navigateur (voir components/ErrorReporter.tsx). */
export async function POST(request: Request) {
  const now = Date.now();
  if (now - windowStart > 60000) { windowStart = now; count = 0; }
  if (++count > 30) return new Response(null, { status: 429 });
  const text = (await request.text().catch(() => "")).slice(0, 8000);
  let b: { message?: unknown; stack?: unknown; url?: unknown } = {};
  try { b = JSON.parse(text); } catch { return new Response(null, { status: 400 }); }
  const message = String(b.message ?? "").slice(0, 500);
  if (!message) return new Response(null, { status: 400 });
  const err = new Error(message);
  err.stack = String(b.stack ?? "").slice(0, 4000);
  const user = await getUser().catch(() => null);
  await logError("client", err, { url: String(b.url ?? "").slice(0, 300), userId: user?.id ?? null });
  return new Response(null, { status: 204 });
}
