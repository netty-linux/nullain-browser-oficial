import path from "node:path";
import os from "node:os";

export const NULLAIN_COOKIE_PREFIX = "nullain-code-auth";

export class NullainConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NullainConfigurationError";
  }
}

export function getNullainWorkspaceRoot() {
  const workspaceRoot = path.normalize(
    process.env.NULLAIN_WORKSPACE_ROOT ?? path.join(os.homedir(), "nullain-code-workspace"),
  );
  if (!path.isAbsolute(workspaceRoot)) {
    throw new NullainConfigurationError("NULLAIN_WORKSPACE_ROOT deve ser absoluto.");
  }
  return workspaceRoot;
}

function parseOrigin(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new NullainConfigurationError(`${label} deve ser uma URL absoluta.`);
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.pathname !== "/") {
    throw new NullainConfigurationError(`${label} deve conter apenas uma origem HTTP(S).`);
  }
  return url.origin;
}

export function getNullainConfig() {
  const secret = process.env.NULLAIN_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new NullainConfigurationError("NULLAIN_AUTH_SECRET ausente ou menor que 32 caracteres.");
  }

  const configuredDatabasePath = process.env.NULLAIN_APP_DB_PATH;
  const databasePath = configuredDatabasePath
    ? path.normalize(configuredDatabasePath)
    : path.join(process.cwd(), ".nullain", "nullain-app.db");
  if (!path.isAbsolute(databasePath)) {
    throw new NullainConfigurationError("NULLAIN_APP_DB_PATH deve ser absoluto.");
  }
  const workspaceRoot = getNullainWorkspaceRoot();
  const workspace = workspaceRoot.toLowerCase();
  const database = databasePath.toLowerCase();
  if (database === workspace || database.startsWith(`${workspace}${path.sep}`)) {
    throw new NullainConfigurationError(
      "O banco da aplicação não pode ficar no workspace do agente.",
    );
  }

  const baseURL = parseOrigin(
    process.env.NULLAIN_AUTH_BASE_URL ?? "http://localhost:3000",
    "NULLAIN_AUTH_BASE_URL",
  );
  const configuredOrigins = (process.env.NULLAIN_AUTH_TRUSTED_ORIGINS ?? baseURL)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => parseOrigin(origin, "NULLAIN_AUTH_TRUSTED_ORIGINS"));
  const trustedOrigins = [...new Set([baseURL, ...configuredOrigins])];

  return {
    baseURL,
    databasePath,
    secret,
    trustedOrigins,
    workspaceRoot,
    secureCookies: new URL(baseURL).protocol === "https:",
  } as const;
}
