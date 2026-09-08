import { requireNullainSession } from "@/lib/server/nullain-auth";
import { cancelNullainCodeRun } from "@/lib/server/nullain-code-runtime";
import { isInvalidCookieMutationOrigin } from "@/lib/server/request-security";
import { nullainRoute } from "@/lib/server/nullain-route";

export const runtime = "nodejs";

export const POST = nullainRoute(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    if (isInvalidCookieMutationOrigin(request))
      return Response.json({ error: "Origem não permitida." }, { status: 403 });
    const session = await requireNullainSession(request);
    await cancelNullainCodeRun(session.user.id, (await context.params).id);
    return Response.json({ ok: true });
  },
);
