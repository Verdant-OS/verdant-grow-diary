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

describe("Correct this Quick Log entry dialog", () => {
  it("shows a volume field for a watering entry and submits the new volume with Wrong value", async () => {
    openDialog({ correctionValues: { kind: "watering", volumeMl: 500 } });
    expect(screen.getByTestId("quicklog-correct-reason-wrong_value")).toBeTruthy();
    const volume = screen.getByTestId("quicklog-correct-volume-input") as HTMLInputElement;
    expect(volume.value).toBe("500");
    fireEvent.click(screen.getByTestId("quicklog-correct-reason-wrong_value"));
    fireEvent.change(volume, { target: { value: "750" } });
    fireEvent.click(screen.getByTestId("quicklog-correct-save"));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    const lastCall = mocks.rpc.mock.calls.at(-1) as
      [string, { p_changes?: { volume_ml?: number } }] | undefined;
    const changes = lastCall?.[1]?.p_changes;
    expect(changes).toEqual(expect.objectContaining({ volume_ml: 750 }));
    expect(changes?.volume_ml).not.toBe(500);
  });

  it("shows a dose field for a feeding entry", () => {
    openDialog({ correctionValues: { kind: "feeding", doseAmount: 2 } });
    expect(screen.getByTestId("quicklog-correct-dose-input")).toBeTruthy();
    expect(screen.queryByTestId("quicklog-correct-volume-input")).toBeNull();
  });

  it("shows sensor fields for a sensor entry", () => {
    openDialog({
      correctionValues: {
        kind: "sensor",
        sensor: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.2 },
      },
    });
    expect(
      (screen.getByTestId("quicklog-correct-temperature-input") as HTMLInputElement).value,
    ).toBe("24");
    expect(screen.getByTestId("quicklog-correct-humidity-input")).toBeTruthy();
    expect(screen.getByTestId("quicklog-correct-vpd-input")).toBeTruthy();
  });
});
