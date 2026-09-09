import { cancelBotDraft, requireDraft, reviewBotDraft } from "@/lib/server/bot-runtime-repository";
import { requireNullainSession } from "@/lib/server/nullain-auth";
import { isInvalidCookieMutationOrigin } from "@/lib/server/request-security";
import { appendServerTranscript } from "@/lib/server/bot-transcript-repository";
import { requireBotConversation } from "@/lib/server/bot-runtime-repository";
import { botReviewPart } from "@/lib/server/bot-interview";
export const runtime = "nodejs";
function failure(error: unknown) {
  if (error instanceof Response) return error;
  return Response.json(
    { error: error instanceof Error ? error.message : "Falha ao atualizar rascunho." },
    { status: 400 },
  );
}
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireNullainSession(request);
    const { id } = await params;
    return Response.json({ draft: requireDraft(session.user.id, id) });
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isInvalidCookieMutationOrigin(request))
    return Response.json({ error: "Origem não permitida." }, { status: 403 });
  try {
    const session = await requireNullainSession(request);
    const { id } = await params;
    const draft = reviewBotDraft(session.user.id, id, await request.json());
    if (draft.sourceConversationId) {
      const conversation = requireBotConversation(session.user.id, draft.sourceConversationId);
      appendServerTranscript(
        session.user.id,
        conversation.botId,
        conversation.id,
        `bot-review:${draft.id}:${draft.revision}`,
        [{ type: "text", text: "A revisão foi atualizada." }, botReviewPart(draft)],
      );
    }
    return Response.json({ draft });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isInvalidCookieMutationOrigin(request))
    return Response.json({ error: "Origem não permitida." }, { status: 403 });
  try {
    const session = await requireNullainSession(request);
    const { id } = await params;
    cancelBotDraft(session.user.id, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return failure(error);
  }
}
