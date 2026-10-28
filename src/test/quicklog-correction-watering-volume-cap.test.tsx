/**
 * A watering correction uses the same 50,000 ml single-watering ceiling as
 * Quick Log (#2110); feeding volume keeps the Feed form's 1,000,000 ml bound.
 * The kind never reaches the RPC payload.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateQuickLogCorrection } from "@/lib/quick-log/quickLogRevisionRules";

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

beforeEach(() => mocks.rpc.mockClear());

describe("Quick Log correction volume caps", () => {
  it("caps a watering volume at 50,000 ml and rejects 0", () => {
    expect(validateQuickLogCorrection({ volumeMl: 50_000, volumeKind: "watering" })).toEqual({
      ok: true,
      changes: { volume_ml: 50_000 },
    });
    expect(validateQuickLogCorrection({ volumeMl: 50_001, volumeKind: "watering" })).toEqual({
      ok: false,
      reason: "invalid_changes",
    });
    expect(validateQuickLogCorrection({ volumeMl: 0, volumeKind: "watering" }).ok).toBe(false);
  });

  it("keeps the 1,000,000 ml bound for a feeding volume", () => {
    expect(validateQuickLogCorrection({ volumeMl: 60_000, volumeKind: "feeding" }).ok).toBe(true);
    expect(validateQuickLogCorrection({ volumeMl: 1_000_001, volumeKind: "feeding" }).ok).toBe(
      false,
    );
  });

  it("does not save a 60,000 ml watering correction from the dialog", async () => {
    openDialog({ correctionValues: { kind: "watering", volumeMl: 500 } });
    fireEvent.click(screen.getByTestId("quicklog-correct-reason-wrong_value"));
    fireEvent.change(screen.getByTestId("quicklog-correct-volume-input"), {
      target: { value: "60000" },
    });
    fireEvent.click(screen.getByTestId("quicklog-correct-save"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.rpc).not.toHaveBeenCalledWith("quicklog_correct_entry", expect.anything());
  });

  it("saves a valid watering volume without sending the kind", async () => {
    openDialog({ correctionValues: { kind: "watering", volumeMl: 500 } });
    fireEvent.click(screen.getByTestId("quicklog-correct-reason-wrong_value"));
    fireEvent.change(screen.getByTestId("quicklog-correct-volume-input"), {
      target: { value: "750" },
    });
    fireEvent.click(screen.getByTestId("quicklog-correct-save"));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    const changes = (mocks.rpc.mock.calls.at(-1) as unknown as [string, { p_changes?: object }])[1]
      .p_changes;
    expect(changes).toEqual(expect.objectContaining({ volume_ml: 750 }));
    expect(changes).not.toHaveProperty("volumeKind");
    expect(changes).not.toHaveProperty("volume_kind");
  });
});
