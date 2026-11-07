import { json, withUser } from "@/lib/api";
import { calendarUrl, revokeCalendar, rotateCalendar } from "@/lib/calendar";

/** Lien d’abonnement agenda : lecture, création (ou renouvellement) et révocation. */
export const GET = withUser(async (user) => json({ url: await calendarUrl(user.id) }));
export const POST = withUser(async (user) => json({ url: await rotateCalendar(user.id) }));
export const DELETE = withUser(async (user) => { await revokeCalendar(user.id); return json({ ok: true }); });
