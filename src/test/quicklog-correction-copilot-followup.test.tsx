import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "owner-a" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: { ok: true, revision_no: 1 }, error: null })),
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: async () => ({ data: [], error: null }),
      };
      return query;
    },
  },
}));
vi.mock("@/hooks/useQuickLogGroupedTimeline", () => ({
  useQuickLogGroupedTimeline: () => ({
    entries: [
      {
        kind: "action",
        occurredAt: "2026-03-15T09:00:00.000Z",
        actionSourceLabel: "Manual",
        action: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          kind: "water",
          source: "manual",
          plantId: "plant-1",
          tentId: "tent-1",
          occurredAt: "2026-03-15T09:00:00.000Z",
          noteText: null,
          volumeMl: 500,
        },
      },
    ],
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}));

import { RecentQuickLogActivityPanel } from "@/components/QuickLogHistoryPanels";
import QuickLogGroupedTimelineSection from "@/components/QuickLogGroupedTimelineSection";
import { correctionValuePropsFromDiaryDetails } from "@/lib/quick-log/quickLogRevisionRules";

const MIGRATION = "supabase/migrations/20261014210000_quicklog_correction_editable_values.sql";

describe("Copilot follow-up: editor values", () => {
  it("reads a legacy flat watering amount into the correction dialog", () => {
    expect(
      correctionValuePropsFromDiaryDetails({
        event_type: "watering",
        watering_amount_ml: 400,
      }),
    ).toEqual({ kind: "watering", volumeMl: 400 });
  });

  it("reads sensor values from a V2 observation row that kept its environment companion metrics", () => {
    expect(
      correctionValuePropsFromDiaryDetails({
        event_type: "observation",
        quick_log_version: 2,
        sensor_snapshot: { metrics: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.1 } },
      }),
    ).toEqual({
      kind: "sensor",
      sensor: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.1 },
    });
  });

  it("shows the stored watering volume in the history correction dialog", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RecentQuickLogActivityPanel
          rawEntries={[
            {
              id: "diary-water",
              entry_at: "2026-03-15T09:00:00.000Z",
              note: "watered",
              details: {
                event_type: "watering",
                origin_grow_event_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
                watering: { volume_ml: 500 },
              },
            },
          ]}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
    expect((screen.getByTestId("quicklog-correct-volume-input") as HTMLInputElement).value).toBe(
      "500",
    );
  });

  it("shows the stored watering volume in the grouped timeline correction dialog", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <QuickLogGroupedTimelineSection scope="plant" plantId="plant-1" tentId="tent-1" />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId("quicklog-entry-correct-button"));
    expect((screen.getByTestId("quicklog-correct-volume-input") as HTMLInputElement).value).toBe(
      "500",
    );
  });
});

describe("Copilot follow-up: migration contracts", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("records a diary-only volume as the previous value", () => {
    expect(sql).toContain("watering_amount_ml");
    expect(sql).toMatch(/v_old_volume IS NULL/);
  });

  it("rejects a JSON null sensor metric before the numeric cast", () => {
    expect(sql).toContain("jsonb_typeof(v_sensor -> v_key) <> 'number'");
  });

  it("falls back to details.nutrients when feeding products are absent", () => {
    expect(sql).toContain("details -> 'nutrients' INTO v_products");
  });

  it("allows a sensor correction on an observation that owns an environment companion", () => {
    expect(sql).toContain("p_event_type = 'observation'");
    expect(sql).toContain("p_env_ids");
  });

  it("does not still say the migration is awaiting schema approval", () => {
    expect(sql).not.toContain("Awaiting Cheeko's schema approval");
  });
});

describe("Copilot follow-up: owner fence harness", () => {
  it("proves a second user cannot correct an entry they do not own", () => {
    const harness = readFileSync("scripts/prove-quicklog-correction-owner-fence.mjs", "utf8");
    expect(harness).toContain("not_found_or_not_owned");
    expect(harness).toContain("22222222-2222-4222-8222-222222222222");
  });
});
