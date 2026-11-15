import { json, withUser } from "@/lib/api";
import { reviewActivity } from "@/lib/run-review";

export const maxDuration = 40;

/** Bilan IA d'une sortie importée par fichier ou saisie à la main (refusé pour une sortie Strava). */
export const POST = withUser(async (user, _req, ctx) => {
  const review = await reviewActivity(user.id, Number((await ctx.params).id));
  return json({ review });
});
