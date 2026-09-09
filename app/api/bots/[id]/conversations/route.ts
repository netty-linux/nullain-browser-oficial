import { ensureBotConversation } from "@/lib/server/bot-runtime-repository";
import { requireNullainSession } from "@/lib/server/nullain-auth";
import { isInvalidCookieMutationOrigin } from "@/lib/server/request-security";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isInvalidCookieMutationOrigin(request))
    return Response.json({ error: "Origem não permitida." }, { status: 403 });
  try {
    const session = await requireNullainSession(request);
    const { id } = await params;
    const body = (await request.json()) as { clientConversationId?: unknown };
    const conversation = ensureBotConversation(session.user.id, id, body.clientConversationId);
    return Response.json({ conversation });
  } catch (error) {
    return error instanceof Response
      ? error
      : Response.json(
          { error: error instanceof Error ? error.message : "Conversa recusada." },
          { status: 400 },
        );
  }
}
