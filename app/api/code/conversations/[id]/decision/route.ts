import { requireNullainSession } from "@/lib/server/nullain-auth";
import { decideNullainCodeSuspension } from "@/lib/server/nullain-code-runtime";
import { isInvalidCookieMutationOrigin } from "@/lib/server/request-security";
import { nullainRoute } from "@/lib/server/nullain-route";

export const runtime = "nodejs";

export const POST = nullainRoute(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    if (isInvalidCookieMutationOrigin(request))
      return Response.json({ error: "Origem não permitida." }, { status: 403 });
    const session = await requireNullainSession(request);
    const body = (await request.json()) as {
      toolCallId?: unknown;
      approved?: unknown;
      feedback?: unknown;
      answer?: unknown;
    };
    if (typeof body.toolCallId !== "string" || typeof body.approved !== "boolean") {
      return Response.json({ error: "Decisão inválida." }, { status: 400 });
    }
    await decideNullainCodeSuspension({
      ownerUserId: session.user.id,
      authSessionId: session.session.id,
      conversationId: (await context.params).id,
      toolCallId: body.toolCallId,
      approved: body.approved,
      feedback: typeof body.feedback === "string" ? body.feedback : undefined,
      answer: body.answer,
    });
    return Response.json({ ok: true });
  },
);
