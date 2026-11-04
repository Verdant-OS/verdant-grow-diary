/**
 * Grower bug report 2026-11-03, item 19: renaming a tent to the name of
 * another tent warns under the Name field, without reading the database and
 * without blocking Save.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";

const supabaseFromMock = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: supabaseFromMock } }));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import EditTentDialog from "@/components/EditTentDialog";
import { TENTS_QUERY_KEY } from "@/hooks/use-tents";

afterEach(cleanup);

const tent = { id: "t-2", name: "Flower Alpha", brand: null, size: "4x4", stage: "veg" };

describe("Edit Tent near-duplicate name warning", () => {
  it("warns when the new name matches another tent and keeps Save enabled", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(TENTS_QUERY_KEY, [
      { id: "t-1", name: "Vegetation Bravo" },
      { id: "t-2", name: "Flower Alpha" },
    ]);
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <EditTentDialog tent={tent} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId("edit-tent-trigger"));
    expect(screen.queryByTestId("edit-tent-similar-name")).toBeNull();
    fireEvent.change(screen.getByTestId("edit-tent-name"), {
      target: { value: "Vegetation Bravo" },
    });
    expect(screen.getByTestId("edit-tent-similar-name")).toHaveTextContent(
      "A tent named “Vegetation Bravo” already exists.",
    );
    const save = screen.getByRole("button", { name: /save/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    expect(supabaseFromMock).not.toHaveBeenCalled();
  });
});
