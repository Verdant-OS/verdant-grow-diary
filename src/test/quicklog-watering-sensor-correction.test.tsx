import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({
    data: {
      ok: true,
      revision_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      revision_no: 2,
      grow_event_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      diary_entry_ids: [],
    },
    error: null,
  })),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "owner-a" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: async () => ({ data: [], error: null }),
      };
      return query;
    },
  },
}));

import QuickLogEntryIntegrityControls from "@/components/QuickLogEntryIntegrityControls";
import { correctionValuesForTimelineAction } from "@/lib/quick-log/quickLogRevisionRules";

const READINGS = [
  { field: "air_temp_c", value: 24 },
  { field: "humidity_pct", value: 55 },
  { field: "vpd_kpa", value: 1.2 },
];

describe("watering correction context with an environment sibling", () => {
  it("carries the volume and the sibling readings together", () => {
    expect(correctionValuesForTimelineAction({ kind: "water", volumeMl: 500 }, READINGS)).toEqual({
      kind: "watering",
      volumeMl: 500,
      sensor: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.2 },
    });
  });

  it("stays volume-only for a watering log without readings", () => {
    expect(correctionValuesForTimelineAction({ kind: "water", volumeMl: 500 })).toEqual({
      kind: "watering",
      volumeMl: 500,
    });
    expect(correctionValuesForTimelineAction({ kind: "water", volumeMl: 500 }, [])).toEqual({
      kind: "watering",
      volumeMl: 500,
    });
  });

  it("is deterministic for the same inputs", () => {
    const a = correctionValuesForTimelineAction({ kind: "water", volumeMl: 500 }, READINGS);
    const b = correctionValuesForTimelineAction({ kind: "water", volumeMl: 500 }, READINGS);
    expect(a).toEqual(b);
  });
});

function openDialog(props: Record<string, unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <QuickLogEntryIntegrityControls
        handle={{ growEventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }}
        currentNote="kept"
        {...props}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
}

describe("Correct dialog for a watering log with readings", () => {
  it("shows volume and readings prefilled and submits both in one RPC call", async () => {
    mocks.rpc.mockClear();
    openDialog({
      correctionValues: {
        kind: "watering",
        volumeMl: 500,
        sensor: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.2 },
      },
    });
    const volume = screen.getByTestId("quicklog-correct-volume-input") as HTMLInputElement;
    const temperature = screen.getByTestId(
      "quicklog-correct-temperature-input",
    ) as HTMLInputElement;
    const humidity = screen.getByTestId("quicklog-correct-humidity-input") as HTMLInputElement;
    const vpd = screen.getByTestId("quicklog-correct-vpd-input") as HTMLInputElement;
    expect(volume.value).toBe("500");
    expect(temperature.value).toBe("24");
    expect(humidity.value).toBe("55");
    expect(vpd.value).toBe("1.2");

    fireEvent.click(screen.getByTestId("quicklog-correct-reason-wrong_value"));
    fireEvent.change(volume, { target: { value: "750" } });
    fireEvent.change(temperature, { target: { value: "26" } });
    fireEvent.click(screen.getByTestId("quicklog-correct-save"));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    const call = mocks.rpc.mock.calls[0] as unknown as [string, { p_changes?: unknown }];
    expect(call[0]).toBe("quicklog_correct_entry");
    expect(call[1].p_changes).toEqual({
      volume_ml: 750,
      sensor_values: { temperature_c: 26 },
    });
  });

  it("shows no reading fields for a volume-only watering log", () => {
    openDialog({ correctionValues: { kind: "watering", volumeMl: 500 } });
    expect(screen.getByTestId("quicklog-correct-volume-input")).toBeTruthy();
    expect(screen.queryByTestId("quicklog-correct-temperature-input")).toBeNull();
  });
});
