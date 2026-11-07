import { json, withUser } from "@/lib/api";
import { run } from "@/db/client";

/** Fin (ou abandon) de l’accueil guidé : il ne s’affiche plus. */
export const POST = withUser(async (user) => {
  await run("UPDATE profiles SET onboarded_at = COALESCE(onboarded_at, ?) WHERE user_id = ?", [Date.now(), user.id]);
  return json({ ok: true });
});
