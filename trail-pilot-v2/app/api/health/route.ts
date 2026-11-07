import { json, withUser } from "@/lib/api";
import { run } from "@/db/client";

/** Retrait de l’accord santé : efface les zones douloureuses, la FC au réveil et la VFC enregistrées. */
export const DELETE = withUser(async (user) => {
  await run("UPDATE checkins SET pain_zones = NULL, rhr = NULL, hrv = NULL WHERE user_id = ?", [user.id]);
  await run("UPDATE profiles SET health_consent_at = NULL WHERE user_id = ?", [user.id]);
  return json({ ok: true });
});
