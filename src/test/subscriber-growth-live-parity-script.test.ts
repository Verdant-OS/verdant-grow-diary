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
  "/assets/paidAcquisitionAttributionRules-release.js": "grower_invite utm_campaign",
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
    expect(formatSubscriberGrowthLiveParity(result)).toContain(
      "Subscriber growth live parity: PASS",
    );
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
    expect(result.capabilities.every((item) => item.error === "asset_not_found")).toBe(true);
  });
});
