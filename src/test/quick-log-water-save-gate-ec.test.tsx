/**
 * Root-zone fields other than volume stay on the submit path.
 * A bad Input EC must not disable Save or replace the ready footer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { EMPTY_QUICKLOG_WATERING_FORM } from "@/lib/quickLogWateringFormViewModel";
import { assessQuickLogWaterSaveGate } from "@/lib/quickLogWaterSaveGateRules";

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
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={true} onOpenChange={() => {}} defaultTargetKey="plant:plant-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rpcMock.mockReset();
});
afterEach(() => cleanup());

describe("Quick Log Water gate ignores non-#1996 fields", () => {
  it("does not report a bad EC from the pure gate", () => {
    const gate = assessQuickLogWaterSaveGate({
      form: { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "500", ec: "not-a-number" },
      temperatureC: "",
      humidityPct: "",
      vpdKpa: "",
      temperatureUnit: "celsius",
    });
    expect(gate.blocksSave).toBe(false);
    expect(gate.footerMessage).toBeNull();
    expect(gate.fields).toEqual({});
  });

  it("leaves Save enabled when only Input EC is not a number", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Water" }));
    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Input EC"), { target: { value: "not-a-number" } });
    expect(screen.queryByTestId("qlv2-volume-error")).toBeNull();
    expect(screen.getByTestId("qlv2-save-helper")).toHaveTextContent(
      "Ready to save when this log matches what happened.",
    );
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(false);
  });
});
