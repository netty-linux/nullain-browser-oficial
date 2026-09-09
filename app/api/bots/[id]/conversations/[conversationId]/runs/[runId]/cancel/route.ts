import {
  cancelTranscriptRun,
  claimTranscriptRun,
  ensureTranscriptRun,
  getTranscriptRun,
} from "@/lib/server/bot-transcript-repository";
import { requireNullainSession } from "@/lib/server/nullain-auth";
import { isInvalidCookieMutationOrigin } from "@/lib/server/request-security";
export const runtime = "nodejs";
function failure(error: unknown) {
  if (error instanceof Response) return error;
  return Response.json(
    { error: error instanceof Error ? error.message : "Falha na execução." },
    { status: 400 },
  );
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; conversationId: string; runId: string }> },
) {
  if (isInvalidCookieMutationOrigin(request))
    return Response.json({ error: "Origem não permitida." }, { status: 403 });
  try {
    const s = await requireNullainSession(request);
    const p = await params;
    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "cancel";
    if (action !== "cancel") return Response.json({ error: "Ação desconhecida." }, { status: 400 });
    const run = ensureTranscriptRun(s.user.id, p.id, p.conversationId, p.runId);
    const claim = claimTranscriptRun(s.user.id, p.id, p.conversationId, run.id);
    if (!claim.claimed || !claim.capability) {
      const current = getTranscriptRun(s.user.id, p.id, p.conversationId, run.id);
      if (current.status === "completed") return Response.json({ run: current, cancelled: false });
      return Response.json(
        { error: `Execução já está ${current.status}.`, run: current },
        { status: current.status === "running" ? 409 : 422 },
      );
    }
    const cancelled = cancelTranscriptRun(
      s.user.id,
      p.id,
      p.conversationId,
      claim.capability,
      "Cancelado pelo usuário.",
    );
    return Response.json({ run: cancelled, cancelled: true });
  } catch (e) {
    return failure(e);
  }
}
