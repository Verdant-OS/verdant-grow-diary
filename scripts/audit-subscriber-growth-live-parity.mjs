#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export const DEFAULT_SUBSCRIBER_GROWTH_ORIGIN = "https://verdantgrowdiary.com";
export const SUBSCRIBER_GROWTH_FOUNDER_COUNTER_URL =
  "https://knkwiiywfkbqznbxwqfh.supabase.co/functions/v1/founder-slots-remaining";
export const SUBSCRIBER_GROWTH_FOUNDER_TOTAL = 75;

const FOUNDER_COUNTER_REQUIRED_CORS_HEADERS = Object.freeze([
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
]);

export const SUBSCRIBER_GROWTH_LIVE_ROUTES = Object.freeze([
  "/",
  "/welcome",
  "/pricing",
  "/auth?mode=signup",
]);

export const SUBSCRIBER_GROWTH_ASSET_CHECKS = Object.freeze([
  Object.freeze({
    id: "landing-attribution",
    assetPrefix: "Landing-",
    markers: Object.freeze(["landing_page_view", "landing_signup_cta_clicked"]),
  }),
  Object.freeze({
    id: "signup-verification",
    assetPrefix: "Auth-",
    markers: Object.freeze(["signup_verification_required"]),
  }),
  Object.freeze({
    id: "signup-intent",
    assetPrefix: "signupAcquisitionRules-",
    markers: Object.freeze(["verdant_signup_source", "redirectTo"]),
  }),
  Object.freeze({
    id: "referral-attribution",
    entryAsset: true,
    markers: Object.freeze(["grower_invite", "utm_campaign"]),
  }),
  Object.freeze({
    id: "checkout-recovery",
    assetPrefix: "Pricing-",
    markers: Object.freeze(["pricing_checkout_blocked", "data-checkout-state"]),
  }),
]);

