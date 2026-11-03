import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const entry = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@tanstack/react-start/server-entry", () => ({ default: entry }));

import { ServiceUnavailablePage } from "@/lib/serviceUnavailablePage";
import server from "@/server";

describe("cultivar reference 503 page", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    entry.fetch.mockReset();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("replaces an empty 503 redirect with a retryable page and no-store", async () => {
    entry.fetch.mockResolvedValue(
      new Response(null, {
        status: 503,
        headers: {
          location: "/cultivars/not-a-real-cultivar",
          "cache-control": "no-store",
          "retry-after": "30",
        },
      }),
    );
    const response = await server.fetch(
      new Request("https://verdantgrowdiary.com/cultivars/not-a-real-cultivar"),
      {},
      {},
    );
    const html = await response.text();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("The cultivar reference could not be loaded");
    expect(html).toContain("Try again");
    expect(html).not.toContain('property="og:url"');
    expect(html).not.toContain('rel="canonical"');
    expect(ServiceUnavailablePage.present(new Response("ok", { status: 200 })).status).toBe(200);
  });
});
