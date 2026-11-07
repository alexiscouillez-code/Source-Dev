import { buildIcs, userForCalendar } from "@/lib/calendar";
import { todayIn } from "@/lib/engine/dates";

/** Flux iCalendar public, protégé par le jeton secret de l’URL. */
export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const userId = await userForCalendar(token.replace(/\.ics$/, ""));
  if (!userId) return new Response("Lien d’agenda invalide ou révoqué.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const ics = await buildIcs(userId, todayIn("Europe/Paris"));
  const download = new URL(request.url).searchParams.has("download");
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=900",
      "X-Robots-Tag": "noindex",
      ...(download ? { "Content-Disposition": 'attachment; filename="trail-pilot.ics"' } : {}),
    },
  });
}
