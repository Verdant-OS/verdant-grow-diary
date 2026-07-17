import { describe, expect, it, vi } from "vitest";

import {
  auditSubscriberGrowthLiveParity,
  extractJavaScriptAssetPaths,
  extractModuleScriptPath,
  formatSubscriberGrowthLiveParity,
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
