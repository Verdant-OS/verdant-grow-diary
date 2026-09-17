import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

type Row = {
  id: string;
  plant_id: string | null;
  tent_id: string | null;
  entry_at: string;
  note: string;
  photo_url: null;
  stage?: unknown;
  details: unknown;
};

const harness = vi.hoisted(() => ({
  rows: [] as Row[],
  reads: [] as Array<{
    table: string;
    columns: string[];
    filters: Array<[string, unknown]>;
    companion: boolean;
  }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const read = {
        table,
        columns: [] as string[],
        filters: [] as Array<[string, unknown]>,
        companion: false,
      };
      const q = {
        select: (columns: string) => {
          read.columns = columns.split(",").map((value) => value.trim());
          return q;
        },
        eq: (column: string, value: unknown) => {
          read.filters.push([column, value]);
          return q;
        },
        is: () => q,
        not: () => {
          read.companion = true;
          return q;
        },
        or: () => q,
        order: () => q,
        limit: async () => {
          harness.reads.push(read);
          const rows =
            table === "diary_entries" && !read.companion
              ? harness.rows.filter((row) =>
                  read.filters.every(([column, value]) => row[column as keyof Row] === value),
                )
              : [];
          // Reproduce PostgREST projection: unselected fields never reach the hook.
          return {
            data: rows.map((row) =>
              Object.fromEntries(read.columns.map((column) => [column, row[column as keyof Row]])),
            ),
            error: null,
          };
        },
      };
      return q;
    },
  },
}));

import { useTimelineMemory, type TimelineMemoryScope } from "@/hooks/useTimelineMemory";
import TimelineMemorySection from "@/components/TimelineMemorySection";

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "diary-a",
    plant_id: "plant-a",
    tent_id: "tent-a",
    entry_at: "2026-09-16T12:00:00.000Z",
    note: "Persisted plant observation",
    photo_url: null,
    details: { event_type: "note" },
    ...overrides,
  };
}

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

async function readStage(scope: TimelineMemoryScope = { kind: "plant", plantId: "plant-a" }) {
  const view = renderHook(() => useTimelineMemory(scope), { wrapper: wrapper() });
  await waitFor(() => expect(view.result.current.hasData).toBe(true));
  const item = view.result.current.displayItems?.find((value) => value.kind === "diary");
  expect(item?.kind).toBe("diary");
  return item?.kind === "diary" ? item.stage : undefined;
}

beforeEach(() => {
  harness.rows = [];
  harness.reads = [];
});

describe("Timeline Memory preserves the stored diary stage", () => {
  it.each([
    ["canonical stage without details", "flower", null, "flower"],
    ["canonical stage beats conflicting details", "flower", { stage: "veg" }, "flower"],
    ["stored stage label", " Flowering ", {}, "flower"],
    ["stored plant vocabulary alias", "cure", {}, "drying"],
    ["legacy details stage", undefined, { stage: "veg" }, "veg"],
    ["invalid stored stage with legacy fallback", { bad: true }, { stage: "seedling" }, "seedling"],
    ["missing stage", undefined, null, null],
    ["unknown stage", "unknown", { event_type: "note" }, null],
    ["untrusted observation stage", null, { observation_stage: "flower" }, null],
    [
      "valid guided observation",
      null,
      {
        event_type: "observation",
        subtype: "issue",
        observedSign: "discoloration",
        observation_stage: "flower",
      },
      "flower",
    ],
    [
      "canonical stage beats guided observation",
      "veg",
      {
        event_type: "observation",
        subtype: "issue",
        observedSign: "discoloration",
        observation_stage: "flower",
      },
      "veg",
    ],
  ])("handles %s", async (_name, stage, details, expected) => {
    harness.rows = [row({ stage, details })];
    expect(await readStage()).toBe(expected);
  });

  it.each(["plant", "tent"] as const)(
    "keeps the stage on the correct %s-scoped row",
    async (kind) => {
      harness.rows = [
        row({ stage: "seedling" }),
        row({ id: "foreign-row", plant_id: "plant-b", tent_id: "tent-b", stage: "flower" }),
      ];
      const scope: TimelineMemoryScope =
        kind === "plant" ? { kind, plantId: "plant-a" } : { kind, tentId: "tent-a" };
      expect(await readStage(scope)).toBe("seedling");
      const read = harness.reads.find(
        (value) => value.table === "diary_entries" && !value.companion,
      );
      expect(read?.columns).toContain("stage");
      expect(read?.filters).toContainEqual(
        kind === "plant" ? ["plant_id", "plant-a"] : ["tent_id", "tent-a"],
      );
    },
  );

  it("includes the canonical stage on the full items evidence list", async () => {
    harness.rows = [row({ stage: "flower" })];
    const view = renderHook(() => useTimelineMemory({ kind: "plant", plantId: "plant-a" }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(view.result.current.hasData).toBe(true));
    const diary = view.result.current.items.find((value) => value.kind === "diary");
    expect(diary?.kind).toBe("diary");
    if (diary?.kind !== "diary") return;
    expect(diary.stage).toBe("flower");
  });

  it("requires the stage column in the primary select to preserve the saved diary stage", async () => {
    harness.rows = [row({ stage: "flower", details: { event_type: "note" } })];
    await readStage();
    const read = harness.reads.find((value) => value.table === "diary_entries" && !value.companion);
    expect(read?.columns).toContain("stage");
    const projectedWithoutStage = Object.fromEntries(
      read!.columns
        .filter((column) => column !== "stage")
        .map((column) => [column, harness.rows[0][column as keyof Row]]),
    );
    expect(projectedWithoutStage).not.toHaveProperty("stage");
  });

  it("renders an ordinary saved stage again after reopening with a fresh query cache", async () => {
    harness.rows = [row({ stage: "flower" })];
    const first = render(<TimelineMemorySection scope="plant" plantId="plant-a" />, {
      wrapper: wrapper(),
    });
    expect(await screen.findByTestId("timeline-diary-stage-chip")).toHaveTextContent("flower");
    first.unmount();

    render(<TimelineMemorySection scope="plant" plantId="plant-a" />, { wrapper: wrapper() });
    expect(await screen.findByTestId("timeline-diary-stage-chip")).toHaveTextContent("flower");
    expect(screen.getByText("Persisted plant observation")).toBeInTheDocument();
    expect(
      harness.reads.filter((value) => value.table === "diary_entries" && !value.companion),
    ).toHaveLength(2);
  });
});
