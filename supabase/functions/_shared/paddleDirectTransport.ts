/**
 * Env-gated direct Paddle sandbox transport.
 *
 * Pure: no Deno, no I/O, no clock. The caller passes `getEnv`.
 * Both direct vars unset means the Lovable gateway path (production today).
 * If either var is present, direct mode was intended: validate it and refuse
 * rather than falling back to the gateway or to live Paddle.
 * The webhook is the exception: a direct variable on production must not
 * take that endpoint down. See webhookBillingMode.
 */
export const PADDLE_SANDBOX_API_BASE = "https://sandbox-api.paddle.com";
export const PADDLE_GATEWAY_ORIGIN = "https://connector-gateway.lovable.dev/paddle";
export const PADDLE_DIRECT_CONFIG_REFUSED = "paddle_direct_config_refused";

/**
 * Explicit current override of AGENTS.md:72-77 for this module.
 * Cheeko via Verdante on 2026-10-19 approved keeping this env-gated sandbox
 * transport (11:11 CDT, amend that section in a later docs PR; 11:23 CDT,
 * option A execute; 11:30 CDT, "Yes to all three"). Both direct variables
 * unset stays on the Lovable gateway. This is not a customer or production
 * environment, and the docs amendment is a separate PR.
 */
export const DIRECT_SANDBOX_TRANSPORT_OVERRIDE = {
  agentsSection: "72-77",
  approvedBy: "Cheeko via Verdante",
  approvedOn: "2026-10-19",
  keepsDirectSandboxTransport: true,
  productionPathWhenUnset: "gateway",
} as const;

const PRODUCT_CATALOG_EVENT_TYPES = new Set([
  "subscription.created",
  "subscription.updated",
  "subscription.activated",
  "subscription.resumed",
  "subscription.trialing",
  "subscription.past_due",
  "subscription.paused",
]);

/** Cancellation and one-time events do not need a product catalog read. */
export function directEventEnrichesProductCatalog(eventType: unknown): boolean {
  return typeof eventType === "string" && PRODUCT_CATALOG_EVENT_TYPES.has(eventType);
}

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

/**
 * Webhook transport. Checkout still refuses a bad direct config.
 * A live notification, a non-sandbox payments environment, or the production
 * project falls back to the gateway so one direct variable cannot 500 every
 * event. Any other refusal is a clear reject, not an internal failure.
 */
export function webhookBillingMode(
  env: "sandbox" | "live",
  getEnv: (name: string) => string | undefined,
): { mode: "direct" } | { mode: "gateway" } | { mode: "reject"; reason: PaddleDirectRefusal } {
  const transport = resolvePaddleTransport(env, getEnv);
  if (transport.mode === "direct" || transport.mode === "gateway") {
    return { mode: transport.mode };
  }
  const onProductionProject = supabaseHostname(getEnv("SUPABASE_URL")) === PRODUCTION_SUPABASE_HOST;
  if (onProductionProject || env !== "sandbox" || getEnv("PAYMENTS_ENVIRONMENT") !== "sandbox") {
    return { mode: "gateway" };
  }
  return { mode: "reject", reason: transport.reason };
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

/** Map verified Paddle wire fields to the processor's SDK-style shape. */
export function normalizeVerifiedPaddleEvent(
  raw: unknown,
  options?: { directMode?: boolean },
): Record<string, unknown> | null {
  const directMode = options?.directMode === true;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const eventId =
    typeof o.eventId === "string"
      ? o.eventId
      : typeof o.event_id === "string"
        ? o.event_id
        : undefined;
  const eventType =
    typeof o.eventType === "string"
      ? o.eventType
      : typeof o.event_type === "string"
        ? o.event_type
        : undefined;
  if (!eventType) return null;
  const data = aliasProviderFields(o.data, {
    customer_id: "customerId",
    subscription_id: "subscriptionId",
    custom_data: "customData",
    current_billing_period: "currentBillingPeriod",
    scheduled_change: "scheduledChange",
    currency_code: "currencyCode",
  });
  if (isRecord(data)) {
    data.currentBillingPeriod = aliasProviderFields(data.currentBillingPeriod, {
      starts_at: "startsAt",
      ends_at: "endsAt",
    });
    data.scheduledChange = aliasProviderFields(data.scheduledChange, {
      effective_at: "effectiveAt",
    });
    if (Array.isArray(data.items)) {
      data.items = normalizeWebhookItemResources(data.items, directMode);
    }
    if (isRecord(data.details)) {
      data.details = {
        ...data.details,
        totals: aliasProviderFields(data.details.totals, {
          grand_total: "grandTotal",
          currency_code: "currencyCode",
        }),
      };
    }
  }
  return {
    ...o,
    eventId,
    eventType,
    data,
  };
}

export function priceExternalIdFromResolvedPrice(
  price: {
    importMeta?: { externalId?: string } | null;
    customData?: { external_id?: string } | null;
    custom_data?: { external_id?: string } | null;
  } | null,
  directMode: boolean,
): string | null {
  if (directMode) {
    // custom_data.external_id is the plan slug. import_meta is the source id.
    return externalIdFromCustomData(price) ?? null;
  }
  const imported = price?.importMeta?.externalId;
  return nonEmptyString(imported) ? imported : null;
}

export function extractDirectPriceId(body: unknown, requested: string): string | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  if (body.data.status !== "active") return null;
  const customData = body.data.custom_data;
  // import_meta.external_id is the source-provider record id, not the plan slug.
  if (!isRecord(customData) || customData.external_id !== requested) return null;
  return nonEmptyString(body.data.id) ? body.data.id : null;
}

