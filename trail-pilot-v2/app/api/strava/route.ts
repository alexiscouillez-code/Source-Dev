import { json, withUser } from "@/lib/api";
import { stravaStatus, unlink } from "@/lib/strava";

export const GET = withUser(async (user) => json(await stravaStatus(user.id)));
/** Déconnecte Strava : révoque l’accès chez Strava et supprime les jetons. Les séances importées restent. */
export const DELETE = withUser(async (user) => { await unlink(user.id); return json({ ok: true }); });
