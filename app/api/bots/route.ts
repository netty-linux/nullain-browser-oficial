import { createBotDraft, listBots } from "@/lib/server/bot-runtime-repository";
import { requireNullainSession } from "@/lib/server/nullain-auth";
import { isInvalidCookieMutationOrigin } from "@/lib/server/request-security";

export const runtime = "nodejs";

function failure(error: unknown) {
  if (error instanceof Response) return error;
  return Response.json(
    { error: error instanceof Error ? error.message : "Falha ao processar bots." },
    { status: 400 },
  );
}

export async function GET(request: Request) {
  try {
    const session = await requireNullainSession(request);
    return Response.json({ bots: listBots(session.user.id) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  if (isInvalidCookieMutationOrigin(request))
    return Response.json({ error: "Origem não permitida." }, { status: 403 });
  try {
    const session = await requireNullainSession(request);
    const body = await request.json();
    return Response.json({ draft: createBotDraft(session.user.id, body) }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
