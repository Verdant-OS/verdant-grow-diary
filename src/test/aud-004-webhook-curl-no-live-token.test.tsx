/**
 * AUD-004 regression — the Sensor Webhook settings card MUST NOT render a
 * live session JWT inside the visible cURL example. Reveal-with-token is
 * only possible behind an explicit user click (gated by window.confirm),
 * and even then we never paint the live token into the on-screen <pre>.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const LIVE_JWT = "eyJhbGciOiJIUzI1NiJ9.live-session-token-do-not-leak.sig";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "eyJhbGciOiJIUzI1NiJ9.live-session-token-do-not-leak.sig" } },
      }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import TentSensorWebhookSettingsCard from "@/components/TentSensorWebhookSettingsCard";

describe("AUD-004 — TentSensorWebhookSettingsCard does not expose live JWT", () => {
  beforeEach(() => {
    cleanup();
    import.meta.env.VITE_SUPABASE_URL = "https://abc.supabase.co";
  });

  it("renders a safe placeholder in the visible cURL block even when signed in", async () => {
    render(<TentSensorWebhookSettingsCard tentId="tent-uuid-1" />);
    // Wait a tick for the async getSession resolution.
    await new Promise((r) => setTimeout(r, 0));

    const curl = await screen.findByTestId("tent-sensor-webhook-curl");
    expect(curl.textContent ?? "").toContain("<YOUR_SESSION_TOKEN>");
    expect(curl.textContent ?? "").not.toContain(LIVE_JWT);
  });

  it("still renders a usable cURL example (endpoint + tent_id + source)", async () => {
    render(<TentSensorWebhookSettingsCard tentId="tent-uuid-1" />);
    await new Promise((r) => setTimeout(r, 0));

    const curl = await screen.findByTestId("tent-sensor-webhook-curl");
    const text = curl.textContent ?? "";
    expect(text).toContain("curl -X POST");
    expect(text).toContain("/functions/v1/sensor-ingest-webhook");
    expect(text).toContain("tent-uuid-1");
    expect(text).toContain("webhook_generic");
    expect(text).toContain("Authorization: Bearer <YOUR_SESSION_TOKEN>");
  });

  it("shows bridge-token guidance for long-running clients", async () => {
    render(<TentSensorWebhookSettingsCard tentId="tent-uuid-1" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText(/bridge token/i)).toBeInTheDocument();
  });

  it("exposes the reveal-with-token action only as an explicit, gated control", async () => {
    render(<TentSensorWebhookSettingsCard tentId="tent-uuid-1" />);
    await new Promise((r) => setTimeout(r, 0));
    const btn = screen.getByTestId("tent-sensor-webhook-copy-curl-with-token");
    expect(btn).toBeInTheDocument();
    // The visible label warns the user it is one-time, do-not-share.
    expect(btn.textContent ?? "").toMatch(/do not share/i);
    // The default "Copy example" copies the placeholder snippet only.
    const safeCopy = screen.getByTestId("tent-sensor-webhook-copy-curl");
    expect(safeCopy.textContent ?? "").toMatch(/copy example/i);
  });
});
