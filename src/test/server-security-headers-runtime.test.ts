import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const entry = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@tanstack/react-start/server-entry", () => ({ default: entry }));

import { hostHeadersForPathname } from "@/lib/cloudflareHostRoutingRules";
import server from "@/server";

function expectHostHeaders(response: Response, pathname: string) {
  const expected = hostHeadersForPathname(pathname);
  const names = expected.map(([name]) => name.toLowerCase());
  expect(new Set(names).size).toBe(names.length);
  for (const [name, value] of expected) {
    expect(response.headers.get(name), name).toBe(value);
  }
  expect(response.headers.has("content-security-policy")).toBe(false);
}

describe("src/server.ts — security headers on real Worker responses", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    entry.fetch.mockReset();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("adds the host headers to a successful SSR response and keeps its status, body and headers", async () => {
    entry.fetch.mockResolvedValue(
      new Response("<html>ok</html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "x-route": "kept" },
      }),
    );
    const response = await server.fetch(new Request("https://verdantgrowdiary.com/"), {}, {});
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<html>ok</html>");
    expect(response.headers.get("x-route")).toBe("kept");
    expectHostHeaders(response, "/");
  });

  it("replaces a conflicting referrer policy with the host rule and keeps unrelated headers", async () => {
    entry.fetch.mockResolvedValue(
      new Response("", { headers: { "Referrer-Policy": "unsafe-url", "x-route": "kept" } }),
    );
    const response = await server.fetch(new Request("https://verdantgrowdiary.com/"), {}, {});
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("x-route")).toBe("kept");
    expectHostHeaders(response, "/");
  });

  it("gives /unsubscribe its own no-store, no-referrer and noindex headers even when the route sets none", async () => {
    for (const path of ["/unsubscribe?token=secret-token", "/unsubscribe/?token=secret-token"]) {
      entry.fetch.mockResolvedValue(
        new Response("<html>unsubscribe</html>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
      const response = await server.fetch(
        new Request(`https://verdantgrowdiary.com${path}`),
        {},
        {},
      );
      expect(response.headers.get("referrer-policy"), path).toBe("no-referrer");
      expect(response.headers.get("cache-control"), path).toBe("no-store");
      expect(response.headers.get("x-robots-tag"), path).toBe("noindex, nofollow, noarchive");
      expectHostHeaders(response, "/unsubscribe");
    }
  });

  it("does not apply the /unsubscribe headers to other paths", async () => {
    entry.fetch.mockResolvedValue(new Response(""));
    const response = await server.fetch(
      new Request("https://verdantgrowdiary.com/unsubscribe-help"),
      {},
      {},
    );
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.has("x-robots-tag")).toBe(false);
    expectHostHeaders(response, "/unsubscribe-help");
  });

  it("adds the host headers to the branded 500 when the handler throws", async () => {
    entry.fetch.mockRejectedValue(new Error("render exploded"));
    const response = await server.fetch(new Request("https://verdantgrowdiary.com/x"), {}, {});
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("text/html");
    expectHostHeaders(response, "/x");
  });

  it("adds the host headers to the branded 500 that replaces an h3-swallowed error body", async () => {
    entry.fetch.mockResolvedValue(
      new Response(JSON.stringify({ status: 500, unhandled: true, message: "HTTPError" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    const response = await server.fetch(new Request("https://verdantgrowdiary.com/y"), {}, {});
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("text/html");
    expectHostHeaders(response, "/y");
  });

  it("adds the host headers to non-HTML server-function responses", async () => {
    entry.fetch.mockResolvedValue(
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    );
    const response = await server.fetch(
      new Request("https://verdantgrowdiary.com/_serverFn/x"),
      {},
      {},
    );
    expectHostHeaders(response, "/_serverFn/x");
  });

  it("puts the same host headers on a redirect, each once", async () => {
    const response = await server.fetch(
      new Request("https://verdantgrowdiary.com/strains"),
      {},
      {},
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/cultivars");
    expectHostHeaders(response, "/strains");
  });
});
