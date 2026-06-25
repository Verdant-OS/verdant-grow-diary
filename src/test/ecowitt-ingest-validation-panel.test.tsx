import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EcowittIngestValidationPanel } from "@/components/EcowittIngestValidationPanel";

const NOW = new Date("2026-06-07T12:00:00Z");
const TENT = "11111111-2222-3333-4444-555555555555";

describe("EcowittIngestValidationPanel", () => {
  it("renders the empty-state CLI hints when no evidence exists", () => {
    render(
      <EcowittIngestValidationPanel
        input={{ rows: [], tentId: TENT, now: NOW }}
      />,
    );
    expect(screen.getByTestId("validation-status-badge").textContent).toBe(
      "Not validated yet",
    );
    expect(screen.getByTestId("validation-cli-hints").textContent).toMatch(
      /bun run dev:send-ecowitt/,
    );
    expect(screen.getByTestId("validation-cli-hints").textContent).toMatch(
      /bun run dev:send-ecowitt:invalid/,
    );
  });

  it("renders accepted state with metric chips and a Local test sender badge", () => {
    render(
      <EcowittIngestValidationPanel
        input={{
          tentId: TENT,
          now: NOW,
          rows: [
            {
              id: "r1",
              source: "ecowitt",
              captured_at: "2026-06-07T11:58:00Z",
              ts: "2026-06-07T11:58:00Z",
              metric: "temp_f",
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
                metadata: {
                  transport: "mqtt_local_test",
                  test_sender: true,
                  invalid_test: false,
                },
              },
            },
          ],
        }}
      />,
    );
    expect(screen.getByTestId("validation-status-badge").textContent).toBe(
      "Accepted by ingest webhook",
    );
    expect(screen.getByTestId("test-sender-badge").textContent).toBe(
      "Local test sender",
    );
    for (const key of [
      "temp_f",
      "humidity_pct",
      "vpd_kpa",
      "co2_ppm",
      "soil_moisture_pct",
    ]) {
      expect(
        screen.getByTestId(`metric-chip-${key}`).getAttribute("data-present"),
      ).toBe("true");
    }
  });

  it("renders an Invalid test badge for invalid_test rows", () => {
    render(
      <EcowittIngestValidationPanel
        input={{
          tentId: TENT,
          now: NOW,
          rows: [
            {
              id: "r2",
              source: "ecowitt",
              captured_at: "2026-06-07T11:58:00Z",
              ts: "2026-06-07T11:58:00Z",
              raw_payload: {
                transport: "mqtt_local_test",
                test_sender: true,
                invalid_test: true,
                metadata: { test_sender: true, invalid_test: true },
              },
            },
          ],
        }}
      />,
    );
    expect(screen.getByTestId("invalid-test-badge").textContent).toBe(
      "Invalid test",
    );
  });

  it("never renders raw bridge tokens / secrets injected via raw_payload", () => {
    const { container } = render(
      <EcowittIngestValidationPanel
        input={{
          tentId: TENT,
          now: NOW,
          rows: [
            {
              id: "r3",
              source: "ecowitt",
              captured_at: "2026-06-07T11:58:00Z",
              ts: "2026-06-07T11:58:00Z",
              raw_payload: {
                transport: "mqtt_local_test",
                test_sender: true,
                invalid_test: false,
                token: "vbt_supersecrettoken123",
                bridge_token: "vbt_anothersecret",
                authorization: "Bearer eyJabcdefghijklmnopqr",
                metadata: { test_sender: true, invalid_test: false },
              },
            },
          ],
        }}
      />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/vbt_supersecrettoken123/);
    expect(html).not.toMatch(/vbt_anothersecret/);
    expect(html).not.toMatch(/eyJabcdefghijklmnopqr/);
  });
});
