import { type NextRequest, NextResponse } from "next/server";
import { proxyOpenBot, type ProxyRule } from "@/lib/server/openbot-proxy";

/**
 * ============================================================================
 * Proxy da Nullain → computador do OpenBot (Inversão FASE 5).
 *
 * A UI Nullain (Next, porta 3000) agora é a interface principal. Os endpoints
 * de computador (screenshot, control, secret, human input) vivem no servidor
 * do OpenBot (porta 3001) e exigem sessão de usuário (cookie better-auth) —
 * e o OpenBot NÃO tem CORS de propósito (app.ts:1190).
 *
 * Este route handler repassa localmente `/api/computers/*` → OpenBot
 * preservando o cookie de sessão do browser. Como os cookies em `localhost`
 * são scoped por HOST (não por porta), o request que chega aqui a partir do
 * browser já carrega o cookie de sessão do OpenBot; repassamos o header
 * Cookie intacto para o upstream. Resultado: a UI Nullain fala com o
 * computador "como se fosse da mesma origem", sem CORS e sem fork no OpenBot.
 *
 *   GET/POST /api/computers/:id/*
 * ============================================================================
 */

const ID = "[A-Za-z0-9_-]{1,128}";
const COMPUTER_RULES: readonly ProxyRule[] = [
  { method: "GET", path: new RegExp(`^${ID}/(?:status|screenshot|control|read)$`) },
  { method: "GET", path: new RegExp(`^${ID}/page-frame/${ID}$`) },
  { method: "POST", path: new RegExp(`^${ID}/(?:navigate|snapshot|click|type|key|scroll)$`) },
  { method: "POST", path: new RegExp(`^${ID}/control/(?:take|release)$`) },
  { method: "POST", path: new RegExp(`^${ID}/human/(?:secret|click|type|key|scroll)$`) },
];

export async function handler(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!path || path.length === 0) {
    return NextResponse.json({ error: "Missing computer path." }, { status: 400 });
  }
  return proxyOpenBot(request, path, "/api/computers", COMPUTER_RULES);
}

export { handler as GET, handler as POST };
