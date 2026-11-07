import { destroySession } from "@/lib/auth";

export async function GET(request: Request) {
  await destroySession();
  return Response.redirect(new URL("/", request.url), 303);
}
export const POST = GET;
