import { createConversation, listConversations } from "@/lib/server/nullain-code-repository";
import { requireNullainSession } from "@/lib/server/nullain-auth";
import { isInvalidCookieMutationOrigin } from "@/lib/server/request-security";
import { nullainRoute } from "@/lib/server/nullain-route";

export const runtime = "nodejs";

export const GET = nullainRoute(async (request: Request) => {
  const session = await requireNullainSession(request);
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return Response.json({ error: "projectId obrigatório." }, { status: 400 });
  return Response.json({ conversations: listConversations(session.user.id, projectId) });
});

export const POST = nullainRoute(async (request: Request) => {
  if (isInvalidCookieMutationOrigin(request))
    return Response.json({ error: "Origem não permitida." }, { status: 403 });
  const session = await requireNullainSession(request);
  const body = (await request.json()) as { projectId?: unknown };
  if (typeof body.projectId !== "string")
    return Response.json({ error: "projectId inválido." }, { status: 400 });
  return Response.json(
    { conversation: createConversation(session.user.id, body.projectId) },
    { status: 201 },
  );
});
