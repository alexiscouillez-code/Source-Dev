import { json, withUser } from "@/lib/api";
import { analysis, resolveToday } from "@/lib/service";

export const GET = withUser(async (user, req) => json(await analysis(user.id, resolveToday(new URL(req.url).searchParams.get("today")))));
