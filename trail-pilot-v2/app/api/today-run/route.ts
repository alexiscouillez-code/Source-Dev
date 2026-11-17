import { json, withUser } from "@/lib/api";
import { resolveToday } from "@/lib/service";
import { todayRun } from "@/lib/today-run";

/** Données du bloc « Ma sortie du jour » (null pour chaque partie sans donnée réelle). */
export const GET = withUser(async (user, req) => json(await todayRun(user.id, resolveToday(new URL(req.url).searchParams.get("today")))));
