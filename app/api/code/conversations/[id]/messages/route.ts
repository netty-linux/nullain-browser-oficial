import { nullainCodeController } from "@/src/mastra";
import { requireConversation } from "@/lib/server/nullain-code-repository";
import { requireNullainSession } from "@/lib/server/nullain-auth";
import { sendNullainCodeMessage } from "@/lib/server/nullain-code-runtime";
import { isInvalidCookieMutationOrigin } from "@/lib/server/request-security";
import { nullainRoute } from "@/lib/server/nullain-route";

export const runtime = "nodejs";

export const GET = nullainRoute(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireNullainSession(request);
    const conversation = requireConversation(session.user.id, (await context.params).id);
    const messages = await nullainCodeController.queryThreadMessages({
      threadId: conversation.mastraThreadId,
      limit: 200,
    });
    return Response.json({ messages });
  },
);

export const POST = nullainRoute(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    if (isInvalidCookieMutationOrigin(request))
      return Response.json({ error: "Origem não permitida." }, { status: 403 });
    const session = await requireNullainSession(request);
    const body = (await request.json()) as { content?: unknown };
    if (typeof body.content !== "string")
      return Response.json({ error: "Mensagem inválida." }, { status: 400 });
    const result = await sendNullainCodeMessage({
      ownerUserId: session.user.id,
      authSessionId: session.session.id,
      conversationId: (await context.params).id,
      content: body.content,
    });
    return Response.json(result, { status: 202 });
  },
);
