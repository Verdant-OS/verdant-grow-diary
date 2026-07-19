import { describe, expect, it, vi } from "vitest";

import {
  auditFounderCounterLive,
  auditSubscriberGrowthLiveParity,
  extractJavaScriptAssetPaths,
  extractModuleScriptPath,
  formatSubscriberGrowthLiveParity,
  SUBSCRIBER_GROWTH_FOUNDER_COUNTER_URL,
} from "../../scripts/audit-subscriber-growth-live-parity.mjs";

const ORIGIN = "https://example.test";
const MAIN_PATH = "/assets/index-release.js";
const ASSETS = {
  "/assets/Landing-release.js": "landing_page_view landing_signup_cta_clicked",
  "/assets/Auth-release.js": "signup_verification_required",
  "/assets/signupAcquisitionRules-release.js": "verdant_signup_source redirectTo",
  "/assets/Pricing-release.js": "pricing_checkout_blocked data-checkout-state",
} as const;

function response(body: string, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => body,
  };
}

function buildFetch(overrides: Partial<Record<string, ReturnType<typeof response>>> = {}) {
  const main = Object.keys(ASSETS)
    .map((path) => `"${path.slice(1)}"`)
    .concat("grower_invite utm_campaign")
    .join(",");
  const routes = new Set(["/", "/welcome", "/pricing", "/auth?mode=signup"]);

  return vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    const key = `${url.pathname}${url.search}`;
    if (overrides[key]) return overrides[key];
    if (routes.has(key)) {
      return response(`<script type="module" src="${MAIN_PATH}"></script>`, 200, {
        "x-vercel-id": "iad1::deploy-test",
      });
    }
    if (url.pathname === MAIN_PATH) return response(main);
    if (url.pathname in ASSETS) return response(ASSETS[url.pathname as keyof typeof ASSETS]);
    return response("not found", 404);
  });
}

const VALID_FOUNDER_OPTIONS_HEADERS = {
  "access-control-allow-origin": ORIGIN,
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};
const VALID_FOUNDER_POST_HEADERS = {
  "access-control-allow-origin": ORIGIN,
  "content-type": "application/json; charset=utf-8",
};

function founderOptions(
  headers: Record<string, string> = VALID_FOUNDER_OPTIONS_HEADERS,
  status = 200,
) {
  return response("ok", status, headers);
}

function founderPost(
  body: string | Record<string, unknown> = { remaining: 42, total: 100 },
  status = 200,
  headers: Record<string, string> = VALID_FOUNDER_POST_HEADERS,
) {
  return response(typeof body === "string" ? body : JSON.stringify(body), status, headers);
}

function buildFounderFetch({
  options = founderOptions(),
  post = founderPost(),
}: {
  options?: ReturnType<typeof response>;
  post?: ReturnType<typeof response>;
} = {}) {
  return vi.fn(async (_input: string | URL, init?: RequestInit) =>
    init?.method === "OPTIONS" ? options : post,
  );
}

