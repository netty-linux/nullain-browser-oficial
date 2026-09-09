import {
  appendUserTranscript,
  getActiveTranscriptRun,
  listBotTranscript,
} from "@/lib/server/bot-transcript-repository";
import { requireNullainSession } from "@/lib/server/nullain-auth";
import { isInvalidCookieMutationOrigin } from "@/lib/server/request-security";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; conversationId: string }> },
) {
  try {
    const s = await requireNullainSession(request);
    const p = await params;
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const beforeValue = url.searchParams.get("before");
    const before = beforeValue === null ? undefined : Number(beforeValue);
    const messages = listBotTranscript(
      s.user.id,
      p.id,
      p.conversationId,
      Number.isFinite(limit) ? limit : 50,
      Number.isFinite(before) ? before : undefined,
    );
    return Response.json({
      messages,
      activeRun: getActiveTranscriptRun(s.user.id, p.id, p.conversationId),
      nextCursor:
        messages.length === Math.min(Math.max(limit, 1), 100) ? messages[0]?.sequence : null,
    });
  } catch (e) {
    return e instanceof Response
      ? e
      : Response.json({ error: "Transcript indisponível." }, { status: 400 });
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; conversationId: string }> },
) {
  if (isInvalidCookieMutationOrigin(request))
    return Response.json({ error: "Origem não permitida." }, { status: 403 });
  try {
    const s = await requireNullainSession(request),
      p = await params;
    const body = (await request.json()) as Record<string, unknown>;
    if ("role" in body || "status" in body || "ownerUserId" in body || "runId" in body)
      return Response.json({ error: "Campos controlados pelo servidor." }, { status: 400 });
    return Response.json(
      { message: appendUserTranscript(s.user.id, p.id, p.conversationId, body as never) },
      { status: 201 },
    );
  } catch (e) {
    return e instanceof Response
      ? e
      : Response.json(
          { error: e instanceof Error ? e.message : "Mensagem recusada." },
          { status: 400 },
        );
  }
}
