export const INTEGRATION_SESSION_KEY = "nullain-integration-api-key";
export const PENDING_CONNECTION_SESSION_KEY = "nullain-pending-plugin-connect";
export const CONNECTION_CANDIDATES_SESSION_KEY = "nullain-plugin-connection-candidates";
export const CONFIRMED_CONNECTIONS_SESSION_KEY = "nullain-confirmed-plugin-connections";

/** Remove caracteres de controle sem alterar o conteúdo ASCII da chave. */
export function sanitizeIntegrationKey(value: string | null | undefined): string {
  return Array.from(value ?? "")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .trim()
    .slice(0, 512);
}

/** Apenas consumer keys podem autenticar o endpoint MCP Connect. */
export function isIntegrationConsumerKey(value: string): boolean {
  return /^ck_[A-Za-z0-9_-]{8,509}$/.test(value);
}
