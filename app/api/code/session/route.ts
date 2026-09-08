import { requireNullainSession } from "@/lib/server/nullain-auth";
import { nullainRoute } from "@/lib/server/nullain-route";

export const runtime = "nodejs";

export const GET = nullainRoute(async (request: Request) => {
  const session = await requireNullainSession(request);
  return Response.json({
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
    expiresAt: session.session.expiresAt,
  });
});
