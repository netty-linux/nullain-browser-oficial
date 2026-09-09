import {
  clearBotOpenBotLink,
  getBotOpenBotLink,
  isBotComputerLinkEnabled,
  setBotOpenBotLink,
} from "@/lib/server/bot-openbot-link";
import { requireNullainSession } from "@/lib/server/nullain-auth";
import { isInvalidCookieMutationOrigin } from "@/lib/server/request-security";

export const runtime = "nodejs";

function failure(error: unknown) {
  if (error instanceof Response) return error;
  return Response.json(
    { error: error instanceof Error ? error.message : "Falha no vínculo do computador." },
    { status: 400 },
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireNullainSession(request);
    const { id } = await params;
    const link = isBotComputerLinkEnabled() ? getBotOpenBotLink(session.user.id, id) : null;
    return Response.json({ link, enabled: isBotComputerLinkEnabled() });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isInvalidCookieMutationOrigin(request))
    return Response.json({ error: "Origem não permitida." }, { status: 403 });
  try {
    const session = await requireNullainSession(request);
    const { id } = await params;
    if (!isBotComputerLinkEnabled())
      return Response.json({ error: "Vínculo de computador desativado." }, { status: 404 });
    const body = (await request.json()) as { openbotAgentId?: unknown };
    const link = setBotOpenBotLink(session.user.id, id, body.openbotAgentId);
    return Response.json({ link });
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
    if (!isBotComputerLinkEnabled())
      return Response.json({ error: "Vínculo de computador desativado." }, { status: 404 });
    clearBotOpenBotLink(session.user.id, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return failure(error);
  }
}
