import { abortRunsForAuthSession } from "@/lib/server/nullain-code-runtime";
import { getNullainAuth, getNullainSession } from "@/lib/server/nullain-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(request: Request) {
  try {
    const signingOut = new URL(request.url).pathname.endsWith("/sign-out");
    const session = signingOut ? await getNullainSession(request.headers) : null;
    const response = await getNullainAuth().handler(request);
    if (signingOut && response.ok && session) abortRunsForAuthSession(session.session.id);
    return response;
  } catch (error) {
    console.error(
      "[nullain-auth] recurso indisponível",
      error instanceof Error ? error.message : error,
    );
    return Response.json(
      { error: "Nullain Code não configurado ou não migrado." },
      { status: 503 },
    );
  }
}

export const GET = handler;
export const POST = handler;
