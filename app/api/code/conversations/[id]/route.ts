import { requireNullainSession } from "@/lib/server/nullain-auth";
import { deleteNullainCodeConversation } from "@/lib/server/nullain-code-runtime";
import { isInvalidCookieMutationOrigin } from "@/lib/server/request-security";
import { nullainRoute } from "@/lib/server/nullain-route";

export const runtime = "nodejs";

export const DELETE = nullainRoute(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    if (isInvalidCookieMutationOrigin(request))
      return Response.json({ error: "Origem não permitida." }, { status: 403 });
    const session = await requireNullainSession(request);
    await deleteNullainCodeConversation(session.user.id, (await context.params).id);
    return new Response(null, { status: 204 });
  },
);
