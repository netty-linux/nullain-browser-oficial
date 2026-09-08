import { getNullainSession } from "@/lib/server/nullain-auth";
import {
  abortRunsForAuthSession,
  getLiveConversation,
  subscribeNullainCode,
} from "@/lib/server/nullain-code-runtime";
import { nullainRoute } from "@/lib/server/nullain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEvent(value: unknown) {
  return JSON.stringify(value, (key, nested) => {
    if (/token|password|secret|authorization/i.test(key)) return undefined;
    if (nested instanceof Error) return { name: nested.name, message: nested.message };
    if (nested instanceof Map) return Object.fromEntries(nested);
    if (nested instanceof Set) return [...nested];
    return nested;
  });
}

export const GET = nullainRoute(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await getNullainSession(request.headers);
    if (!session) return new Response("Não autenticado.", { status: 401 });
    const conversationId = (await context.params).id;
    const item = await getLiveConversation(session.user.id, conversationId);
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream({
      start(controller) {
        const send = (event: string, data: unknown) => {
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${safeEvent(data)}\n\n`));
          } catch {
            // O cliente já fechou a conexão.
          }
        };
        send("ready", {
          displayState: item.session.displayState.get(),
          pending: [...item.pending.values()].map((entry) => entry.data),
        });
        unsubscribe = subscribeNullainCode(conversationId, (event) => send("controller", event));
        timer = setInterval(async () => {
          try {
            const current = await getNullainSession(request.headers);
            if (!current || current.session.id !== session.session.id) {
              abortRunsForAuthSession(session.session.id);
              send("auth-revoked", {});
              controller.close();
              if (timer) clearInterval(timer);
              unsubscribe?.();
            } else {
              send("heartbeat", { at: Date.now() });
            }
          } catch {
            abortRunsForAuthSession(session.session.id);
            controller.close();
            if (timer) clearInterval(timer);
            unsubscribe?.();
          }
        }, 15_000);
      },
      cancel() {
        if (timer) clearInterval(timer);
        unsubscribe?.();
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  },
);
