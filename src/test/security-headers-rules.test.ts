import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import vercelConfig from "../../vercel.json";
import {
  FORBIDDEN_ENFORCING_HEADERS,
  STRICT_TRANSPORT_SECURITY_VALUE,
  applySecurityHeaders,
  buildContentSecurityPolicyReportOnly,
  buildRouteSecurityHeaders,
  buildSecurityHeaders,
} from "@/lib/securityHeadersRules";

const VERCEL_RULES = (
  vercelConfig as {
    headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  }
).headers;

const REQUIRED_BASELINE = [
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
  "content-security-policy-report-only",
];

describe("securityHeadersRules — baseline set", () => {
  it("emits every required baseline header exactly once, deterministically", () => {
    const a = buildSecurityHeaders();
    const b = buildSecurityHeaders();
    expect(a).toEqual(b);
    const names = a.map(([n]) => n.toLowerCase());
    expect([...names].sort()).toEqual([...REQUIRED_BASELINE].sort());
    expect(new Set(names).size).toBe(names.length);
  });

  it("never emits an enforcing Content-Security-Policy (report-only fence)", () => {
    const names = buildSecurityHeaders().map(([n]) => n.toLowerCase());
    for (const forbidden of FORBIDDEN_ENFORCING_HEADERS) {
      expect(names).not.toContain(forbidden);
    }
    expect(names).toContain("content-security-policy-report-only");
  });

  it("keeps HSTS identical to the apex's published policy (never weaker)", () => {
    expect(STRICT_TRANSPORT_SECURITY_VALUE).toBe("max-age=63072000; includeSubDomains; preload");
    const published = VERCEL_RULES.find((rule) => rule.source === "/(.*)")?.headers.find(
      (h) => h.key.toLowerCase() === "strict-transport-security",
    )?.value;
    expect(published).toBeDefined();
    expect(STRICT_TRANSPORT_SECURITY_VALUE).toBe(published);
  });

  it("every non-CSP baseline header is identical to vercel.json's /(.*) rule (hosting parity)", () => {
    const published = VERCEL_RULES.find((rule) => rule.source === "/(.*)")?.headers ?? [];
    expect(published.length).toBeGreaterThan(0);
    const ours = new Map(buildSecurityHeaders().map(([k, v]) => [k.toLowerCase(), v] as const));
    for (const { key, value } of published) expect(ours.get(key.toLowerCase()), key).toBe(value);
  });

  it("route headers match the vercel.json /unsubscribe rule exactly", () => {
    const published = VERCEL_RULES.find((rule) => rule.source === "/unsubscribe")?.headers ?? [];
    expect(published.length).toBeGreaterThan(0);
    const ours = new Map(
      buildRouteSecurityHeaders("/unsubscribe").map(([k, v]) => [k.toLowerCase(), v] as const),
    );
    expect(ours.size).toBe(published.length);
    for (const { key, value } of published) expect(ours.get(key.toLowerCase()), key).toBe(value);
    expect(buildRouteSecurityHeaders("/unsubscribe/")).toEqual(
      buildRouteSecurityHeaders("/unsubscribe"),
    );
    expect(buildRouteSecurityHeaders("/")).toEqual([]);
    expect(buildRouteSecurityHeaders(null)).toEqual([]);
  });

  it("report-only CSP covers the origins the client is known to use", () => {
    const csp = buildContentSecurityPolicyReportOnly();
    const directive = (name: string) =>
      csp
        .split(";")
        .map((d) => d.trim())
        .find((d) => d.startsWith(`${name} `)) ?? "";
    expect(directive("default-src")).toBe("default-src 'self'");
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'self'");
    expect(directive("connect-src")).toContain("https://*.supabase.co");
    expect(directive("connect-src")).toContain("wss://*.supabase.co");
    expect(directive("connect-src")).toContain("https://*.paddle.com");
    expect(directive("connect-src")).toContain("https://api.lovable.dev");
    expect(directive("connect-src")).toContain("https://*.ingest.us.sentry.io");
    // Ingest only — never script-src/frame-src for the error reporter.
    expect(directive("script-src")).not.toContain("sentry");
    expect(directive("frame-src")).not.toContain("sentry");
    expect(directive("frame-src")).toContain("https://*.paddle.com");
    expect(directive("script-src")).toContain("https://*.paddle.com");
    expect(directive("style-src")).toContain("https://fonts.googleapis.com");
    expect(directive("font-src")).toContain("https://fonts.gstatic.com");
    // Hydration scripts/styles are inline today; nonces are a follow-up.
    expect(directive("script-src")).toContain("'unsafe-inline'");
    expect(directive("style-src")).toContain("'unsafe-inline'");
    // No directive names a service-role, bridge or Lovable AI gateway host.
    expect(csp).not.toMatch(/ai\.gateway\.lovable\.dev|service_role|bridge/i);
  });
});

