/**
 * Codex P2 on #2230 at 9b41b975: the server render must resolve checkout
 * against the REQUEST host, not claim live checkout before hydration. The
 * request host is mocked here; jsdom's window stays on localhost, so a pass
 * proves the server branch reads the request.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

const request = vi.hoisted(() => ({
  url: "https://verdantgrowdiary.com/pricing" as string | null,
  calls: 0,
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => {
    request.calls += 1;
    if (request.url === null) throw new Error("no request in this context");
    return new Request(request.url);
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

const LIVE_TOKEN = "live_fixturetokenpayload00000000";

async function serverBanner(
  url: string | null,
  token = LIVE_TOKEN,
  paused = false,
  installReader = true,
) {
  request.url = url;
  request.calls = 0;
  vi.resetModules();
  vi.stubEnv("VITE_PAYMENTS_CLIENT_TOKEN", token);
  if (paused) vi.stubEnv("VITE_CHECKOUT_DISABLED", "true");
  const { REQUEST_HOSTNAME_READER_KEY } = await import("@/lib/requestHostname");
  delete (globalThis as Record<symbol, unknown>)[REQUEST_HOSTNAME_READER_KEY];
  // The SSR entry (src/server.ts) installs this reader in production.
  if (installReader) {
    const { installRequestHostnameReader } = await import("@/lib/requestHostname.server");
    installRequestHostnameReader();
  }
  const { PaymentTestModeBanner } = await import("@/components/PaymentTestModeBanner");
  return renderToString(<PaymentTestModeBanner />);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("server render uses the request host", () => {
  it("runs with a non-production window host", () => {
    expect(window.location.hostname).toBe("localhost");
  });

  it.each(["https://verdantgrowdiary.com/pricing", "https://www.verdantgrowdiary.com/pricing"])(
    "renders live (no banner) for a live token requested from %s",
    async (url) => {
      expect(await serverBanner(url)).toBe("");
    },
  );

  it.each([
    "https://preview-123.example.workers.dev/pricing",
    "http://localhost:8080/pricing",
    "https://verdantgrowdiary.com.evil.example/pricing",
  ])("renders the off-host block for a live token requested from %s", async (url) => {
    const html = await serverBanner(url);
    expect(html).toContain('data-payment-env="unavailable"');
    expect(html).toContain("Live checkout is only available on verdantgrowdiary.com.");
  });

  it("falls back to the browser host when there is no request", async () => {
    const html = await serverBanner(null);
    expect(html).toContain("Live checkout is only available on verdantgrowdiary.com.");
  });

  it("falls back to the browser host when the SSR entry installed no reader", async () => {
    const html = await serverBanner(
      "https://verdantgrowdiary.com/pricing",
      LIVE_TOKEN,
      false,
      false,
    );
    expect(request.calls).toBe(0);
    expect(html).toContain("Live checkout is only available on verdantgrowdiary.com.");
  });

  // Codex P2 at d3443169: the request-host lookup must not run when the host
  // cannot change the answer (sandbox or malformed token, or checkout paused).
  // The public browser census uses a test_ build; its batch-1 /auth load
  // aborted while every SSR render called getRequest().
  it("never reads the request for a sandbox token", async () => {
    const html = await serverBanner(
      "http://localhost:5173/auth",
      "test_fixturetokenpayload00000000",
    );
    expect(html).toContain('data-payment-env="sandbox"');
    expect(request.calls).toBe(0);
  });

  it("never reads the request for a malformed token", async () => {
    await serverBanner("http://localhost:5173/auth", "live_short");
    expect(request.calls).toBe(0);
  });

  // Codex P2 at bf3ef609: the paused guard needs its own regression.
  it("never reads the request for a live token while checkout is paused", async () => {
    await serverBanner("https://verdantgrowdiary.com/pricing", LIVE_TOKEN, true);
    expect(request.calls).toBe(0);
  });

  it("reads the request only for a well-formed live token", async () => {
    await serverBanner("https://verdantgrowdiary.com/pricing");
    expect(request.calls).toBeGreaterThan(0);
  });
});
