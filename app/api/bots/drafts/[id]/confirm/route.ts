import {
  createBotFromDraft,
  requireBotConversation,
  requireDraft,
} from "@/lib/server/bot-runtime-repository";
import { appendServerTranscript } from "@/lib/server/bot-transcript-repository";
import { requireNullainSession } from "@/lib/server/nullain-auth";
import { isInvalidCookieMutationOrigin } from "@/lib/server/request-security";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isInvalidCookieMutationOrigin(request))
    return Response.json({ error: "Origem não permitida." }, { status: 403 });
  try {
    const session = await requireNullainSession(request);
    const { id } = await params;
    const body = await request.json();
    const draft = requireDraft(session.user.id, id);
    return Response.json(
      {
        bot: (() => {
          const bot = createBotFromDraft(session.user.id, id, body.revision);
          if (draft.sourceConversationId) {
            const conversation = requireBotConversation(
              session.user.id,
              draft.sourceConversationId,
            );
            appendServerTranscript(
              session.user.id,
              conversation.botId,
              conversation.id,
              `bot-created:${draft.id}:${draft.revision}`,
              [
                {
                  type: "bot-created",
                  version: 1,
                  draftId: draft.id,
                  revision: draft.revision,
                  bot: {
                    id: bot.id,
                    name: bot.name,
                    description: bot.description,
                    avatarColorToken: bot.avatarColorToken,
                  },
                },
              ],
            );
          }
          return bot;
        })(),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao criar bot." },
      { status: 400 },
    );
  }
}