describe("securityHeadersRules — applySecurityHeaders", () => {
  it("adds the baseline to a plain HTML response and preserves status/body", async () => {
    const input = new Response("<html></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    const out = applySecurityHeaders(input);
    expect(out).not.toBe(input);
    expect(out.status).toBe(200);
    expect(await out.text()).toBe("<html></html>");
    expect(out.headers.get("content-type")).toBe("text/html; charset=utf-8");
    for (const name of REQUIRED_BASELINE) {
      expect(out.headers.get(name), name).toBeTruthy();
    }
    expect(out.headers.get("content-security-policy")).toBeNull();
  });

  it("never overwrites a header the route already set (case-insensitive)", () => {
    const input = new Response("", {
      headers: {
        "x-frame-options": "DENY",
        "REFERRER-POLICY": "no-referrer",
      },
    });
    const out = applySecurityHeaders(input);
    expect(out.headers.get("x-frame-options")).toBe("DENY");
    expect(out.headers.get("referrer-policy")).toBe("no-referrer");
    expect(out.headers.get("strict-transport-security")).toBe(STRICT_TRANSPORT_SECURITY_VALUE);
  });

  it("is idempotent: applying twice yields the same headers and no new Response", () => {
    const once = applySecurityHeaders(new Response(""));
    const twice = applySecurityHeaders(once);
    expect(twice).toBe(once);
    expect([...twice.headers.entries()]).toEqual([...once.headers.entries()]);
  });

  it("passes null and undefined through unchanged", () => {
    expect(applySecurityHeaders(null)).toBeNull();
    expect(applySecurityHeaders(undefined)).toBeUndefined();
  });

  it("applies to 500 error pages and non-HTML responses too", () => {
    const err = applySecurityHeaders(
      new Response("oops", { status: 500, headers: { "content-type": "text/html" } }),
    );
    expect(err.status).toBe(500);
    expect(err.headers.get("x-content-type-options")).toBe("nosniff");
    const json = applySecurityHeaders(
      new Response("{}", { headers: { "content-type": "application/json" } }),
    );
    expect(json.headers.get("strict-transport-security")).toBe(STRICT_TRANSPORT_SECURITY_VALUE);
  });
});

describe("securityHeadersRules — wiring and static-asset parity", () => {
  const repoRoot = join(__dirname, "..", "..");

  it("src/server.ts applies the headers on both the success and the catch paths", () => {
    const source = readFileSync(join(repoRoot, "src", "server.ts"), "utf8");
    expect(source).toMatch(
      /import \{ applySecurityHeaders \} from "\.\/lib\/securityHeadersRules"/,
    );
    expect(source.match(/applySecurityHeaders\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("public/_headers carries the non-CSP baseline for Assets-served files", () => {
    const text = readFileSync(join(repoRoot, "public", "_headers"), "utf8");
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    expect(lines[0]).toBe("/*");
    const staticHeaders = new Map<string, string>();
    for (const line of lines.slice(1)) {
      const idx = line.indexOf(":");
      expect(idx).toBeGreaterThan(0);
      staticHeaders.set(line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim());
    }
    const expected = new Map(
      buildSecurityHeaders()
        .filter(([n]) => n.toLowerCase() !== "content-security-policy-report-only")
        .map(([n, v]) => [n.toLowerCase(), v] as const),
    );
    expect([...staticHeaders.keys()].sort()).toEqual([...expected.keys()].sort());
    for (const [name, value] of expected) {
      expect(staticHeaders.get(name), name).toBe(value);
    }
    expect(staticHeaders.has("content-security-policy")).toBe(false);
  });
});
