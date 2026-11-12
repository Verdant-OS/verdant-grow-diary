import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FieldNotebookMount from "@/components/FieldNotebookMount";

vi.mock("@/components/FieldNotebook", () => ({
  default: () => <div>notebook-mounted</div>,
}));

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: vi.fn() }),
}));

describe("FieldNotebookMount empty tent list", () => {
  it("returns before the notebook when the grow has no tent", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <FieldNotebookMount growId="grow-1" tents={[]} />
      </QueryClientProvider>,
    );
    expect(screen.queryByText("notebook-mounted")).not.toBeInTheDocument();
  });
});
