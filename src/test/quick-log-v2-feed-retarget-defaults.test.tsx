/**
 * #2172 / VER-195: switching the Quick Log target from plant A to plant B on
 * the Feed form must not carry A's recipe prefill into B. B gets its own
 * last-used recipe, or a blank recipe when it has no feeding history. A recipe
 * the grower edited is theirs and is kept.
 */
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
    from: () => ({ insert: vi.fn() }),
  },
}));

const PLANTS = [
  { id: "plant-a", name: "Plant A", tent_id: "tent-1", grow_id: "grow-1" },
  { id: "plant-b", name: "Plant B", tent_id: "tent-1", grow_id: "grow-1" },
  { id: "plant-c", name: "Plant C", tent_id: "tent-1", grow_id: "grow-1" },
];
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => ({ data: PLANTS }) }));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }] }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "Grow 1" }] }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/writeFeedingTypedEvent", () => ({ writeFeedingTypedEvent: vi.fn() }));

// Radix Select does not open in jsdom; expose each Select as a plain input.
vi.mock("@/components/ui/select", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const Select = ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children?: ReactNode;
  }) => (
    <div>
      <input
        data-testid="select-proxy"
        value={value ?? ""}
        onChange={(e) => onValueChange?.(e.target.value)}
      />
      {children}
    </div>
  );
  return {
    Select,
    SelectContent: Pass,
    SelectGroup: Pass,
    SelectItem: Pass,
    SelectLabel: Pass,
    SelectTrigger: Pass,
    SelectValue: Pass,
    SelectSeparator: () => null,
  };
});

function feeding(plantId: string, line: string) {
  return {
    id: `feed-${plantId}`,
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: plantId,
    event_type: "feeding",
    entry_at: "2026-06-10T12:00:00.000Z",
    details: {
      nutrients: [{ name: "Base A", amount: 2, unit: "ml_per_l" }],
      nutrient_line_id: line,
    },
  };
}
const HISTORY: Record<string, unknown[]> = {
  "plant-a": [feeding("plant-a", "veg-week-3")],
  "plant-b": [feeding("plant-b", "flower-week-1")],
  "plant-c": [],
};
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: ({ plantId }: { plantId?: string | null }) => ({
    data: HISTORY[plantId ?? ""] ?? [],
    dataUpdatedAt: 1,
  }),
}));
vi.mock("@/hooks/useRecentWateringsForVolumeDefaults", () => ({
  useRecentWateringsForVolumeDefaults: () => ({ data: [] }),
}));

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={true} onOpenChange={vi.fn()} defaultTargetKey="plant:plant-a" />
    </QueryClientProvider>,
  );
}

const lineField = () => screen.getByLabelText("Nutrient line") as HTMLInputElement;
const targetProxy = () =>
  screen
    .getAllByTestId("select-proxy")
    .find((el) => (el as HTMLInputElement).value.startsWith("plant:")) as HTMLInputElement;

async function openFeedOnPlantA() {
  renderSheet();
  fireEvent.click(screen.getByRole("button", { name: "Feed" }));
  await waitFor(() => expect(lineField().value).toBe("veg-week-3"));
}

beforeEach(() => window.sessionStorage.clear());

describe("QuickLogV2Sheet — Feed target change A → B (#2172 / VER-195)", () => {
  it("replaces A's prefilled recipe with B's own last-used recipe", async () => {
    await openFeedOnPlantA();
    fireEvent.change(targetProxy(), { target: { value: "plant:plant-b" } });
    await waitFor(() => expect(lineField().value).toBe("flower-week-1"));
  });

  it("clears A's prefilled recipe when B has no feeding history", async () => {
    await openFeedOnPlantA();
    fireEvent.change(targetProxy(), { target: { value: "plant:plant-c" } });
    await waitFor(() => expect(lineField().value).toBe(""));
  });

  it("keeps a recipe the grower edited when the target changes", async () => {
    await openFeedOnPlantA();
    fireEvent.change(lineField(), { target: { value: "my custom mix" } });
    fireEvent.change(targetProxy(), { target: { value: "plant:plant-b" } });
    await new Promise((r) => setTimeout(r, 50));
    expect(lineField().value).toBe("my custom mix");
  });
});
