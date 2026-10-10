/**
 * Manual VPD unit toggle.
 *
 * hPa and mbar convert to canonical kPa before save (1 kPa = 10 hPa = 10 mbar).
 * Range checks run on the converted kPa value, and the rejection message stays
 * in the unit the grower selected. Default unit is kPa. The choice is not
 * stored in localStorage.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";
import { applyManualVpdRangeGate } from "@/lib/manualSensorVpdUnitRules";
import { validateManualEntry } from "@/lib/sensorReadingManualEntryRules";

const TENT = "11111111-1111-4111-8111-111111111111";
const insertedRows: unknown[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: async (row: unknown) => {
        insertedRows.push(row);
        return { error: null };
      },
    }),
  },
}));

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ManualSensorReadingCard tents={[{ id: TENT, name: "Tent A" }]} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function vpdInput() {
  return screen.getByLabelText(/^VPD/i) as HTMLInputElement;
}

async function confirmSave() {
  fireEvent.click(screen.getByTestId("manual-reading-save"));
  fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
  for (let i = 0; i < 25 && insertedRows.length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function savedVpd(): number | undefined {
  const flattened = insertedRows.flatMap((row) => (Array.isArray(row) ? row : [row]));
  const match = flattened.find((row) => (row as { metric?: string }).metric === "vpd_kpa") as
    { value?: number } | undefined;
  return match?.value;
}

describe("ManualSensorReadingCard VPD units", () => {
  it("defaults to kPa and saves that number unchanged", async () => {
    insertedRows.length = 0;
    renderCard();
    expect(
      screen.getByTestId("manual-reading-vpd-unit-toggle").getAttribute("data-active-unit"),
    ).toBe("kPa");
    fireEvent.change(vpdInput(), { target: { value: "1.2" } });
    await confirmSave();
    expect(savedVpd()).toBe(1.2);
  });

  it("saves an hPa entry as canonical kPa", async () => {
    insertedRows.length = 0;
    renderCard();
    fireEvent.click(screen.getByTestId("manual-reading-vpd-unit-hPa"));
    fireEvent.change(vpdInput(), { target: { value: "15" } });
    await confirmSave();
    expect(savedVpd()).toBe(1.5);
  });

  it("saves an mbar entry as canonical kPa", async () => {
    insertedRows.length = 0;
    renderCard();
    fireEvent.click(screen.getByTestId("manual-reading-vpd-unit-mbar"));
    fireEvent.change(vpdInput(), { target: { value: "15" } });
    await confirmSave();
    expect(savedVpd()).toBe(1.5);
  });

  it("rejects an hPa value that is outside the range after conversion to kPa", () => {
    renderCard();
    fireEvent.click(screen.getByTestId("manual-reading-vpd-unit-hPa"));
    fireEvent.change(vpdInput(), { target: { value: "1" } });
    const save = screen.getByTestId("manual-reading-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByTestId("manual-reading-errors").textContent ?? "").toMatch(
      /VPD 1 hPa is outside the accepted range \(2–25 hPa\)/,
    );
  });

  it("rejects an mbar value that is outside the range after conversion to kPa", () => {
    renderCard();
    fireEvent.click(screen.getByTestId("manual-reading-vpd-unit-mbar"));
    fireEvent.change(vpdInput(), { target: { value: "30" } });
    const save = screen.getByTestId("manual-reading-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByTestId("manual-reading-errors").textContent ?? "").toMatch(
      /VPD 30 mbar is outside the accepted range \(2–25 mbar\)/,
    );
  });
});

describe("applyManualVpdRangeGate", () => {
  it("strips an out-of-range converted VPD so it cannot be inserted", () => {
    const gated = applyManualVpdRangeGate(validateManualEntry({ vpdKpa: "0.1" }), "1", "hPa");
    expect(gated.ok).toBe(false);
    expect(gated.metrics.find((metric) => metric.metric === "vpd_kpa")).toBeUndefined();
    expect(gated.errors.join(" ")).toMatch(/1 hPa/);
  });

  it("keeps an in-range converted value on the canonical metric", () => {
    const gated = applyManualVpdRangeGate(validateManualEntry({ vpdKpa: "1.5" }), "15", "mbar");
    expect(gated.ok).toBe(true);
    expect(gated.metrics.find((metric) => metric.metric === "vpd_kpa")?.value).toBe(1.5);
  });
});
