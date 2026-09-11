/**
 * Edit tent Save stays fail-closed until trimmed Name is present.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const eqMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: eqMock }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: updateMock,
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import EditTentDialog from "@/components/EditTentDialog";

const tent = {
  id: "tent-1",
  name: "Fixture Tent",
  brand: "Gorilla",
  size: "4x4",
  stage: "seedling",
  light: { on: true, schedule: "18/6", wattage: 240 },
};

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EditTentDialog tent={tent} />
    </QueryClientProvider>,
  );
}

describe("EditTentDialog identity fail-closed", () => {
  beforeEach(() => {
    eqMock.mockReset();
    updateMock.mockClear();
    eqMock.mockResolvedValue({ error: null });
  });

  it("disables Save changes when Name is empty or whitespace-only", () => {
    renderDialog();
    fireEvent.click(screen.getByTestId("edit-tent-trigger"));
    const name = screen.getByTestId("edit-tent-name");
    const submit = screen.getByTestId("edit-tent-submit");

    fireEvent.change(name, { target: { value: "" } });
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest("form")!);
    expect(updateMock).not.toHaveBeenCalled();

    fireEvent.change(name, { target: { value: "   " } });
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest("form")!);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("enables Save changes when Name is trimmed non-empty", () => {
    renderDialog();
    fireEvent.click(screen.getByTestId("edit-tent-trigger"));
    fireEvent.change(screen.getByTestId("edit-tent-name"), {
      target: { value: "  Flower tent  " },
    });
    expect(screen.getByTestId("edit-tent-submit")).toBeEnabled();
  });
});
