import { HttpError, json, withUser } from "@/lib/api";
import { resolveToday } from "@/lib/service";
import { defaultMonth, monthRecap } from "@/lib/recap";

/** Bilan du mois (?month=AAAA-MM ; par défaut le mois en cours, ou le précédent les 5 premiers jours). */
export const GET = withUser(async (user, req) => {
  const q = new URL(req.url).searchParams, today = resolveToday(q.get("today"));
  const m = q.get("month") ?? defaultMonth(today);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m) || m > today.slice(0, 7) || m < "2000-01") throw new HttpError(400, "Mois invalide.");
  return json(await monthRecap(user.id, today, m));
});
