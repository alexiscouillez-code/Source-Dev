import { body, HttpError, json, text, withUser } from "@/lib/api";
import { run } from "@/db/client";
import { ask, coachConfigured, history } from "@/lib/coach";
import { resolveToday } from "@/lib/service";

export const maxDuration = 60;

export const GET = withUser(async (user) => json({ enabled: coachConfigured(), messages: await history(user.id) }));

export const POST = withUser(async (user, req) => {
  const b = await body(req);
  const message = text(b.message, 1000);
  if (!message) throw new HttpError(400, "Écris ta question.");
  const reply = await ask(user.id, resolveToday(typeof b.today === "string" ? b.today : null), message);
  return json({ reply });
});

/** Efface la conversation. */
export const DELETE = withUser(async (user) => {
  await run("DELETE FROM coach_messages WHERE user_id = ?", [user.id]);
  return json({ ok: true });
});
