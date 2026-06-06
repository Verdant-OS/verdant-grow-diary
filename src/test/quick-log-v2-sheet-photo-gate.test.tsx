/**
 * QuickLogV2Sheet — photo gate layout, a11y, and safety tests.
 *
 * Locks the disabled photo gate so QuickLogV2Sheet cannot accidentally
 * grow a file input, picker buttons, storage upload, or diary insert
 * before photo saving is intentionally enabled via the shared helper
 * (src/lib/quickLogPhotoGateRules.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  buildQuickLogPhotoGateState,
  isQuickLogPhotoSavingSupported,
} from "@/lib/quickLogPhotoGateRules";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      { id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" },
    ],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }],
  }),
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
      <QuickLogV2Sheet
        open={true}
        onOpenChange={() => {}}
        defaultTargetKey="plant:plant-1"
      />
    </QueryClientProvider>,
  );
}

function selectPhotoAction() {
  fireEvent.click(screen.getByRole("button", { name: "Photo" }));
}

beforeEach(() => {
  rpcMock.mockReset();
});
afterEach(() => cleanup());

describe("QuickLogV2Sheet — photo gate (Gate 1: not supported)", () => {
  it("asserts photo saving is gated off so the gate UI applies", () => {
    expect(isQuickLogPhotoSavingSupported()).toBe(false);
  });

  it("renders gate block with shared disabled title + body copy", () => {
    renderSheet();
    selectPhotoAction();
    const gate = screen.getByTestId("qlv2-photo-gate");
    const expected = buildQuickLogPhotoGateState();
    expect(within(gate).getByText(expected.disabledTitle)).toBeTruthy();
    expect(within(gate).getByText(expected.disabledCopy)).toBeTruthy();
  });

  it("renders helper text wired via aria-describedby", () => {
    renderSheet();
    selectPhotoAction();
    const gate = screen.getByTestId("qlv2-photo-gate");
    const expected = buildQuickLogPhotoGateState();
    const helper = screen.getByTestId("qlv2-photo-gate-helper");
    expect(helper.textContent).toBe(expected.helperText);
    expect(gate.getAttribute("aria-describedby")).toBe(helper.id);
  });

  it("gate has the helper-provided aria-label and role=status", () => {
    renderSheet();
    selectPhotoAction();
    const gate = screen.getByTestId("qlv2-photo-gate");
    expect(gate.getAttribute("role")).toBe("status");
    expect(gate.getAttribute("aria-label")).toBe(
      buildQuickLogPhotoGateState().ariaLabel,
    );
  });

  it("renders NO <input type=\"file\"> anywhere in the sheet", () => {
    const { container } = renderSheet();
    selectPhotoAction();
    expect(container.querySelectorAll('input[type="file"]').length).toBe(0);
  });

  it("renders NO Take Photo / Choose from Library buttons", () => {
    renderSheet();
    selectPhotoAction();
    expect(screen.queryByRole("button", { name: /take photo/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /choose from library/i }),
    ).toBeNull();
  });

  it("Save is still blocked for photo action with a calm error", () => {
    renderSheet();
    selectPhotoAction();
    fireEvent.click(screen.getByTestId("qlv2-save"));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/photo saving is not enabled yet/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
