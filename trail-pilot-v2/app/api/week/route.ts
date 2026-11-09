import { json, withUser } from "@/lib/api";
import { resolveToday } from "@/lib/service";
import { weekSummary } from "@/lib/week";

/** Bilan de la semaine écoulée (ou de la semaine en cours le dimanche). */
export const GET = withUser(async (user, req) => {
  const today = resolveToday(new URL(req.url).searchParams.get("today"));
  return json(await weekSummary(user.id, today));
});
