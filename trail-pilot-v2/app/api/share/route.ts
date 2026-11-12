import { json, withUser } from "@/lib/api";
import { revokeShare, rotateShare, shareUrl } from "@/lib/share";

/** Lien de partage du planning en lecture seule : lecture, création (ou renouvellement) et révocation. */
export const GET = withUser(async (user) => json({ url: await shareUrl(user.id) }));
export const POST = withUser(async (user) => json({ url: await rotateShare(user.id) }));
export const DELETE = withUser(async (user) => { await revokeShare(user.id); return json({ ok: true }); });
