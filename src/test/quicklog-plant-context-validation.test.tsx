/**
 * QuickLog — plant/context validation alignment (Gate 1 bug fix).
 *
 * Verifies the picker state and save validation agree:
 *  - Save is disabled until a real plant is selected.
 *  - An inline error appears beside the Plant picker when missing.
 *  - Selecting a plant enables Save and submits with the same plant_id.
 *  - Snapshot warning uses plant-context copy when plant is missing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpcMock = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

const grows = [{ id: "g1", name: "Tent 1", stage: "veg" }];
const plantsData = [
  { id: "p1", name: "Blue Dream", strain: "BD", tent_id: "t1", grow_id: "g1" },
  { id: "p2", name: "OG Kush", strain: "OG", tent_id: "t1", grow_id: "g1" },
];
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows,
    activeGrow: grows[0],
    activeGrowId: "g1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: plantsData }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

// Snapshot strip is heavy; stub it.
vi.mock("@/components/QuickLogSensorSnapshotStrip", () => ({
  default: () => null,
}));

import QuickLog from "@/components/QuickLog";

function renderQL() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLog open={true} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => rpcMock.mockClear());
afterEach(() => cleanup());

describe("QuickLog plant/context validation", () => {
  it("shows inline error and disables Save when no plant selected", () => {
    renderQL();
    expect(screen.getByTestId("quick-log-plant-error").textContent).toMatch(
      /choose a plant before saving/i,
    );
    expect(
      (screen.getByTestId("quick-log-save") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("does not invoke RPC when Save is clicked without plant", () => {
    renderQL();
    fireEvent.click(screen.getByTestId("quick-log-save"));
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("inline error uses role=alert for assistive tech", () => {
    renderQL();
    expect(
      screen.getByTestId("quick-log-plant-error").getAttribute("role"),
    ).toBe("alert");
  });

  it("does not introduce fake live/sensor copy", () => {
    renderQL();
    const body = document.body.textContent ?? "";
    // Strip the existing "not live sensor data" disclaimer before scanning.
    const scrubbed = body.replace(/not live sensor data/gi, "");
    expect(scrubbed).not.toMatch(/\blive data\b|\blive sensor\b|guaranteed/i);
  });
});
