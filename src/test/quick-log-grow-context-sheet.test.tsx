/**
 * Global Quick Log opened from a grow-scoped page groups that grow's targets
 * first ("In this grow") and the rest under "Other grows". It still selects
 * nothing. Auth, storage and network are mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

const SKUNK = "6b95939b-08eb-41dd-b2c1-b124d899da49";
const QA = "aaaaaaaa-0000-4000-8000-000000000001";

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-grow-context" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [
      { id: "t-qa", name: "UX Audit Test Tent", grow_id: QA },
      { id: "t-flower", name: "Flower", grow_id: SKUNK },
    ],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "p-dolce", name: "Dolce", tent_id: "t-flower", grow_id: SKUNK }],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [
      { id: SKUNK, name: "Skunk Gas Run" },
      { id: QA, name: "UX Audit" },
    ],
    archivedGrows: [],
  }),
}));

function renderSheet(growContextId: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open onOpenChange={() => {}} growContextId={growContextId} />
    </QueryClientProvider>,
  );
}

function openTargetList() {
  const trigger = screen.getByRole("combobox", { name: /choose plant or tent/i });
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  return screen.getByTestId("qlv2-target-content");
}

beforeEach(() => clearLocalStorageForTest());
afterEach(() => cleanup());

describe("Quick Log target list with a carried grow", () => {
  it("groups the carried grow first and selects nothing", () => {
    renderSheet(SKUNK);
    const trigger = screen.getByRole("combobox", { name: /choose plant or tent/i });
    expect(trigger).toHaveTextContent(/choose a tent or plant/i);

    const content = openTargetList();
    const inGrow = within(content).getByTestId("qlv2-target-group-in-grow");
    const other = within(content).getByTestId("qlv2-target-group-other-grows");
    expect(inGrow).toHaveTextContent("Flower");
    expect(inGrow).toHaveTextContent("Dolce");
    expect(inGrow).not.toHaveTextContent("UX Audit Test Tent");
    expect(other).toHaveTextContent("UX Audit Test Tent");
  });

  it("keeps the ungrouped list when no grow is carried", () => {
    renderSheet(null);
    const content = openTargetList();
    expect(within(content).queryByTestId("qlv2-target-group-in-grow")).toBeNull();
    expect(content).toHaveTextContent("UX Audit Test Tent");
    expect(content).toHaveTextContent("Flower");
  });
});
