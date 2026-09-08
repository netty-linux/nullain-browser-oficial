import { requireNullainSession } from "@/lib/server/nullain-auth";
import { getNullainCodeWorkspaceSnapshot } from "@/lib/server/nullain-code-runtime";
import { nullainRoute } from "@/lib/server/nullain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = nullainRoute(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireNullainSession(request);
    const snapshot = await getNullainCodeWorkspaceSnapshot(
      session.user.id,
      (await context.params).id,
    );
    return Response.json(snapshot);
  },
);
