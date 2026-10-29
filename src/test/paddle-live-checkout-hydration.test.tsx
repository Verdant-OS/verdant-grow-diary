/**
 * Copilot finding on #2230: with a committed live token, the server has no
 * hostname, so the old host-checked render resolved "unavailable" on the
 * server and "live" in the production browser, a hydration mismatch.
 *
 * Rendered checkout state is host-aware on both sides: the server resolves
 * against the request host and the browser against window.location.hostname
 * (Codex P2 at 9b41b975: server HTML must not claim live checkout off-host).
 * This file runs on jsdom's default localhost, a NON-production host: the
 * server markup already shows the off-host block, and hydration must not
 * report a mismatch.
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

  it("server-renders the off-host block for a live token on a non-production host", async () => {
    const { PaymentTestModeBanner } = await loadBannerWithToken("live_fixturetokenpayload00000000");
    const html = renderToString(<PaymentTestModeBanner />);
    expect(html).toContain('data-payment-env="unavailable"');
    expect(html).toContain("Live checkout is only available on verdantgrowdiary.com.");
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
    const { PaymentTestModeBanner } = await loadBannerWithToken("test_fixturetokenpayload00000000");
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
