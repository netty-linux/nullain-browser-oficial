import { NextResponse, type NextRequest } from "next/server";
import {
  ComposioCatalogError,
  getComposioCategories,
  getComposioToolkits,
} from "@/lib/server/composio-catalog";
import {
  getActiveComposioConnections,
  getComposioTools,
} from "@/src/mastra/integrations/composio-mcp";

export const runtime = "nodejs";
const RESPONSE_HEADERS = { "Cache-Control": "private, no-store" };

function clean(value: string | null, maxLength: number): string {
  return Array.from((value ?? "").normalize("NFKC"))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .trim()
    .slice(0, maxLength);
}

function errorResponse(error: unknown) {
  const code =
    error instanceof ComposioCatalogError ? error.code : ("COMPOSIO_UNAVAILABLE" as const);
  const status = code === "COMPOSIO_RATE_LIMITED" ? 429 : 503;
  return NextResponse.json({ error: code }, { status, headers: RESPONSE_HEADERS });
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode");
  const sessionApiKey = clean(request.headers.get("x-nullain-integration-key"), 512);
  try {
    if (mode === "connection") {
      const tools = await getComposioTools(sessionApiKey);
      if (Object.keys(tools).length === 0) {
        return NextResponse.json(
          { error: "CONNECTION_KEY_INVALID" },
          { status: 401, headers: RESPONSE_HEADERS },
        );
      }
      return NextResponse.json({ ready: true }, { headers: RESPONSE_HEADERS });
    }

    if (mode === "categories") {
      return NextResponse.json(await getComposioCategories(sessionApiKey), {
        headers: RESPONSE_HEADERS,
      });
    }

    const search = clean(request.nextUrl.searchParams.get("search"), 100);
    const category = clean(request.nextUrl.searchParams.get("category"), 80).toLowerCase();
    const cursor = clean(request.nextUrl.searchParams.get("cursor"), 512);
    if (category && !/^[a-z0-9][a-z0-9_-]*$/.test(category)) {
      return NextResponse.json(
        { error: "INVALID_CATEGORY" },
        { status: 400, headers: RESPONSE_HEADERS },
      );
    }
    if (cursor && !/^[A-Za-z0-9+/=_-]+$/.test(cursor)) {
      return NextResponse.json(
        { error: "INVALID_CURSOR" },
        { status: 400, headers: RESPONSE_HEADERS },
      );
    }

    return NextResponse.json(
      await getComposioToolkits({ search, category, cursor, apiKey: sessionApiKey }),
      { headers: RESPONSE_HEADERS },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const sessionApiKey = clean(request.headers.get("x-nullain-integration-key"), 512);
  if (!sessionApiKey) {
    return NextResponse.json(
      { error: "CONNECTION_KEY_INVALID" },
      { status: 401, headers: RESPONSE_HEADERS },
    );
  }

  try {
    const raw = (await request.json()) as { toolkits?: unknown };
    const toolkits = Array.isArray(raw.toolkits)
      ? [...new Set(raw.toolkits)]
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.toLowerCase().trim())
          .filter((value) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value))
          .slice(0, 16)
      : [];
    if (toolkits.length === 0) {
      return NextResponse.json({ items: [] }, { headers: RESPONSE_HEADERS });
    }
    const items = await getActiveComposioConnections(toolkits, sessionApiKey, request.signal);
    return NextResponse.json({ items }, { headers: RESPONSE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: "CONNECTION_STATUS_UNAVAILABLE" },
      { status: 503, headers: RESPONSE_HEADERS },
    );
  }
}
