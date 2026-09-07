import { type NextRequest, NextResponse } from "next/server";
import { proxyOpenBot, type ProxyRule } from "@/lib/server/openbot-proxy";

/**
 * ============================================================================
 * Proxy da Nullain → OpenBot (Inversão FASE 5, parte 3).
 *
 * Repassa requisições REST (`/api/ob/agents/*`, `/api/ob/channels/*`, etc.) para
 * o servidor do OpenBot (`:3001`), preservando método, content-type e o cookie
 * de sessão. Serve os painéis que a UI Nullain ganhou (coworkers/agentes) sem
 * CORS e sem fork no OpenBot.
 *
 * Cuidado: o OpenBot NÃO tem CORS de propósito (app.ts:1190). O caminho é
 * `localhost`, onde cookies são scoped por HOST, então o cookie de sessão do
 * browser no `:3000` já é o mesmo do `:3001` e é repassado intacto.
 * ============================================================================
 */

const OPENBOT_RULES: readonly ProxyRule[] = [{ method: "GET", path: /^agents$/ }];

export async function handler(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!path || path.length === 0) {
    return NextResponse.json({ error: "Missing path." }, { status: 400 });
  }

  return proxyOpenBot(request, path, "/api", OPENBOT_RULES);
}

export { handler as GET };
