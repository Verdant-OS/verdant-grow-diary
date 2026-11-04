/**
 * Grower bug report 2026-11-03, item 15: "Whole tent" must be selectable when
 * Quick Log is opened anywhere, not only from that tent's page.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearTemperatureUnitPreference } from "@/lib/temperatureUnitPreference";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "QA Test", tent_id: "tent-1", grow_id: "grow-1" }],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "QA Test", grow_id: "grow-1" }],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "QA Test" }] }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));
vi.mock("@/hooks/useRecentWateringsForVolumeDefaults", () => ({
  useRecentWateringsForVolumeDefaults: () => ({ data: [] }),
}));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

function renderSheet(key?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet
        open={true}
        onOpenChange={() => {}}
        {...(key ? { defaultTargetKey: key } : {})}
      />
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});
beforeEach(() => {
  window.sessionStorage.clear();
  clearTemperatureUnitPreference();
});
afterEach(() => cleanup());

describe("Quick Log whole-tent target (item 15)", () => {
  it.each([
    ["the global Quick Log (no context)", undefined],
    ["a plant's Quick Log", "plant:plant-1"],
  ])("offers the tent as a whole-tent target from %s", async (_where, key) => {
    renderSheet(key);
    fireEvent.click(screen.getByLabelText("Target"));
    expect(await screen.findByRole("option", { name: "QA Test · Whole tent" })).toBeTruthy();
  });
});
