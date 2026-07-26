/**
 * AUD-004 regression — the Sensor Webhook settings card MUST NOT render a
 * live session JWT inside either the visible or copied cURL example.
 * sensor-ingest-webhook accepts only a tent-scoped vbt_ bridge token, so the
 * setup card must not read the browser session or offer a JWT copy path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const LIVE_JWT = "eyJhbGciOiJIUzI1NiJ9.live-session-token-do-not-leak.sig";

const { getSession, onAuthStateChange } = vi.hoisted(() => ({
  getSession: vi.fn().mockResolvedValue({
    data: { session: { access_token: "eyJhbGciOiJIUzI1NiJ9.live-session-token-do-not-leak.sig" } },
  }),
  onAuthStateChange: vi.fn().mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession,
      onAuthStateChange,
    },
  },
}));

// Return a STABLE toast identity. A fresh `{ toast: vi.fn() }` on every render
// changes `toast`'s identity each render, which can spin an unbounded re-render
// loop in any component whose effect depends on a toast-derived callback (this
// OOMed the CI full-suite worker via ecowitt-bridge-status-page). Preventive.
const { toastApi } = vi.hoisted(() => ({ toastApi: { toast: vi.fn() } }));
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => toastApi,
}));

import TentSensorWebhookSettingsCard from "@/components/TentSensorWebhookSettingsCard";

describe("AUD-004 — TentSensorWebhookSettingsCard does not expose live JWT", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    import.meta.env.VITE_SUPABASE_URL = "https://abc.supabase.co";
  });

  it("renders the required bridge-token placeholder without reading the browser session", async () => {
    render(<TentSensorWebhookSettingsCard tentId="tent-uuid-1" />);

    const curl = await screen.findByTestId("tent-sensor-webhook-curl");
    expect(curl.textContent ?? "").toContain("<VBT_BRIDGE_TOKEN>");
    expect(curl.textContent ?? "").not.toContain("<YOUR_SESSION_TOKEN>");
    expect(curl.textContent ?? "").not.toContain(LIVE_JWT);
    expect(getSession).not.toHaveBeenCalled();
    expect(onAuthStateChange).not.toHaveBeenCalled();
  });

  it("still renders a usable cURL example (endpoint + tent_id + source)", async () => {
    render(<TentSensorWebhookSettingsCard tentId="tent-uuid-1" />);

    const curl = await screen.findByTestId("tent-sensor-webhook-curl");
    const text = curl.textContent ?? "";
    expect(text).toContain("curl -X POST");
    expect(text).toContain("/functions/v1/sensor-ingest-webhook");
    expect(text).toContain("tent-uuid-1");
    expect(text).toContain("webhook_generic");
    expect(text).toContain("Authorization: Bearer <VBT_BRIDGE_TOKEN>");
  });

  it("shows bridge-token guidance and states that app-session JWTs are rejected", async () => {
    render(<TentSensorWebhookSettingsCard tentId="tent-uuid-1" />);
    expect(screen.getAllByText(/bridge token/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/app-session JWTs are not accepted/i)).toBeInTheDocument();
  });

  it("gives the icon-only endpoint copy control an accessible name", async () => {
    render(<TentSensorWebhookSettingsCard tentId="tent-uuid-1" />);

    expect(screen.getByRole("button", { name: "Copy sensor webhook URL" })).toBeInTheDocument();
  });

  it("has no session-token copy control and copies only the bridge-token placeholder", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<TentSensorWebhookSettingsCard tentId="tent-uuid-1" />);
    expect(
      screen.queryByTestId("tent-sensor-webhook-copy-curl-with-token"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/copy with my session token/i)).not.toBeInTheDocument();

    const safeCopy = screen.getByTestId("tent-sensor-webhook-copy-curl");
    fireEvent.click(safeCopy);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = String(writeText.mock.calls[0][0]);
    expect(copied).toContain("Bearer <VBT_BRIDGE_TOKEN>");
    expect(copied).not.toContain(LIVE_JWT);
    expect(copied).not.toContain("YOUR_SESSION_TOKEN");
  });
});
