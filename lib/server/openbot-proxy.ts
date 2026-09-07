import { type NextRequest, NextResponse } from "next/server";

const DEFAULT_OPENBOT_URL = "http://localhost:3001";
const MAX_PROXY_BODY_BYTES = 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 45_000;

export type ProxyRule = {
  method: string;
  path: RegExp;
};

function openBotBaseUrl(): URL {
  const url = new URL(process.env.OPENBOT_API_URL ?? DEFAULT_OPENBOT_URL);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
    throw new Error("OPENBOT_API_URL deve ser uma URL HTTP(S) sem credenciais.");
  }
  return url;
}

function rejectsCrossSiteMutation(request: NextRequest): boolean {
  if (request.method === "GET" || request.method === "HEAD") return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin !== request.nextUrl.origin;
  } catch {
    return true;
  }
}

export async function proxyOpenBot(
  request: NextRequest,
  pathSegments: string[],
  upstreamPrefix: string,
  rules: readonly ProxyRule[],
) {
  const relativePath = pathSegments.join("/");
  const allowed = rules.some(
    (rule) => rule.method === request.method && rule.path.test(relativePath),
  );
  if (!allowed) {
    return NextResponse.json({ error: "Endpoint não permitido." }, { status: 404 });
  }
  if (rejectsCrossSiteMutation(request)) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_PROXY_BODY_BYTES) {
    return NextResponse.json({ error: "Payload muito grande." }, { status: 413 });
  }

  let body: ArrayBuffer | undefined;
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > MAX_PROXY_BODY_BYTES) {
        return NextResponse.json({ error: "Payload muito grande." }, { status: 413 });
      }
      body = bytes;
    }
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  try {
    const base = openBotBaseUrl();
    const upstream = new URL(`${upstreamPrefix}/${relativePath}`, `${base.origin}/`);
    const response = await fetch(upstream, {
      method: request.method,
      headers: {
        ...(request.headers.get("content-type")
          ? { "content-type": request.headers.get("content-type")! }
          : {}),
        ...(request.headers.get("cookie") ? { cookie: request.headers.get("cookie")! } : {}),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        ...(response.headers.get("content-type")
          ? { "content-type": response.headers.get("content-type")! }
          : {}),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("[openbot-proxy] upstream request failed", error);
    return NextResponse.json({ error: "Não foi possível alcançar o OpenBot." }, { status: 502 });
  }
}
