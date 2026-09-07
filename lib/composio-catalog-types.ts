export type ComposioCategory = {
  id: string;
  name: string;
};

export type ComposioToolkit = {
  slug: string;
  name: string;
  description: string;
  logo: string | null;
  categories: ComposioCategory[];
  toolsCount: number;
  triggersCount: number;
  authSchemes: string[];
};

export type ComposioCatalogResponse = {
  items: ComposioToolkit[];
  nextCursor: string | null;
  totalItems: number;
};

export type ComposioCategoriesResponse = {
  items: ComposioCategory[];
};

export type ComposioCatalogErrorCode =
  | "COMPOSIO_API_KEY_NOT_CONFIGURED"
  | "COMPOSIO_API_KEY_INVALID"
  | "COMPOSIO_RATE_LIMITED"
  | "COMPOSIO_UNAVAILABLE";

export type ComposioCatalogError = {
  error: ComposioCatalogErrorCode;
};
