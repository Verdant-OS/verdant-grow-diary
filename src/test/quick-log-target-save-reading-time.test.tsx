/**
 * Regressions for #2778 target selection, #2779 one write, #2780 reading
 * time, and #2781 one Chicago clock across the November DST change.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import QuickLogEntryIntegrityControls from "@/components/QuickLogEntryIntegrityControls";
import { clearTemperatureUnitPreference } from "@/lib/temperatureUnitPreference";
import { setLocalStorageItemForTest } from "./helpers/localStorageTestHelper";
import { GrowerTimeLabel } from "@/lib/growerTimeLabel";
import { QuickLogReadingTime } from "@/lib/quickLogReadingTime";
import {
  QuickLogLaunchTarget,
  resolveTentScopedQuickLogPlantSelection,
} from "@/lib/quickLogV2Rules";
import type { QuickLogV2TargetOption } from "@/lib/quickLogV2Rules";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
    from: () => ({ insert: vi.fn() }),
  },
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "Grow 1" }] }),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args), error: vi.fn() },
}));

const SOLE: QuickLogV2TargetOption[] = [
  { type: "tent", id: "tent-1", label: "Tent 1", tentId: "tent-1", growId: "grow-1" },
  { type: "plant", id: "plant-1", label: "Plant 1", tentId: "tent-1", growId: "grow-1" },
];

describe("tent open does not resolve to a plant", () => {
  it("returns the tent key when the tent has one plant and a recent plant", () => {
    expect(
      resolveTentScopedQuickLogPlantSelection({
        tentId: "tent-1",
        options: SOLE,
        selectedKey: null,
        recentPlantId: "plant-1",
      }),
    ).toBe("tent:tent-1");
  });

  it("uses the route, then the last-used target, then nothing", () => {
    expect(
      QuickLogLaunchTarget.resolve({
        contextKey: "tent:tent-1",
        lastUsedKey: "plant:plant-1",
      }),
    ).toBe("tent:tent-1");
    expect(QuickLogLaunchTarget.resolve({ contextKey: null, lastUsedKey: "plant:plant-1" })).toBe(
      "plant:plant-1",
    );
    expect(QuickLogLaunchTarget.resolve({ contextKey: null, lastUsedKey: null })).toBeNull();
  });
});

describe("reading time and the Chicago clock", () => {
  const zone = "America/Chicago";

  it("rejects a future reading and one older than seven days", () => {
    const now = Date.parse("2026-11-03T12:00:00.000Z");
    expect(QuickLogReadingTime.resolve("", now, zone).ok).toBe(true);
    const future = QuickLogReadingTime.resolve("2026-11-03T08:00", now, zone);
    expect(future.ok).toBe(false);
    const old = QuickLogReadingTime.resolve("2026-10-01T06:00", now, zone);
    expect(old.ok).toBe(false);
  });

  it("reads Chicago wall time across the November 1 fallback", () => {
    const before = QuickLogReadingTime.resolve(
      "2026-11-01T00:30",
      Date.parse("2026-11-03T12:00:00.000Z"),
      zone,
    );
    const after = QuickLogReadingTime.resolve(
      "2026-11-01T02:30",
      Date.parse("2026-11-03T12:00:00.000Z"),
      zone,
    );
    expect(before).toEqual({ ok: true, iso: "2026-11-01T05:30:00.000Z" });
    expect(after).toEqual({ ok: true, iso: "2026-11-01T08:30:00.000Z" });
    const cdt = GrowerTimeLabel.formatAbsolute("2026-11-01T05:30:00.000Z", {
      timeZone: zone,
      hour: "2-digit",
      includeZone: true,
    });
    const cst = GrowerTimeLabel.formatAbsolute("2026-11-01T08:30:00.000Z", {
      timeZone: zone,
      hour: "2-digit",
      includeZone: true,
    });
    expect(cdt).toContain("CDT");
    expect(cst).toContain("CST");
  });
});

describe("correction temperature unit", () => {
  it("shows Fahrenheit and writes Celsius once", async () => {
    clearTemperatureUnitPreference();
    setLocalStorageItemForTest("verdant:temperatureUnit", "fahrenheit");
    rpcMock.mockResolvedValue({
      data: {
        ok: true,
        revision_id: "r1",
        revision_no: 2,
        grow_event_id: "g1",
        diary_entry_ids: [],
      },
      error: null,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <QuickLogEntryIntegrityControls
          handle={{ growEventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }}
          currentNote="kept"
          correctionValues={{
            kind: "sensor",
            sensor: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.2 },
          }}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
    const temperature = screen.getByTestId(
      "quicklog-correct-temperature-input",
    ) as HTMLInputElement;
    expect(temperature.value).toBe("75.2");
    expect(screen.getByText(/Temperature \(°F\)/)).toBeInTheDocument();
    fireEvent.change(temperature, { target: { value: "77" } });
    fireEvent.click(screen.getByTestId("quicklog-correct-reason-wrong_value"));
    fireEvent.click(screen.getByTestId("quicklog-correct-save"));
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    const changes = (
      rpcMock.mock.calls.at(-1) as [string, { p_changes?: { sensor_values?: unknown } }]
    )[1].p_changes;
    expect(changes?.sensor_values).toEqual({ temperature_c: 25 });
  });
});

describe("one save write", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    toastSuccess.mockReset();
  });

  it("shows Whole tent beside Save and a second tap does not write again", async () => {
    let release: (value: unknown) => void = () => {};
    rpcMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const onOpenChange = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <QuickLogV2Sheet open onOpenChange={onOpenChange} defaultTargetKey="tent:tent-1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("qlv2-save-target")).toHaveTextContent("Tent 1 · Whole tent");
    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Canopy check." },
    });
    const save = screen.getByRole("button", { name: "Save" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(rpcMock).toHaveBeenCalledTimes(1);

    release({
      data: {
        ok: true,
        grow_event_id: "77777777-7777-4777-8777-000000000042",
        environment_event_id: null,
      },
      error: null,
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(String(toastSuccess.mock.calls[0]?.[0])).toContain("Tent 1 · Whole tent");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});
