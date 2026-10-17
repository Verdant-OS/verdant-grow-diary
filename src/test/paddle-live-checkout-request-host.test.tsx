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
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => {
    if (request.url === null) throw new Error("no request in this context");
    return new Request(request.url);
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

const LIVE_TOKEN = "live_fixturetokenpayload00000000";

async function serverBanner(url: string | null) {
  request.url = url;
  vi.resetModules();
  vi.stubEnv("VITE_PAYMENTS_CLIENT_TOKEN", LIVE_TOKEN);
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
});
