import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EcowittIngestValidationPanel } from "@/components/EcowittIngestValidationPanel";

const NOW = new Date("2026-06-07T12:00:00Z");
const TENT = "11111111-2222-3333-4444-555555555555";

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "r-valid",
    source: "ecowitt",
    captured_at: "2026-06-07T11:58:00Z",
    ts: "2026-06-07T11:58:00Z",
    raw_payload: {
      transport: "mqtt_local_test",
      test_sender: true,
      invalid_test: false,
      metrics: {
        temp_f: 78.6,
        humidity_pct: 56.2,
        vpd_kpa: 1.46,
        co2_ppm: 966,
        soil_moisture_pct: 45,
      },
      metadata: { test_sender: true, invalid_test: false },
    },
    ...overrides,
  };
}

describe("EcowittIngestValidationPanel — operator polish", () => {
  let writeText: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it("renders both copy buttons with the exact commands", () => {
    render(
      <EcowittIngestValidationPanel
        input={{ rows: [], tentId: TENT, now: NOW }}
      />,
    );
    expect(
      screen.getByTestId("copy-accepted-command-button").textContent,
    ).toMatch(/Copy accepted test command/);
    expect(
      screen.getByTestId("copy-invalid-command-button").textContent,
    ).toMatch(/Copy invalid test command/);
    const hints = screen.getByTestId("validation-cli-hints").textContent ?? "";
    expect(hints).toContain("bun run dev:send-ecowitt");
    expect(hints).toContain("bun run dev:send-ecowitt:invalid");
  });

  it("copies the accepted command to clipboard", async () => {
    render(
      <EcowittIngestValidationPanel
        input={{ rows: [], tentId: TENT, now: NOW }}
      />,
    );
    fireEvent.click(screen.getByTestId("copy-accepted-command-button"));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("bun run dev:send-ecowitt");
    });
    await waitFor(() => {
      expect(
        screen.getByTestId("copy-accepted-command-button").textContent,
      ).toBe("Copied");
    });
  });

  it("copies the invalid command to clipboard", async () => {
    render(
      <EcowittIngestValidationPanel
        input={{ rows: [], tentId: TENT, now: NOW }}
      />,
    );
    fireEvent.click(screen.getByTestId("copy-invalid-command-button"));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "bun run dev:send-ecowitt:invalid",
      );
    });
  });

  it("calls onRefresh exactly once when Refresh is clicked", () => {
    const onRefresh = vi.fn();
    render(
      <EcowittIngestValidationPanel
        input={{ rows: [], tentId: TENT, now: NOW }}
        onRefresh={onRefresh}
      />,
    );
    fireEvent.click(screen.getByTestId("refresh-validation-button"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("renders all five metric validation rows for the latest payload", () => {
    render(
      <EcowittIngestValidationPanel
        input={{ rows: [validRow()], tentId: TENT, now: NOW }}
      />,
    );
    for (const k of [
      "temp_f",
      "humidity_pct",
      "vpd_kpa",
      "co2_ppm",
      "soil_moisture_pct",
    ]) {
      expect(screen.getByTestId(`metric-row-${k}`)).toBeTruthy();
      expect(screen.getByTestId(`metric-status-${k}`).textContent).toBe(
        "accepted",
      );
    }
  });

  it("renders missing metric safely as missing", () => {
    const row = validRow({
      raw_payload: {
        transport: "mqtt_local_test",
        test_sender: true,
        invalid_test: false,
        metrics: { temp_f: 78.6, humidity_pct: 56.2 },
        metadata: { test_sender: true, invalid_test: false },
      },
    });
    render(
      <EcowittIngestValidationPanel
        input={{ rows: [row], tentId: TENT, now: NOW }}
      />,
    );
    expect(screen.getByTestId("metric-status-co2_ppm").textContent).toBe(
      "missing",
    );
    expect(
      screen.getByTestId("metric-reason-co2_ppm").textContent,
    ).toMatch(/Not included/);
  });

  it("renders an out-of-range metric as rejected with reason", () => {
    const row = validRow({
      raw_payload: {
        transport: "mqtt_local_test",
        test_sender: true,
        invalid_test: true,
        metrics: {
          temp_f: 7431,
          humidity_pct: 56.2,
          vpd_kpa: 999999,
        },
        metadata: { test_sender: true, invalid_test: true },
      },
    });
    render(
      <EcowittIngestValidationPanel
        input={{ rows: [row], tentId: TENT, now: NOW }}
      />,
    );
    expect(screen.getByTestId("metric-status-temp_f").textContent).toBe(
      "rejected",
    );
    expect(screen.getByTestId("metric-reason-temp_f").textContent).toMatch(
      /Outside accepted range/,
    );
    expect(screen.getByTestId("metric-status-vpd_kpa").textContent).toBe(
      "rejected",
    );
  });

  it("renders timeline newest-first and caps at 10", () => {
    const rows = Array.from({ length: 14 }, (_, i) =>
      validRow({
        id: `r-${i}`,
        captured_at: new Date(
          NOW.getTime() - (i + 1) * 60_000,
        ).toISOString(),
        ts: new Date(NOW.getTime() - (i + 1) * 60_000).toISOString(),
      }),
    );
    render(
      <EcowittIngestValidationPanel
        input={{ rows, tentId: TENT, now: NOW }}
      />,
    );
    const timeline = screen.getByTestId("validation-timeline");
    const items = timeline.querySelectorAll(
      "[data-testid^='timeline-entry-']",
    );
    expect(items.length).toBe(10);
    const firstTs = items[0].getAttribute("data-testid") ?? "";
    const secondTs = items[1].getAttribute("data-testid") ?? "";
    // Newest captured_at (= NOW - 60s) must be first.
    expect(firstTs).toContain(
      new Date(NOW.getTime() - 60_000).toISOString(),
    );
    expect(secondTs).toContain(
      new Date(NOW.getTime() - 120_000).toISOString(),
    );
  });

  it("distinguishes accepted vs rejected (invalid) attempts in the timeline", () => {
    const accepted = validRow({
      id: "r-ok",
      captured_at: "2026-06-07T11:59:00Z",
      ts: "2026-06-07T11:59:00Z",
    });
    const invalid = validRow({
      id: "r-bad",
      captured_at: "2026-06-07T11:58:00Z",
      ts: "2026-06-07T11:58:00Z",
      raw_payload: {
        transport: "mqtt_local_test",
        test_sender: true,
        invalid_test: true,
        metadata: { test_sender: true, invalid_test: true },
      },
    });
    render(
      <EcowittIngestValidationPanel
        input={{ rows: [invalid, accepted], tentId: TENT, now: NOW }}
      />,
    );
    const items = screen
      .getByTestId("validation-timeline")
      .querySelectorAll("[data-testid^='timeline-entry-']");
    expect(items[0].getAttribute("data-status")).toBe("accepted");
    expect(items[1].getAttribute("data-status")).toBe("rejected_test");
    expect(items[1].getAttribute("data-invalid")).toBe("true");
  });

  it("never renders secret-like payload keys (extended fence)", () => {
    const row = validRow({
      raw_payload: {
        transport: "mqtt_local_test",
        test_sender: true,
        invalid_test: false,
        token: "vbt_supersecret_polish",
        bridge_token: "vbt_anotherone",
        authorization: "Bearer eyJpolishtoken",
        metrics: { temp_f: 78.6 },
        metadata: { test_sender: true, invalid_test: false },
      },
    });
    const { container } = render(
      <EcowittIngestValidationPanel
        input={{ rows: [row], tentId: TENT, now: NOW }}
      />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/vbt_supersecret_polish/);
    expect(html).not.toMatch(/vbt_anotherone/);
    expect(html).not.toMatch(/eyJpolishtoken/);
  });

  it("never displays a Live label and never mentions device control / action queue", () => {
    const { container } = render(
      <EcowittIngestValidationPanel
        input={{ rows: [validRow()], tentId: TENT, now: NOW }}
      />,
    );
    const html = container.innerHTML;
    // Body copy may contain "not live sensor telemetry"; what we forbid is a
    // standalone "Live" badge/label being rendered as healthy.
    expect(html).not.toMatch(/>Live</);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/action queue/);
    expect(text).not.toMatch(/device control|relay|valve|actuator/);
  });
});
