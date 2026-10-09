import { describe, expect, it } from "vitest";

import { hostHeadersForPathname, withHostHeaders } from "@/lib/cloudflareHostRoutingRules";
import server from "@/server";

describe("withHostHeaders on a 404", () => {
  it("keeps the 404 status and applies each security header once", async () => {
    const wrapped = withHostHeaders(
      new Request("https://verdantgrowdiary.com/this-route-does-not-exist"),
      new Response("<html>missing</html>", {
        status: 404,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

    expect(wrapped.status).toBe(404);
    expect(await wrapped.text()).toBe("<html>missing</html>");
    expect(wrapped.headers.get("content-type")).toBe("text/html; charset=utf-8");
    for (const [name, value] of hostHeadersForPathname("/this-route-does-not-exist")) {
      expect(wrapped.headers.get(name)).toBe(value);
    }

    const seen = new Map<string, number>();
    wrapped.headers.forEach((_value, name) => {
      const key = name.toLowerCase();
      seen.set(key, (seen.get(key) ?? 0) + 1);
    });
    for (const count of seen.values()) expect(count).toBe(1);
    expect(wrapped.headers.get("content-security-policy")).toBeNull();
    expect(wrapped.headers.get("content-security-policy-report-only")).toBeTruthy();
  });

  it("serves /healthz as 200 before SSR, with no-store and noindex", async () => {
    const response = await server.fetch(
      new Request("https://verdantgrowdiary.com/healthz/"),
      {},
      {},
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"ok":true}');
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    for (const [name, value] of hostHeadersForPathname("/healthz")) {
      expect(response.headers.get(name)).toBe(value);
    }
    const seen = new Map<string, number>();
    response.headers.forEach((_value, name) => {
      seen.set(name.toLowerCase(), (seen.get(name.toLowerCase()) ?? 0) + 1);
    });
    for (const count of seen.values()) expect(count).toBe(1);
  });
});
