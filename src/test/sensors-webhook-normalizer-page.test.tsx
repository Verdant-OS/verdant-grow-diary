/**
 * UI tests for the SensorsIngestNormalizer debug page.
 *
 * Safety properties enforced here:
 *  - The page never calls fetch, Supabase, functions.invoke, insert,
 *    update, upsert, delete, or rpc.
 *  - Invalid JSON renders a role="alert" message.
 *  - Valid payloads render normalized source/vendor + per-field reasons.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SensorsIngestNormalizer from "@/pages/SensorsIngestNormalizer";

// Spy on Supabase client to ensure the page never invokes any write
// or network path.
const supabaseSpies = vi.hoisted(() => ({
  from: vi.fn(() => ({
    insert: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
  })),
  rpc: vi.fn(),
  functions: { invoke: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseSpies,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <SensorsIngestNormalizer />
    </MemoryRouter>,
  );
}

describe("SensorsIngestNormalizer", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation(() => {
      throw new Error("fetch must not be called by the normalizer screen");
    }) as never;
    supabaseSpies.from.mockClear();
    supabaseSpies.rpc.mockClear();
    supabaseSpies.functions.invoke.mockClear();
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    fetchSpy = null;
  });

  it("renders header and example buttons without network calls", () => {
    renderPage();
    expect(screen.getByTestId("webhook-normalizer-textarea")).toBeInTheDocument();
    expect(screen.getByTestId("webhook-normalizer-example-ecowitt-mqtt")).toBeInTheDocument();
    expect(screen.getByTestId("webhook-normalizer-example-home-assistant-webhook")).toBeInTheDocument();
    expect(screen.getByTestId("webhook-normalizer-example-generic-mqtt")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(supabaseSpies.functions.invoke).not.toHaveBeenCalled();
    expect(supabaseSpies.rpc).not.toHaveBeenCalled();
    expect(supabaseSpies.from).not.toHaveBeenCalled();
  });

  it("loading an example then parsing renders normalized source + vendor", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("webhook-normalizer-example-ecowitt-mqtt"));
    fireEvent.click(screen.getByTestId("webhook-normalizer-parse"));
    expect(screen.getByTestId("webhook-normalizer-result")).toBeInTheDocument();
    expect(screen.getByTestId("webhook-normalizer-source-canonical").textContent).toBe("mqtt");
    expect(screen.getByTestId("webhook-normalizer-vendor-canonical").textContent).toBe("ecowitt");
    // SensorSourceLineageLine renders the polished labels.
    expect(screen.getByTestId("sensor-source-lineage-source").textContent).toBe("MQTT");
    expect(screen.getByTestId("sensor-source-lineage-vendor").textContent).toBe("EcoWitt");
    // Disclaimer must always render with a successful preview.
    expect(screen.getByTestId("webhook-normalizer-disclaimer").textContent?.toLowerCase())
      .toContain("not been ingested");
  });

  it("renders rejected/skipped field reasons", () => {
    renderPage();
    const payload = {
      tent_id: "00000000-0000-4000-8000-000000000001",
      source: "mqtt",
      captured_at: "2026-06-04T12:00:00Z",
      metrics: { temp_c: 999, humidity_pct: 55, made_up_metric: 1 },
    };
    fireEvent.change(screen.getByTestId("webhook-normalizer-textarea"), {
      target: { value: JSON.stringify(payload) },
    });
    fireEvent.click(screen.getByTestId("webhook-normalizer-parse"));
    const rejected = screen.getByTestId("webhook-normalizer-rejected");
    expect(rejected.textContent).toMatch(/temp_c/);
    expect(rejected.textContent?.toLowerCase()).toMatch(/out of range/);
    const skipped = screen.getByTestId("webhook-normalizer-skipped");
    expect(skipped.textContent).toMatch(/made_up_metric/);
    expect(skipped.textContent?.toLowerCase()).toMatch(/unknown metric alias/);
  });

  it("invalid JSON shows a role=alert message", () => {
    renderPage();
    fireEvent.change(screen.getByTestId("webhook-normalizer-textarea"), {
      target: { value: "{ not valid json" },
    });
    fireEvent.click(screen.getByTestId("webhook-normalizer-parse"));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("data-testid", "webhook-normalizer-json-error");
    expect(alert.textContent?.toLowerCase()).toContain("invalid json");
    expect(screen.queryByTestId("webhook-normalizer-result")).toBeNull();
  });

  it("surfaces warnings when user_id is supplied in the payload", () => {
    renderPage();
    const payload = {
      tent_id: "00000000-0000-4000-8000-000000000001",
      source: "mqtt",
      captured_at: "2026-06-04T12:00:00Z",
      metrics: { temp_c: 24 },
      user_id: "evil-uid",
    };
    fireEvent.change(screen.getByTestId("webhook-normalizer-textarea"), {
      target: { value: JSON.stringify(payload) },
    });
    fireEvent.click(screen.getByTestId("webhook-normalizer-parse"));
    const warnings = screen.getByTestId("webhook-normalizer-warnings");
    expect(warnings.textContent?.toLowerCase()).toContain("user_id");
    // Sanitized payload must not contain user_id.
    const sanitized = screen.getByTestId("webhook-normalizer-sanitized").textContent ?? "";
    expect(sanitized).not.toContain("user_id");
  });

  it("Clear resets the textarea and removes results", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("webhook-normalizer-example-generic-mqtt"));
    fireEvent.click(screen.getByTestId("webhook-normalizer-parse"));
    expect(screen.getByTestId("webhook-normalizer-result")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("webhook-normalizer-clear"));
    expect(
      (screen.getByTestId("webhook-normalizer-textarea") as HTMLTextAreaElement).value,
    ).toBe("");
    expect(screen.queryByTestId("webhook-normalizer-result")).toBeNull();
  });

  it("never calls fetch, Supabase, or functions.invoke through the full parse cycle", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("webhook-normalizer-example-home-assistant-webhook"));
    fireEvent.click(screen.getByTestId("webhook-normalizer-parse"));
    fireEvent.click(screen.getByTestId("webhook-normalizer-clear"));
    fireEvent.change(screen.getByTestId("webhook-normalizer-textarea"), {
      target: { value: "{ not valid" },
    });
    fireEvent.click(screen.getByTestId("webhook-normalizer-parse"));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(supabaseSpies.functions.invoke).not.toHaveBeenCalled();
    expect(supabaseSpies.rpc).not.toHaveBeenCalled();
    expect(supabaseSpies.from).not.toHaveBeenCalled();
  });
});