/** Founder checkout stops before any price fetch when the cap is unproven or exhausted. */
export function founderSlotCheckoutBlock(remaining: unknown): "ok" | "sold_out" {
  if (typeof remaining !== "number" || remaining <= 0) return "sold_out";
  return "ok";
}

export function paddleClientPlan(
  transport: Exclude<PaddleTransport, { mode: "refused" }>,
): { mode: "direct"; apiKey: string } | { mode: "gateway" } {
  if (transport.mode === "direct") return { mode: "direct", apiKey: transport.apiKey };
  return { mode: "gateway" };
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
  const externalId = externalIdFromCustomData(resource);
  if (!externalId) return resource;
  const importMeta = isRecord(resource.importMeta) ? resource.importMeta : {};
  if (isRecord(resource.importMeta) && importMeta.externalId === externalId) return resource;
  return { ...resource, importMeta: { ...importMeta, externalId } };
}

/** Paddle id of a subscription item that has a price and no product external id. */
export function directPriceOnlyProductId(item: unknown): string | null {
  if (!isRecord(item) || !isRecord(item.price)) return null;
  const product = item.product;
  if (
    isRecord(product) &&
    isRecord(product.importMeta) &&
    nonEmptyString(product.importMeta.externalId)
  ) {
    return null;
  }
  const raw = item.price.product_id ?? item.price.productId;
  return nonEmptyString(raw) ? raw : null;
}

/**
 * Copy a catalog product's custom_data.external_id onto the item.
 * A product name or source import id is not a plan product id.
 */
export function attachCatalogProductExternalId(item: unknown, catalogProduct: unknown): boolean {
  if (!isRecord(item) || !directPriceOnlyProductId(item)) return false;
  const externalId = externalIdFromCustomData(catalogProduct);
  if (!externalId) return false;
  const product = isRecord(item.product) ? item.product : {};
  const importMeta = isRecord(product.importMeta) ? product.importMeta : {};
  const price = isRecord(item.price) ? item.price : undefined;
  const productId = price
    ? nonEmptyString(price.product_id)
      ? price.product_id
      : nonEmptyString(price.productId)
        ? price.productId
        : undefined
    : undefined;
  item.product = {
    ...product,
    id: nonEmptyString(product.id) ? product.id : productId,
    importMeta: { ...importMeta, externalId },
  };
  return true;
}

/** Prefer custom_data.external_id on price and product importMeta. */
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
