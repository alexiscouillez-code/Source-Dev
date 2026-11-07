import { getUser } from "@/lib/auth";
import { createState, STRAVA_SCOPE, stravaConfig } from "@/lib/strava";

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return Response.redirect(new URL("/connexion?return_to=/espace", req.url), 303);
  const cfg = stravaConfig();
  if (!cfg) return Response.redirect(new URL("/espace?strava=non_configure", req.url), 303);
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: cfg.id, response_type: "code", approval_prompt: "auto", scope: STRAVA_SCOPE,
    redirect_uri: new URL("/api/strava/callback", req.url).toString(), state: createState(user.id),
  }).toString();
  return Response.redirect(url, 303);
}
