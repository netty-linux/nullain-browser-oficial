import { requireNullainSession } from "@/lib/server/nullain-auth";
import { requireBot, requireBotConversation } from "@/lib/server/bot-runtime-repository";
import {
  clickLocalComputer,
  getLocalComputerControl,
  getLocalComputerPageFrame,
  humanClickLocalComputer,
  humanKeyLocalComputer,
  humanScrollLocalComputer,
  humanTypeLocalComputer,
  keyLocalComputer,
  listLocalComputerTabs,
  localComputerStatus,
  navigateLocalComputer,
  readLocalComputer,
  screenshotLocalComputer,
  scrollLocalComputer,
  setLocalComputerControl,
  snapshotLocalComputer,
  switchLocalComputerTab,
  supplyLocalComputerSecret,
  typeLocalComputer,
  type LocalComputerScope,
} from "@/lib/server/local-computer";
import { isInvalidCookieMutationOrigin } from "@/lib/server/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; conversationId: string; path: string[] }>;
};

async function authorizedScope(
  request: Request,
  context: Context,
): Promise<{
  scope: LocalComputerScope;
  path: string[];
}> {
  const session = await requireNullainSession(request);
  const { id, conversationId, path } = await context.params;
  requireBot(session.user.id, id);
  const conversation = requireBotConversation(session.user.id, conversationId);
  if (conversation.botId !== id)
    throw new Response("Conversa não pertence ao bot.", { status: 404 });
  return {
    scope: { ownerUserId: session.user.id, botId: id, conversationId },
    path: path ?? [],
  };
}

function failure(error: unknown) {
  if (error instanceof Response) return error;
  return Response.json(
    { error: error instanceof Error ? error.message : "Computador local indisponível." },
    { status: 400 },
  );
}

export async function GET(request: Request, context: Context) {
  try {
    const { scope, path } = await authorizedScope(request, context);
    const action = path.join("/");
    if (action === "status") return Response.json(await localComputerStatus(scope));
    if (action === "screenshot") return Response.json(await screenshotLocalComputer(scope));
    if (action === "control") return Response.json(await getLocalComputerControl(scope));
    if (action === "read") return Response.json(await readLocalComputer(scope));
    if (action === "tabs") return Response.json(await listLocalComputerTabs(scope));
    if (path[0] === "page-frame" && path.length === 2) {
      return Response.json({ frame: await getLocalComputerPageFrame(scope, path[1]) });
    }
    return Response.json({ error: "Ação de computador desconhecida." }, { status: 404 });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: Context) {
  if (isInvalidCookieMutationOrigin(request)) {
    return Response.json({ error: "Origem não permitida." }, { status: 403 });
  }
  try {
    const { scope, path } = await authorizedScope(request, context);
    const action = path.join("/");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (action === "navigate") {
      return Response.json(
        await navigateLocalComputer(
          scope,
          body.url,
          typeof body.toolCallId === "string" ? body.toolCallId : undefined,
        ),
      );
    }
    if (action === "snapshot") return Response.json(await snapshotLocalComputer(scope));
    if (action === "click") {
      return Response.json(await clickLocalComputer(scope, body.ref, body.snapshotId));
    }
    if (action === "type") {
      return Response.json(
        await typeLocalComputer(scope, body.ref, body.snapshotId, body.text, body.submit === true),
      );
    }
    if (action === "key") return Response.json(await keyLocalComputer(scope, body.key));
    if (action === "scroll") {
      return Response.json(await scrollLocalComputer(scope, body.deltaY));
    }
    if (action === "switch-tab") {
      return Response.json(await switchLocalComputerTab(scope, body.index));
    }
    if (action === "control/take") {
      return Response.json(await setLocalComputerControl(scope, "human"));
    }
    if (action === "control/release") {
      return Response.json(await setLocalComputerControl(scope, "assistant"));
    }
    if (action === "human/click") {
      return Response.json(await humanClickLocalComputer(scope, body.x, body.y));
    }
    if (action === "human/type") {
      return Response.json(await humanTypeLocalComputer(scope, body.text));
    }
    if (action === "human/key") {
      return Response.json(await humanKeyLocalComputer(scope, body.key));
    }
    if (action === "human/scroll") {
      return Response.json(await humanScrollLocalComputer(scope, body.deltaY));
    }
    if (action === "human/secret") {
      return Response.json(await supplyLocalComputerSecret(scope, body.text));
    }
    return Response.json({ error: "Ação de computador desconhecida." }, { status: 404 });
  } catch (error) {
    return failure(error);
  }
}
