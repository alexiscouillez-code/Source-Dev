import { json, withUser } from "@/lib/api";
import { StravaError, syncUser } from "@/lib/strava";
import { reconcile, resolveToday } from "@/lib/service";

export const POST = withUser(async (user) => {
  try {
    const r = await syncUser(user.id);
    await reconcile(user.id, resolveToday(null));
    return json(r);
  } catch (e) {
    if (e instanceof StravaError) return json({ error: e.message }, e.status === 404 ? 404 : 502);
    throw e;
  }
});
