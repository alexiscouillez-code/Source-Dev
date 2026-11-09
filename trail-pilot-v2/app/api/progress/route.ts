import { json, withUser } from "@/lib/api";
import { resolveToday } from "@/lib/service";
import { progress } from "@/lib/progress";

/** Volume mensuel, records et chronos sur tes boucles habituelles. */
export const GET = withUser(async (user, req) => json(await progress(user.id, resolveToday(new URL(req.url).searchParams.get("today")))));
