/**
 * QuickLog — plant/context accessibility + payload-safety contract.
 *
 * Audit findings (Gate 1):
 *  - Plant is REQUIRED for every Quick Log save. `submit()` and
 *    `buildLegacyQuickLogUnifiedPayload` both reject missing plantId.
 *  - Grow-level Quick Log save (no plant_id) is NOT supported by the
 *    current `quicklog_save_manual` RPC payload contract — parked as a
 *    separate Gate 1 design slice. No regression test added for that path.
 *  - Tent context is derived from `selectedPlant.tent_id`. There is no
 *    standalone tent picker, so cross-grow tent mismatch is not reachable
 *    from the UI. No new tent picker is introduced in this slice.
 *  - Visible picker state (`plantId`) and the submitted payload
 *    (`built.payload.p_target_id`) are sourced from the same
 *    `selectedPlant.id`, so they cannot diverge.
 *
 * These tests verify accessible semantics + payload safety without
 * changing app behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

const rpcMock = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    from: () => ({
      insert: vi.fn(),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "Tent 1", stage: "veg" }],
    activeGrow: { id: "g1", name: "Tent 1", stage: "veg" },
    activeGrowId: "g1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "p1", name: "Blue Dream", strain: "BD", tent_id: "t1", grow_id: "g1" }],
  }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));
vi.mock("@/components/QuickLogSensorSnapshotStrip", () => ({ default: () => null }));

import QuickLog from "@/components/QuickLog";

function renderQL(ui: ReactElement = <QuickLog open onOpenChange={() => {}} />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => rpcMock.mockClear());
afterEach(() => cleanup());

describe("QuickLog plant/context accessibility", () => {
  it("plant picker trigger is aria-invalid and described by the error when missing", () => {
    renderQL();
    const trigger = screen.getByTestId("quick-log-plant-select");
    expect(trigger.getAttribute("aria-invalid")).toBe("true");
    const errorId = trigger.getAttribute("aria-describedby");
    expect(errorId).toBe("quick-log-plant-error");
    const err = document.getElementById(errorId!);
    expect(err).not.toBeNull();
    expect(err!.getAttribute("role")).toBe("alert");
    expect(err!.textContent).toMatch(/choose a plant before saving this entry/i);
  });

  it("Save is disabled and no RPC fires while plant is missing", () => {
    renderQL();
    const btn = screen.getByTestId("quick-log-save") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("snapshot attach switch is disabled when no plant is selected (payload-safe)", () => {
    renderQL();
    const sw = screen.getByRole("switch", { name: /attach sensor snapshot/i });
    expect(sw.getAttribute("data-disabled") !== null || (sw as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not introduce fake live/sensor copy in the dialog", () => {
    renderQL();
    const text = screen.getByRole("dialog").textContent ?? "";
    const scrubbed = text.replace(/not live sensor data/gi, "");
    expect(scrubbed).not.toMatch(/\blive data\b|\blive sensor\b|guaranteed/i);
  });

  it("hardware readings section is visible without plant but Save still blocked (no RPC)", () => {
    renderQL();
    const hw = screen.getByTestId("quicklog-hardware-readings");
    expect(hw).toBeInTheDocument();
    const inputs = hw.querySelectorAll("input");
    fireEvent.change(inputs[0], { target: { value: "6.2" } });
    const btn = screen.getByTestId("quick-log-save") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("QuickLog grow-level save (parked)", () => {
  it("characterization: payload builder rejects missing plantId so grow-level save is not supported", async () => {
    const { buildLegacyQuickLogUnifiedPayload } = await import(
      "@/lib/legacyQuickLogUnifiedSave"
    );
    const result = buildLegacyQuickLogUnifiedPayload({
      eventType: "observation",
      noteWithHardware: "grow-level note",
      plantId: null,
      plantTentId: null,
      details: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toBe("plant_required");
    }
  });
});
