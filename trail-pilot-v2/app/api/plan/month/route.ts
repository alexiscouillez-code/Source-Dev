import { HttpError, json, withUser } from "@/lib/api";
import { addDays, diffDays, mondayOf } from "@/lib/engine/dates";
import { calendarView, resolveToday } from "@/lib/service";

/** Calendrier d’un mois (?month=AAAA-MM), élargi aux semaines entières : du lundi qui précède le 1er au dimanche qui suit la fin. */
export const GET = withUser(async (user, req) => {
  const q = new URL(req.url).searchParams;
  const today = resolveToday(q.get("today"));
  const month = q.get("month") ?? today.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, "Mois invalide.");
  if (Math.abs(diffDays(today, `${month}-15`)) > 800) throw new HttpError(400, "Mois hors limites.");
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const last = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  const from = mondayOf(first), to = addDays(mondayOf(last), 6);
  return json({ month, ...(await calendarView(user.id, today, from, to)) });
});
