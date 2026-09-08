import "server-only";

import { betterAuth } from "better-auth";
import { getNullainConfig, NULLAIN_COOKIE_PREFIX } from "./nullain-config";
import { assertNullainDatabaseReady, getNullainDatabase } from "./nullain-db";

type NullainAuth = ReturnType<typeof createNullainAuth>;
type GlobalAuth = typeof globalThis & { __nullainAuth?: NullainAuth };

function createNullainAuth() {
  const config = getNullainConfig();
  const database = getNullainDatabase();
  assertNullainDatabaseReady(database);
  return betterAuth({
    appName: "Nullain Code",
    baseURL: config.baseURL,
    basePath: "/api/auth",
    secret: config.secret,
    database,
    trustedOrigins: config.trustedOrigins,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "memory",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/change-password": { window: 60, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: NULLAIN_COOKIE_PREFIX,
      useSecureCookies: config.secureCookies,
      disableCSRFCheck: false,
      disableOriginCheck: false,
      crossSubDomainCookies: { enabled: false },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.secureCookies,
        path: "/",
      },
    },
  });
}

export function getNullainAuth() {
  const globals = globalThis as GlobalAuth;
  if (!globals.__nullainAuth) globals.__nullainAuth = createNullainAuth();
  return globals.__nullainAuth;
}

export type NullainSession = NonNullable<
  Awaited<ReturnType<ReturnType<typeof getNullainAuth>["api"]["getSession"]>>
>;

export async function getNullainSession(headers: Headers) {
  return getNullainAuth().api.getSession({ headers });
}

export async function requireNullainSession(request: Request): Promise<NullainSession> {
  const session = await getNullainSession(request.headers);
  if (!session) throw new Response("Não autenticado.", { status: 401 });
  return session;
}
