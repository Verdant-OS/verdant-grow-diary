import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const entry = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@tanstack/react-start/server-entry", () => ({ default: entry }));

import server from "@/server";
import { buildSecurityHeaders } from "@/lib/securityHeadersRules";

const BASELINE = buildSecurityHeaders();

function expectBaseline(response: Response) {
  for (const [name, value] of BASELINE) {
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

  it("adds the baseline to a successful SSR response and keeps its status, body and headers", async () => {
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
    expectBaseline(response);
  });

  it("does not overwrite a header the route already set", async () => {
    entry.fetch.mockResolvedValue(
      new Response("", { headers: { "Referrer-Policy": "no-referrer" } }),
    );
    const response = await server.fetch(
      new Request("https://verdantgrowdiary.com/unsubscribe"),
      {},
      {},
    );
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("adds the baseline to the branded 500 when the handler throws", async () => {
    entry.fetch.mockRejectedValue(new Error("render exploded"));
    const response = await server.fetch(new Request("https://verdantgrowdiary.com/x"), {}, {});
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("text/html");
    expectBaseline(response);
  });

  it("adds the baseline to the branded 500 that replaces an h3-swallowed error body", async () => {
    entry.fetch.mockResolvedValue(
      new Response(JSON.stringify({ status: 500, unhandled: true, message: "HTTPError" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    const response = await server.fetch(new Request("https://verdantgrowdiary.com/y"), {}, {});
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("text/html");
    expectBaseline(response);
  });

  it("adds the baseline to non-HTML server-function responses", async () => {
    entry.fetch.mockResolvedValue(
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    );
    const response = await server.fetch(
      new Request("https://verdantgrowdiary.com/_serverFn/x"),
      {},
      {},
    );
    expectBaseline(response);
  });
});
