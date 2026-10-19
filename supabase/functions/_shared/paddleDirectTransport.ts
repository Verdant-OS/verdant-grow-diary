/**
 * Env-gated direct Paddle sandbox transport.
 *
 * Pure: no Deno, no I/O, no clock. The caller passes `getEnv`.
 * Both direct vars unset means the Lovable gateway path (production today).
 * If either var is present, direct mode was intended: validate it and refuse
 * rather than falling back to the gateway or to live Paddle.
 */
export const PADDLE_SANDBOX_API_BASE = "https://sandbox-api.paddle.com";
export const PADDLE_GATEWAY_ORIGIN = "https://connector-gateway.lovable.dev/paddle";
export const PADDLE_DIRECT_CONFIG_REFUSED = "paddle_direct_config_refused";

const PRODUCTION_SUPABASE_HOST = "knkwiiywfkbqznbxwqfh.supabase.co";

export const PADDLE_DIRECT_REFUSAL_REASONS = [
  "direct_requires_sandbox_env",
  "direct_requires_payments_env_sandbox",
  "direct_base_not_sandbox_host",
  "direct_key_not_sandbox",
  "direct_forbidden_on_production_project",
] as const;

export type PaddleDirectRefusal = (typeof PADDLE_DIRECT_REFUSAL_REASONS)[number];

