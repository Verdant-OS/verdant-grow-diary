/**
 * Mobile/grouped UX for Manual Sensor Reading.
 *
 * Locks the grouped section structure (Air / Root zone), the manual-snapshot
 * helper copy, and the out-of-scope hint pointing pH/EC/PPFD users to Quick
 * Log. No schema change; pH/EC/PPFD are NOT real fields because the
 * sensor_readings trigger does not accept those metrics.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ManualSensorReadingCard
        tents={[{ id: "11111111-1111-1111-1111-111111111111", name: "Tent A" }]}
      />
    </QueryClientProvider>,
  );
}

describe("ManualSensorReadingCard — grouped mobile layout", () => {
  it("renders an Air section with temp, humidity, CO2, VPD", () => {
    renderCard();
    const air = screen.getByTestId("manual-reading-section-air");
    expect(within(air).getByLabelText(/Air temp/i)).toBeTruthy();
    expect(within(air).getByLabelText(/Humidity/i)).toBeTruthy();
    expect(within(air).getByLabelText(/CO₂/i)).toBeTruthy();
    expect(within(air).getByLabelText(/VPD/i)).toBeTruthy();
  });

  it("renders a Root zone section with soil water", () => {
    renderCard();
    const root = screen.getByTestId("manual-reading-section-root");
    expect(within(root).getByLabelText(/Soil water/i)).toBeTruthy();
  });

  it("helper copy says manual snapshot, not live data", () => {
    renderCard();
    const helper = screen.getByTestId("manual-reading-helper");
    expect(helper.textContent ?? "").toMatch(/manual snapshot/i);
    expect(helper.textContent ?? "").toMatch(/not live sensor data/i);
  });

  it("points pH/EC users to Quick Log (out of schema scope)", () => {
    renderCard();
    const hint = screen.getByTestId("manual-reading-out-of-scope-hint");
    const text = hint.textContent ?? "";
    expect(text).toMatch(/pH/);
    expect(text).toMatch(/EC/);
    expect(text.toLowerCase()).toMatch(/quick log/);
  });

  it("number inputs use numeric/decimal keyboards on mobile", () => {
    renderCard();
    const air = screen.getByTestId("manual-reading-section-air");
    const inputs = within(air).getAllByRole("spinbutton");
    expect(inputs.length).toBeGreaterThanOrEqual(3);
    for (const i of inputs) {
      expect(i.getAttribute("inputmode")).toBe("decimal");
    }
  });
});

describe("static safety: manual sensor card", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/components/ManualSensorReadingCard.tsx"),
    "utf8",
  );
  const forbidden = [
    "service_role",
    "mqtt",
    "home_assistant",
    "homeassistant",
    "pi_bridge",
    "actuator",
    "device_command",
    "autopilot",
    "Leads",
    "writeWateringTypedEvent",
    "action_queue",
    "switchbot.com",
    "api.switch-bot",
  ];
  for (const term of forbidden) {
    it(`does not reference \`${term}\``, () => {
      expect(src).not.toContain(term);
    });
  }
  it("does not introduce unsupported schema fields as form metrics", () => {
    // These metrics are NOT in the validate_sensor_reading trigger allowlist.
    // They must not appear as ManualEntryInput keys here.
    expect(src).not.toMatch(/phPh\b|ecMsCm|ppfd:|dliMolM2|waterTempC|soilTempC|soilEc/);
  });
});
