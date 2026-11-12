import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FieldNotebookMount from "@/components/FieldNotebookMount";

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: vi.fn() }),
}));

describe("FieldNotebookMount with no tent", () => {
  it("renders nothing when the grow has no tent", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <FieldNotebookMount growId="grow-1" tents={[]} />
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByLabelText("Observation")).not.toBeInTheDocument();
  });
});
