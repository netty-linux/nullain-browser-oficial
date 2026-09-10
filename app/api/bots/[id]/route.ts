import { deleteBot, requireBot, updateBotProfile } from "@/lib/server/bot-runtime-repository";
import { listGrantedSkillNames } from "@/lib/server/bot-runtime-repository";
import { destroyBotComputers } from "@/lib/server/local-computer";
import { requireNullainSession } from "@/lib/server/nullain-auth";
import { isInvalidCookieMutationOrigin } from "@/lib/server/request-security";

export const runtime = "nodejs";

function failure(error: unknown) {
  if (error instanceof Response) return error;
  return Response.json(
    { error: error instanceof Error ? error.message : "Falha ao processar bot." },
    { status: 400 },
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireNullainSession(request);
    const { id } = await params;
    const bot = requireBot(session.user.id, id);
    const skills = listGrantedSkillNames(session.user.id, id);
    return Response.json({ bot, skillNames: skills });
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
    const body = (await request.json()) as Record<string, unknown>;
    if ("isSystem" in body || "ownerUserId" in body || "slug" in body || "createdAt" in body)
      return Response.json({ error: "Campos controlados pelo servidor." }, { status: 400 });
    const bot = updateBotProfile(
      session.user.id,
      id,
      body as Parameters<typeof updateBotProfile>[2],
    );
    const skills = listGrantedSkillNames(session.user.id, id);
    return Response.json({ bot, skillNames: skills });
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
    const body = (await request.json().catch(() => ({}))) as { confirmName?: unknown };
    deleteBot(session.user.id, id, body);
    // O computador de cada bot é isolado por escopo — ao excluir, destrói as
    // sessões vivas (cookies/páginas) para nada vazar entre bots.
    await destroyBotComputers(session.user.id, id).catch(() => undefined);
    return new Response(null, { status: 204 });
  } catch (error) {
    return failure(error);
  }
}
