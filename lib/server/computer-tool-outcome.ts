export type ComputerToolOutcome = {
  actionSucceeded: boolean;
  failure: string | null;
};

export function updateComputerToolOutcome(
  previous: ComputerToolOutcome,
  toolName: string,
  result: unknown,
): ComputerToolOutcome {
  if (!/(?:openbot|nullain)_computer_/.test(toolName)) return previous;
  const value = result as
    | { ok?: unknown; error?: unknown; message?: unknown; reason?: unknown }
    | undefined;
  const observation = /_computer_(?:read|snapshot|tabs)$/.test(toolName);
  const action = /_computer_(?:open_site|navigate|click|type|key|scroll|switch_tab)$/.test(
    toolName,
  );
  if (value?.ok === true && action) return { actionSucceeded: true, failure: null };
  if (value?.ok !== false && value?.error !== true) return previous;
  if (observation && previous.actionSucceeded) return previous;
  return {
    actionSucceeded: previous.actionSucceeded,
    failure:
      (typeof value.error === "string" && value.error) ||
      (typeof value.message === "string" && value.message) ||
      (typeof value.reason === "string" && value.reason) ||
      "A ação no computador falhou e não foi concluída.",
  };
}
