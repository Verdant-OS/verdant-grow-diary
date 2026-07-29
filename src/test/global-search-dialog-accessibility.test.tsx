import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import GlobalSearchDialog from "@/components/GlobalSearchDialog";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    loading: false,
    user: { id: "accessibility-test-owner" },
  }),
}));

vi.mock("@/hooks/useGlobalSearch", () => ({
  useGlobalSearch: () => ({
    results: [],
    isLoading: false,
    isError: false,
    retry: vi.fn(),
  }),
}));

afterEach(cleanup);

describe("GlobalSearchDialog accessibility", () => {
  it("provides an accessible dialog name and description", () => {
    render(
      <MemoryRouter
        future={{
          v7_relativeSplatPath: true,
          v7_startTransition: true,
        }}
      >
        <GlobalSearchDialog open onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );

    const dialog = screen.getByRole("dialog", { name: "Search Verdant" });
    expect(dialog).toHaveAccessibleDescription(
      "Search your grows, tents, plants, and the cultivar reference library.",
    );
  });
});
