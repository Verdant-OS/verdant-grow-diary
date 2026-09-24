import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { EMPTY_REPORTS_HUB_DATA } from "@/hooks/useReportsHubData";
const state = vi.hoisted(() => ({ status: "loading", retry: vi.fn() }));
vi.mock("@/hooks/useReportsHubData", async (original) => ({
  ...(await original<typeof import("@/hooks/useReportsHubData")>()),
  useReportsHubData: () => ({
    ...EMPTY_REPORTS_HUB_DATA,
    status: state.status,
    retry: state.retry,
  }),
}));
vi.mock("@/hooks/useScopedGrow", () => ({ useScopedGrow: () => ({ scopedGrow: null }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    activeGrow: { id: "grow-a", name: "Grow A" },
    grows: [{ id: "grow-a" }],
    loading: false,
  }),
}));
vi.mock("@/components/GrowFollowUpReviewSection", () => ({
  GrowFollowUpReviewSection: () => <div>Follow-up review</div>,
}));
import Reports from "@/pages/Reports";
afterEach(() => {
  cleanup();
  state.retry.mockClear();
});
it.each(["loading", "unavailable"])("withholds report facts and onboarding while %s", (status) => {
  state.status = status;
  render(
    <MemoryRouter>
      <Reports />
    </MemoryRouter>,
  );
  expect(screen.queryByLabelText("Grow learning report cards")).not.toBeInTheDocument();
  expect(screen.queryByText("Follow-up review")).not.toBeInTheDocument();
  expect(screen.queryByText("No reports yet")).not.toBeInTheDocument();
  expect(
    screen.getByText(status === "loading" ? "Loading reports…" : "Reports unavailable"),
  ).toBeInTheDocument();
  if (status === "unavailable") {
    fireEvent.click(screen.getByRole("button", { name: "Retry reports" }));
    expect(state.retry).toHaveBeenCalledTimes(1);
  }
});
