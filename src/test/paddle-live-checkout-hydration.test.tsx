/**
 * Copilot finding on #2230: with a committed live token, the server has no
 * hostname, so the old host-checked render resolved "unavailable" on the
 * server and "live" in the production browser, a hydration mismatch.
 *
 * Rendered checkout state now comes from the token alone until hydration
 * (live token → "live"), then from the real host check. This file runs on
 * jsdom's default localhost, a NON-production host: the server markup must not
 * depend on the host, hydration must not report a mismatch, and only after
 * hydration may the off-host block appear.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

async function loadBannerWithToken(token: string) {
  vi.resetModules();
  vi.stubEnv("VITE_PAYMENTS_CLIENT_TOKEN", token);
  return import("@/components/PaymentTestModeBanner");
}

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
  vi.unstubAllEnvs();
});

describe("live checkout presentation is hydration-stable on a non-production host", () => {
  it("runs on a non-production host", () => {
    expect(window.location.hostname).toBe("localhost");
  });

  it("server-renders no banner for a live token, regardless of host", async () => {
    const { PaymentTestModeBanner } = await loadBannerWithToken("live_fixturetokenpayload00000000");
    expect(renderToString(<PaymentTestModeBanner />)).toBe("");
  });

  it("hydrates the server markup without a mismatch, then shows the off-host block", async () => {
    const { PaymentTestModeBanner } = await loadBannerWithToken("live_fixturetokenpayload00000000");
    container.innerHTML = renderToString(<PaymentTestModeBanner />);
    const recoverable = vi.fn();

    await act(async () => {
      hydrateRoot(container, <PaymentTestModeBanner />, { onRecoverableError: recoverable });
    });

    expect(recoverable).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Live checkout is only available on verdantgrowdiary.com.",
    );
  });

  it("keeps a test token's sandbox banner identical on the server and after hydration", async () => {
    const { PaymentTestModeBanner } = await loadBannerWithToken("test_fixture_token_payload");
    const html = renderToString(<PaymentTestModeBanner />);
    expect(html).toContain('data-payment-env="sandbox"');
    container.innerHTML = html;
    const recoverable = vi.fn();

    await act(async () => {
      hydrateRoot(container, <PaymentTestModeBanner />, { onRecoverableError: recoverable });
    });

    expect(recoverable).not.toHaveBeenCalled();
    expect(container.querySelector('[data-payment-env="sandbox"]')).not.toBeNull();
  });
});