function normalizeOrigin(input) {
  const url = new URL(input);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("origin_must_be_http");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

export function extractModuleScriptPath(html) {
  if (typeof html !== "string") return null;
  const tags = html.match(/<script\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!/\btype=["']module["']/i.test(tag)) continue;
    const source = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (source) return source;
  }
  return null;
}

export function extractJavaScriptAssetPaths(source) {
  if (typeof source !== "string") return [];
  return [
    ...new Set(
      [...source.matchAll(/(?:^|["'`(])\/?(assets\/[A-Za-z0-9_./-]+\.js)/g)].map(
        (match) => `/${match[1]}`,
      ),
    ),
  ].sort();
}

export function selectSubscriberGrowthAssets(paths, entryAssetPath = null) {
  const safePaths = Array.isArray(paths)
    ? paths.filter((path) => typeof path === "string" && path.startsWith("/assets/"))
    : [];
  const safeEntryAssetPath =
    typeof entryAssetPath === "string" && entryAssetPath.startsWith("/assets/")
      ? entryAssetPath
      : null;

  return Object.fromEntries(
    SUBSCRIBER_GROWTH_ASSET_CHECKS.map((check) => {
      const matches = check.entryAsset
        ? safeEntryAssetPath
          ? [safeEntryAssetPath]
          : []
        : safePaths.filter((path) => path.split("/").at(-1)?.startsWith(check.assetPrefix));
      return [check.id, matches.length === 1 ? matches[0] : null];
    }),
  );
}

async function readResponse(response) {
  const text = await response.text();
  return {
    ok: response.ok === true,
    status: Number.isFinite(response.status) ? response.status : 0,
    text,
    deploymentId:
      response.headers?.get?.("x-deployment-id") ?? response.headers?.get?.("x-vercel-id") ?? null,
  };
}

function responseStatus(response) {
  return Number.isFinite(response?.status) ? response.status : 0;
}

function responseHeader(response, name) {
  return response?.headers?.get?.(name) ?? null;
}

function corsOriginAllowed(response, browserOrigin) {
  const allowedOrigin = responseHeader(response, "access-control-allow-origin");
  return allowedOrigin === "*" || allowedOrigin === browserOrigin;
}

function corsHeadersAllowed(response) {
  const allowedHeaders = responseHeader(response, "access-control-allow-headers");
  if (typeof allowedHeaders !== "string") return false;
  const allowed = new Set(
    allowedHeaders
      .split(",")
      .map((header) => header.trim().toLowerCase())
      .filter(Boolean),
  );
  return FOUNDER_COUNTER_REQUIRED_CORS_HEADERS.every((header) => allowed.has(header));
}

function isExactFounderCounterPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 2 && keys[0] === "remaining" && keys[1] === "total";
}

/**
 * Public, secret-free production proof for the Founder availability counter.
 * The returned evidence contains only statuses, stable reason codes, and the
 * already-public bounded aggregate after its exact payload contract passes.
 */
export async function auditFounderCounterLive({
  fetchImpl = globalThis.fetch,
  browserOrigin = DEFAULT_SUBSCRIBER_GROWTH_ORIGIN,
  endpoint = SUBSCRIBER_GROWTH_FOUNDER_COUNTER_URL,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch_unavailable");
  const normalizedBrowserOrigin = normalizeOrigin(browserOrigin);
  const errors = [];

  let optionsStatus = 0;
  let optionsCorsVerified = false;
  try {
    const response = await fetchImpl(endpoint, {
      method: "OPTIONS",
      headers: {
        Origin: normalizedBrowserOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": FOUNDER_COUNTER_REQUIRED_CORS_HEADERS.join(", "),
        "user-agent": "VerdantSubscriberGrowthParity/1.0",
      },
    });
    optionsStatus = responseStatus(response);
    if (response?.ok !== true) errors.push(`options_status_${optionsStatus}`);
    if (!corsOriginAllowed(response, normalizedBrowserOrigin)) {
      errors.push("options_origin_not_allowed");
    }
    if (!corsHeadersAllowed(response)) errors.push("options_headers_not_allowed");
    optionsCorsVerified =
      response?.ok === true &&
      corsOriginAllowed(response, normalizedBrowserOrigin) &&
      corsHeadersAllowed(response);
  } catch {
    errors.push("options_request_failed");
  }

  let postStatus = 0;
  let postCorsVerified = false;
  let payloadVerified = false;
  let verifiedRemaining = null;
  let verifiedTotal = null;
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Origin: normalizedBrowserOrigin,
        "Content-Type": "application/json",
        "user-agent": "VerdantSubscriberGrowthParity/1.0",
      },
      body: "{}",
    });
    postStatus = responseStatus(response);
    if (response?.ok !== true) errors.push(`post_status_${postStatus}`);
    postCorsVerified = corsOriginAllowed(response, normalizedBrowserOrigin);
    if (!postCorsVerified) errors.push("post_origin_not_allowed");

    const contentType = responseHeader(response, "content-type")?.toLowerCase() ?? "";
    const mediaType = contentType.split(";", 1)[0].trim();
    const jsonContentType = mediaType === "application/json" || mediaType.endsWith("+json");
    if (!jsonContentType) errors.push("post_content_type_not_json");

    let payload = null;
    let parsed = false;
    try {
      payload = JSON.parse(await response.text());
      parsed = true;
    } catch {
      errors.push("post_invalid_json");
    }

    const exactShape = parsed && isExactFounderCounterPayload(payload);
    if (parsed && !exactShape) errors.push("post_payload_shape_invalid");
    const valuesValid =
      exactShape &&
      Number.isInteger(payload.remaining) &&
      payload.remaining >= 0 &&
      payload.remaining <= SUBSCRIBER_GROWTH_FOUNDER_TOTAL &&
      Number.isInteger(payload.total) &&
      payload.total === SUBSCRIBER_GROWTH_FOUNDER_TOTAL;
    if (exactShape && !valuesValid) errors.push("post_payload_values_invalid");

    payloadVerified = response?.ok === true && jsonContentType && exactShape && valuesValid;
    if (payloadVerified) {
      verifiedRemaining = payload.remaining;
      verifiedTotal = payload.total;
    }
  } catch {
    errors.push("post_request_failed");
  }

  const ok = optionsCorsVerified && postCorsVerified && payloadVerified && errors.length === 0;

  return {
    kind: "public_founder_counter_live_check",
    attempted: true,
    ok,
    optionsStatus,
    postStatus,
    corsVerified: optionsCorsVerified && postCorsVerified,
    payloadVerified,
    remaining: ok ? verifiedRemaining : null,
    total: ok ? verifiedTotal : null,
    error: errors[0] ?? null,
    errors,
  };
}

export async function auditSubscriberGrowthLiveParity({
  origin = DEFAULT_SUBSCRIBER_GROWTH_ORIGIN,
  fetchImpl = globalThis.fetch,
  verifyFounderCounter = false,
  founderCounterEndpoint = SUBSCRIBER_GROWTH_FOUNDER_COUNTER_URL,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch_unavailable");
  const normalizedOrigin = normalizeOrigin(origin);

  const routeResponses = await Promise.all(
    SUBSCRIBER_GROWTH_LIVE_ROUTES.map(async (path) => {
      try {
        const response = await fetchImpl(`${normalizedOrigin}${path}`, {
          headers: { "user-agent": "VerdantSubscriberGrowthParity/1.0" },
          redirect: "follow",
        });
        const parsed = await readResponse(response);
        return { path, ok: parsed.ok, status: parsed.status, error: null, parsed };
      } catch (error) {
        return {
          path,
          ok: false,
          status: 0,
          error: error instanceof Error ? error.message : "route_fetch_failed",
          parsed: null,
        };
      }
    }),
  );

  const root = routeResponses.find((result) => result.path === "/")?.parsed ?? null;
  const modulePath = root ? extractModuleScriptPath(root.text) : null;
  let moduleSource = null;
  let moduleError = null;
  let entryAssetPath = null;

  if (!modulePath) {
    moduleError = "module_script_not_found";
  } else {
    try {
      const moduleUrl = new URL(modulePath, `${normalizedOrigin}/`);
      if (moduleUrl.origin !== new URL(normalizedOrigin).origin) {
        moduleError = "module_origin_mismatch";
      } else {
        entryAssetPath = moduleUrl.pathname;
        const response = await fetchImpl(moduleUrl, {
          headers: { "user-agent": "VerdantSubscriberGrowthParity/1.0" },
        });
        const parsed = await readResponse(response);
        if (!parsed.ok) moduleError = `module_fetch_${parsed.status}`;
        else moduleSource = parsed.text;
      }
    } catch (error) {
      moduleError = error instanceof Error ? error.message : "module_fetch_failed";
    }
  }

  const assetPaths = selectSubscriberGrowthAssets(
    extractJavaScriptAssetPaths(moduleSource),
    entryAssetPath,
  );
  const capabilityResults = await Promise.all(
    SUBSCRIBER_GROWTH_ASSET_CHECKS.map(async (check) => {
      const path = assetPaths[check.id];
      if (!path) {
        return {
          id: check.id,
          ok: false,
          path: null,
          missingMarkers: [...check.markers],
          error: "asset_not_found",
        };
      }

      try {
        const response = await fetchImpl(new URL(path, `${normalizedOrigin}/`), {
          headers: { "user-agent": "VerdantSubscriberGrowthParity/1.0" },
        });
        const parsed = await readResponse(response);
        if (!parsed.ok) {
          return {
            id: check.id,
            ok: false,
            path,
            missingMarkers: [...check.markers],
            error: `asset_fetch_${parsed.status}`,
          };
        }
        const missingMarkers = check.markers.filter((marker) => !parsed.text.includes(marker));
        return { id: check.id, ok: missingMarkers.length === 0, path, missingMarkers, error: null };
      } catch (error) {
        return {
          id: check.id,
          ok: false,
          path,
          missingMarkers: [...check.markers],
          error: error instanceof Error ? error.message : "asset_fetch_failed",
        };
      }
    }),
  );

  const routesPassed = routeResponses.filter((result) => result.ok).length;
  const capabilitiesPassed = capabilityResults.filter((result) => result.ok).length;
  const founderCounter = verifyFounderCounter
    ? await auditFounderCounterLive({
        fetchImpl,
        browserOrigin: normalizedOrigin,
        endpoint: founderCounterEndpoint,
      })
    : null;
  const ok =
    moduleError === null &&
    routesPassed === routeResponses.length &&
    capabilitiesPassed === capabilityResults.length &&
    (!verifyFounderCounter || founderCounter?.ok === true);

  return {
    ok,
    origin: normalizedOrigin,
    deploymentId: root?.deploymentId ?? null,
    modulePath,
    moduleError,
    routesPassed,
    routesTotal: routeResponses.length,
    capabilitiesPassed,
    capabilitiesTotal: capabilityResults.length,
    routes: routeResponses.map(({ parsed: _parsed, ...result }) => result),
    capabilities: capabilityResults,
    founderCounter,
  };
}

export function formatSubscriberGrowthLiveParity(result) {
  const lines = [
    `Subscriber growth live parity: ${result.ok ? "PASS" : "FAIL"}`,
    `Origin: ${result.origin}`,
    `Deployment: ${result.deploymentId ?? "unavailable"}`,
    `Routes: ${result.routesPassed}/${result.routesTotal}`,
    `Growth capabilities: ${result.capabilitiesPassed}/${result.capabilitiesTotal}`,
  ];

  if (result.founderCounter) {
    lines.push(`Founder counter: ${result.founderCounter.ok ? "PASS" : "FAIL"}`);
    if (!result.founderCounter.ok) {
      lines.push(`FAIL founder counter: ${result.founderCounter.errors.join(", ")}`);
    }
  }

  if (result.moduleError) lines.push(`FAIL module: ${result.moduleError}`);
  for (const route of result.routes) {
    if (!route.ok) lines.push(`FAIL route ${route.path}: ${route.error ?? route.status}`);
  }
  for (const capability of result.capabilities) {
    if (!capability.ok) {
      const detail = capability.error ?? `missing ${capability.missingMarkers.join(", ")}`;
      lines.push(`FAIL capability ${capability.id}: ${detail}`);
    }
  }

  return lines.join("\n");
}

async function main() {
  const originArg = process.argv.find((arg) => arg.startsWith("--origin="));
  const origin = originArg ? originArg.slice("--origin=".length) : DEFAULT_SUBSCRIBER_GROWTH_ORIGIN;
  const result = await auditSubscriberGrowthLiveParity({ origin, verifyFounderCounter: true });
  console.log(formatSubscriberGrowthLiveParity(result));
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `Subscriber growth live parity: ERROR\n${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  });
}
