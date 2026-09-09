import { type NextRequest, NextResponse } from "next/server";
import { proxyOpenBot, type ProxyRule } from "@/lib/server/openbot-proxy";
import { getBotOpenBotLink, isBotComputerLinkEnabled } from "@/lib/server/bot-openbot-link";
import { getNullainSession } from "@/lib/server/nullain-auth";

/**
 * Proxy governado do computador por bot (Stage 3A).
 *
 * A rota resolve o identificador do computador no servidor a partir do
 * vínculo bot → agente OpenBot. O identificador vindo do browser nunca é
 * tratado como autoridade: ele só informa qual bot o usuário quer operar.
 */
const ID = "[A-Za-z0-9_-]{1,128}";
const COMPUTER_RULES: readonly ProxyRule[] = [
  { method: "GET", path: new RegExp(`^(?:status|screenshot|control|read)$`) },
  { method: "GET", path: new RegExp(`^page-frame/${ID}$`) },
  { method: "POST", path: new RegExp(`^(?:navigate|snapshot|click|type|key|scroll)$`) },
  { method: "POST", path: new RegExp(`^control/(?:take|release)$`) },
  { method: "POST", path: new RegExp(`^human/(?:secret|click|type|key|scroll)$`) },
];

export async function handler(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; path: string[] }> },
) {
  if (!isBotComputerLinkEnabled()) {
    return NextResponse.json({ error: "Computador por bot desativado." }, { status: 404 });
  }
  const { id, path } = await ctx.params;
  const session = await getNullainSession(request.headers).catch(() => null);
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const link = getBotOpenBotLink(session.user.id, id);
    if (!link) {
      return NextResponse.json({ error: "Bot sem computador vinculado." }, { status: 404 });
    }
    return proxyOpenBot(
      request,
      [link.openbotAgentId, ...(path ?? [])],
      "/api/computers",
      COMPUTER_RULES,
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Computador indisponível." },
      { status: 400 },
    );
  }
}

export { handler as GET, handler as POST };