export type PaddleTransport =
  | { mode: "gateway" }
  | { mode: "direct"; apiKey: string; base: string }
  | { mode: "refused"; reason: PaddleDirectRefusal };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function supabaseHostname(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

export function resolvePaddleTransport(
  env: "sandbox" | "live",
  getEnv: (name: string) => string | undefined,
): PaddleTransport {
  const rawKey = getEnv("PADDLE_DIRECT_API_KEY");
  const rawBase = getEnv("PADDLE_API_BASE");
  if (rawKey === undefined && rawBase === undefined) {
    return { mode: "gateway" };
  }

  if (env !== "sandbox") {
    return { mode: "refused", reason: "direct_requires_sandbox_env" };
  }
  if (getEnv("PAYMENTS_ENVIRONMENT") !== "sandbox") {
    return { mode: "refused", reason: "direct_requires_payments_env_sandbox" };
  }
  if (rawBase !== PADDLE_SANDBOX_API_BASE) {
    return { mode: "refused", reason: "direct_base_not_sandbox_host" };
  }

  const apiKey = (rawKey ?? "").trim();
  if (apiKey.length === 0 || !apiKey.includes("_sdbx")) {
    return { mode: "refused", reason: "direct_key_not_sandbox" };
  }
  if (supabaseHostname(getEnv("SUPABASE_URL")) === PRODUCTION_SUPABASE_HOST) {
    return { mode: "refused", reason: "direct_forbidden_on_production_project" };
  }

  return { mode: "direct", apiKey, base: rawBase };
}

export function directPriceLookupPath(configuredId: string): string {
  return `/prices/${encodeURIComponent(configuredId)}`;
}

export function gatewayPriceQueryPath(requested: string): string {
  return `/prices?external_id=${encodeURIComponent(requested)}`;
}

/** Direct mode looks up one price id. Gateway mode keeps the external_id query. */
export function priceLookupPath(direct: boolean, configuredId: string, requested: string): string {
  return direct ? directPriceLookupPath(configuredId) : gatewayPriceQueryPath(requested);
}

export type PaddleGatewayKeys = {
  connectionApiKey: string;
  lovableApiKey: string;
};

export type PaddleFetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * The only Paddle HTTP dispatch. Refused config throws and does not call fetch
 * or the gateway key reader. Direct mode never reads gateway keys.
 */
export async function performPaddleFetch(args: {
  env: "sandbox" | "live";
  getEnv: (name: string) => string | undefined;
  path: string;
  init?: RequestInit;
  fetch: PaddleFetch;
  gatewayKeys: () => PaddleGatewayKeys;
}): Promise<Response> {
  const transport = resolvePaddleTransport(args.env, args.getEnv);
  if (transport.mode === "refused") {
    throw new Error(PADDLE_DIRECT_CONFIG_REFUSED);
  }
  if (transport.mode === "direct") {
    return args.fetch(`${transport.base}${args.path}`, {
      ...args.init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${transport.apiKey}`,
        ...args.init?.headers,
      },
    });
  }
  const keys = args.gatewayKeys();
  return args.fetch(`${PADDLE_GATEWAY_ORIGIN}${args.path}`, {
    ...args.init,
    headers: {
      "Content-Type": "application/json",
      "X-Connection-Api-Key": keys.connectionApiKey,
      "Lovable-API-Key": keys.lovableApiKey,
      ...args.init?.headers,
    },
  });
}

/** Alias only named provider fields; never recursively rewrite custom_data. */
function aliasProviderFields(value: unknown, aliases: Record<string, string>): unknown {
  if (!isRecord(value)) return value;
  const result = { ...value };
  for (const [wire, sdk] of Object.entries(aliases)) {
    if (Object.prototype.hasOwnProperty.call(value, wire)) result[sdk] = value[wire];
  }
  return result;
}

/**
 * Webhook item normalization. custom_data.external_id is copied onto
 * importMeta only when directMode is true. Gateway mode leaves that id off
 * importMeta.
 */
export function normalizeWebhookItemResources(items: unknown, directMode: boolean): unknown {
  if (!Array.isArray(items)) return items;
  const normalized = items.map((item) => {
    if (!isRecord(item)) return item;
    const next = { ...item };
    for (const key of ["price", "product"] as const) {
      const resource = aliasProviderFields(item[key], { import_meta: "importMeta" });
      if (isRecord(resource)) {
        resource.importMeta = aliasProviderFields(resource.importMeta, {
          external_id: "externalId",
        });
      }
      next[key] = resource;
    }
    return next;
  });
  if (!directMode) return normalized;
  return applyDirectModeExternalIdFallback(normalized);
}

export function priceExternalIdFromResolvedPrice(
  price: {
    importMeta?: { externalId?: string } | null;
    customData?: { external_id?: string } | null;
  } | null,
  directMode: boolean,
): string | null {
  return (
    price?.importMeta?.externalId ?? (directMode ? price?.customData?.external_id : null) ?? null
  );
}

export function extractDirectPriceId(body: unknown, requested: string): string | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  if (body.data.status !== "active") return null;
  const customData = body.data.custom_data;
  if (!isRecord(customData) || customData.external_id !== requested) return null;
  return nonEmptyString(body.data.id) ? body.data.id : null;
}

export function externalIdFromCustomData(resource: unknown): string | undefined {
  if (!isRecord(resource)) return undefined;
  const fromSnake = isRecord(resource.custom_data) ? resource.custom_data.external_id : undefined;
  if (nonEmptyString(fromSnake)) return fromSnake;
  const fromCamel = isRecord(resource.customData) ? resource.customData.external_id : undefined;
  return nonEmptyString(fromCamel) ? fromCamel : undefined;
}

function resourceWithDirectExternalId(resource: unknown): unknown {
  if (!isRecord(resource)) return resource;
  const importMeta = resource.importMeta;
  const existing = isRecord(importMeta) ? importMeta.externalId : undefined;
  if (nonEmptyString(existing)) return resource;
  const externalId = externalIdFromCustomData(resource);
  if (!externalId) return resource;
  return { ...resource, importMeta: { externalId } };
}

/** Fill absent price/product importMeta.externalId from custom data. */
export function applyDirectModeExternalIdFallback<T>(items: T): T {
  if (!Array.isArray(items)) return items;
  return items.map((item) => {
    if (!isRecord(item)) return item;
    const price = resourceWithDirectExternalId(item.price);
    const product = resourceWithDirectExternalId(item.product);
    if (price === item.price && product === item.product) return item;
    return { ...item, price, product };
  }) as T;
}
