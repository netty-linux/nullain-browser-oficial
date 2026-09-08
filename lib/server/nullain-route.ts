import "server-only";

import { NullainConfigurationError } from "./nullain-config";

export function nullainRoute<TArguments extends unknown[]>(
  handler: (...arguments_: TArguments) => Promise<Response>,
) {
  return async (...arguments_: TArguments) => {
    try {
      return await handler(...arguments_);
    } catch (error) {
      if (error instanceof Response) return error;
      if (error instanceof NullainConfigurationError) {
        return Response.json({ error: "Nullain Code não configurado." }, { status: 503 });
      }
      if (error instanceof SyntaxError) {
        return Response.json({ error: "JSON inválido." }, { status: 400 });
      }
      console.error("[nullain-code] route failure", error);
      return Response.json({ error: "Falha interna do Nullain Code." }, { status: 500 });
    }
  };
}
