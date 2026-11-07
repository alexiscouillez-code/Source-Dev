import { waitUntil } from "@vercel/functions";
import { handleWebhook, webhookVerifyToken, type WebhookEvent } from "@/lib/strava";

/** Validation de l’abonnement par Strava. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === webhookVerifyToken()) {
    return Response.json({ "hub.challenge": q.get("hub.challenge") });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Strava attend une réponse en moins de 2 s : on traite l’événement après avoir répondu. */
export async function POST(req: Request) {
  const event = (await req.json().catch(() => null)) as WebhookEvent | null;
  if (event?.owner_id && event.object_id) waitUntil(handleWebhook(event).catch((e) => console.error("événement Strava", e)));
  return new Response("ok");
}