describe("subscriber growth live parity script", () => {
  it("extracts a module path and deduplicated JavaScript assets", () => {
    expect(
      extractModuleScriptPath('<script defer></script><script src="/assets/a.js" type="module">'),
    ).toBe("/assets/a.js");
    expect(extractJavaScriptAssetPaths('"assets/z.js","/assets/a.js","assets/z.js"')).toEqual([
      "/assets/a.js",
      "/assets/z.js",
    ]);
  });

  it("passes only when every public route and fixed growth capability is deployed", async () => {
    const result = await auditSubscriberGrowthLiveParity({
      origin: ORIGIN,
      fetchImpl: buildFetch(),
    });

    expect(result.ok).toBe(true);
    expect(result.deploymentId).toBe("iad1::deploy-test");
    expect(result.routesPassed).toBe(4);
    expect(result.capabilitiesPassed).toBe(5);
    expect(result.capabilities.find((item) => item.id === "referral-attribution")?.path).toBe(
      MAIN_PATH,
    );
    expect(formatSubscriberGrowthLiveParity(result)).toContain(
      "Subscriber growth live parity: PASS",
    );
  });

  it("proves the public Founder counter with browser-shaped CORS and an exact bounded payload", async () => {
    const fetchImpl = buildFounderFetch({ post: founderPost({ remaining: 0, total: 100 }) });
    const result = await auditFounderCounterLive({
      fetchImpl,
      browserOrigin: ORIGIN,
      endpoint: SUBSCRIBER_GROWTH_FOUNDER_COUNTER_URL,
    });

    expect(result).toEqual({
      kind: "public_founder_counter_live_check",
      attempted: true,
      ok: true,
      optionsStatus: 200,
      postStatus: 200,
      corsVerified: true,
      payloadVerified: true,
      remaining: 0,
      total: 100,
      error: null,
      errors: [],
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      SUBSCRIBER_GROWTH_FOUNDER_COUNTER_URL,
      expect.objectContaining({
        method: "OPTIONS",
        headers: expect.objectContaining({
          Origin: ORIGIN,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization, x-client-info, apikey, content-type",
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      SUBSCRIBER_GROWTH_FOUNDER_COUNTER_URL,
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
  });

  it.each([
    {
      name: "404 deployment gap",
      options: founderOptions({}, 404),
      post: founderPost("not found", 404, {}),
      reason: "options_status_404",
    },
    {
      name: "503 runtime failure",
      options: founderOptions(),
      post: founderPost({ error: "slots_unavailable" }, 503),
      reason: "post_status_503",
    },
    {
      name: "missing CORS",
      options: founderOptions({}, 200),
      post: founderPost({ remaining: 42, total: 100 }, 200, {
        "content-type": "application/json",
      }),
      reason: "options_origin_not_allowed",
    },
    {
      name: "HTML response",
      options: founderOptions(),
      post: founderPost("<html>not json</html>", 200, {
        "access-control-allow-origin": ORIGIN,
        "content-type": "text/html",
      }),
      reason: "post_content_type_not_json",
    },
    {
      name: "misleading JSON-like content type",
      options: founderOptions(),
      post: founderPost('{"remaining":42,"total":100}', 200, {
        "access-control-allow-origin": ORIGIN,
        "content-type": "application/jsonp",
      }),
      reason: "post_content_type_not_json",
    },
    {
      name: "missing field",
      options: founderOptions(),
      post: founderPost({ remaining: 42 }),
      reason: "post_payload_shape_invalid",
    },
    {
      name: "extra sensitive-shaped field",
      options: founderOptions(),
      post: founderPost({ remaining: 42, total: 100, user_id: "must-not-leak" }),
      reason: "post_payload_shape_invalid",
    },
    {
      name: "fractional remaining",
      options: founderOptions(),
      post: founderPost({ remaining: 1.5, total: 100 }),
      reason: "post_payload_values_invalid",
    },
    {
      name: "null remaining",
      options: founderOptions(),
      post: founderPost({ remaining: null, total: 100 }),
      reason: "post_payload_values_invalid",
    },
    {
      name: "negative remaining",
      options: founderOptions(),
      post: founderPost({ remaining: -1, total: 100 }),
      reason: "post_payload_values_invalid",
    },
    {
      name: "over-cap remaining",
      options: founderOptions(),
      post: founderPost({ remaining: 101, total: 100 }),
      reason: "post_payload_values_invalid",
    },
    {
      name: "wrong total",
      options: founderOptions(),
      post: founderPost({ remaining: 42, total: 100 }),
      reason: "post_payload_values_invalid",
    },
  ])("fails closed for a $name", async ({ options, post, reason }) => {
    const result = await auditFounderCounterLive({
      fetchImpl: buildFounderFetch({ options, post }),
      browserOrigin: ORIGIN,
    });

    expect(result.ok).toBe(false);
    expect(result.remaining).toBeNull();
    expect(result.total).toBeNull();
    expect(result.errors).toContain(reason);
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  it("makes the aggregate live audit fail when the Founder endpoint is absent", async () => {
    const publicFetch = buildFetch();
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (String(input) === SUBSCRIBER_GROWTH_FOUNDER_COUNTER_URL) {
        return init?.method === "OPTIONS"
          ? founderOptions({}, 404)
          : founderPost("not found", 404, {});
      }
      return publicFetch(input);
    });

    const result = await auditSubscriberGrowthLiveParity({
      origin: ORIGIN,
      fetchImpl,
      verifyFounderCounter: true,
    });

    expect(result.routesPassed).toBe(4);
    expect(result.capabilitiesPassed).toBe(5);
    expect(result.founderCounter).toMatchObject({ ok: false, optionsStatus: 404, postStatus: 404 });
    expect(result.ok).toBe(false);
    expect(formatSubscriberGrowthLiveParity(result)).toContain("FAIL founder counter");
  });

  it("accepts a marker-bearing entry asset when Vite emits multiple index chunks", async () => {
    const entryWithSharedChunk = Object.keys(ASSETS)
      .map((path) => `"${path.slice(1)}"`)
      .concat('"assets/index-shared.js"', "grower_invite utm_campaign")
      .join(",");
    const fetchImpl = buildFetch({
      [MAIN_PATH]: response(entryWithSharedChunk),
      "/assets/index-shared.js": response("shared runtime without referral attribution"),
    });
    const result = await auditSubscriberGrowthLiveParity({ origin: ORIGIN, fetchImpl });

    expect(result.ok).toBe(true);
    expect(result.capabilities.find((item) => item.id === "referral-attribution")?.path).toBe(
      MAIN_PATH,
    );
  });

  it("fails closed instead of treating a cross-origin entry module as a same-origin asset", async () => {
    const fetchImpl = buildFetch({
      "/": response(`<script type="module" src="https://cdn.example${MAIN_PATH}"></script>`, 200, {
        "x-vercel-id": "iad1::deploy-test",
      }),
    });
    const result = await auditSubscriberGrowthLiveParity({ origin: ORIGIN, fetchImpl });

    expect(result.ok).toBe(false);
    expect(result.moduleError).toBe("module_origin_mismatch");
    expect(result.capabilities.find((item) => item.id === "referral-attribution")).toMatchObject({
      ok: false,
      path: null,
      error: "asset_not_found",
    });
  });

  it("fails closed when a route, asset, or required marker is missing", async () => {
    const fetchImpl = buildFetch({
      "/pricing": response("missing", 503),
      "/assets/Pricing-release.js": response("pricing_checkout_blocked"),
    });
    const result = await auditSubscriberGrowthLiveParity({ origin: ORIGIN, fetchImpl });

    expect(result.ok).toBe(false);
    expect(result.routesPassed).toBe(3);
    expect(result.capabilitiesPassed).toBe(4);
    expect(
      result.capabilities.find((item) => item.id === "checkout-recovery")?.missingMarkers,
    ).toEqual(["data-checkout-state"]);
    const output = formatSubscriberGrowthLiveParity(result);
    expect(output).toContain("FAIL route /pricing: 503");
    expect(output).toContain("FAIL capability checkout-recovery: missing data-checkout-state");
  });

  it("never accepts arbitrary same-origin assets as a required growth capability", async () => {
    const fetchImpl = buildFetch({
      [MAIN_PATH]: response('"assets/Attacker-release.js"'),
    });
    const result = await auditSubscriberGrowthLiveParity({ origin: ORIGIN, fetchImpl });

    expect(result.ok).toBe(false);
    expect(result.capabilitiesPassed).toBe(0);
    expect(
      result.capabilities
        .filter((item) => item.id !== "referral-attribution")
        .every((item) => item.error === "asset_not_found"),
    ).toBe(true);
    expect(result.capabilities.find((item) => item.id === "referral-attribution")).toMatchObject({
      ok: false,
      path: MAIN_PATH,
      missingMarkers: ["grower_invite", "utm_campaign"],
    });
  });
});
