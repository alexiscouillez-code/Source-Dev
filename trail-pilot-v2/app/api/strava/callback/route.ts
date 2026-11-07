import { waitUntil } from "@vercel/functions";
import { getUser } from "@/lib/auth";
import { ensureWebhook, linkAccount, readState, syncUser } from "@/lib/strava";
import { reconcile, regeneratePlan, resolveToday } from "@/lib/service";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (s: string) => Response.redirect(new URL(`/espace?strava=${s}`, req.url), 303);
  const user = await getUser();
  if (!user) return Response.redirect(new URL("/connexion?return_to=/espace", req.url), 303);
  if (url.searchParams.get("error")) return back("refuse");
  const code = url.searchParams.get("code"), scope = url.searchParams.get("scope") ?? "";
  if (!code || readState(url.searchParams.get("state") ?? "") !== user.id) return back("erreur");
  if (!scope.includes("activity:read")) return back("droits");
  try {
    await linkAccount(user.id, code, scope);
    const today = resolveToday(null);
    await syncUser(user.id);
    await reconcile(user.id, today);
    await regeneratePlan(user.id, today);
    waitUntil(ensureWebhook(url.origin).catch((e) => console.error("webhook Strava", e)));
    return back("connecte");
  } catch (e) {
    console.error("callback Strava", e);
    return back("erreur");
  }
}
