/**
 * Plant Timeline Quick Log UI hardening.
 *
 * Strengthens the Quick Log → Plant Timeline user-facing loop:
 *  - Component renders a Quick Log entry as a grower sees it (note text,
 *    log type, occurred_at display text, manual source label badge).
 *  - Sensor snapshot source label appears as "Manual" when telemetry is
 *    attached; never "Live"/"Synced"/"Connected"/"Imported" for missing
 *    or unknown sources.
 *  - Pure grouping VM is deterministically newest-first with a stable
 *    id tie-break when occurred_at ties; same input → identical output.
 *  - Empty state surfaces the user-safe copy:
 *      "No timeline entries yet."
 *      "Add a Quick Log to start this plant's history."
 *  - Static safety: no service_role, no device-control strings, no
 *    *_executed analytics naming, no duplicated source-label mapping
 *    table inside the presenter JSX.
 *
 * Scope:
 *  - Read-only UI + pure VM. No schema, RLS, auth, edge-function,
 *    Supabase RPC, AI Doctor, Alerts, or Action Queue changes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogGroupedTimelineSection from "@/components/QuickLogGroupedTimelineSection";
import {
  QUICK_LOG_GROUPED_TIMELINE_EMPTY_TITLE_TEXT,
  QUICK_LOG_GROUPED_TIMELINE_EMPTY_HINT_TEXT,
  QUICK_LOG_MANUAL_SOURCE_LABEL,
} from "@/lib/quickLogGroupedTimelineFilterViewModel";
import {
  groupQuickLogTimelineEntries,
  type QuickLogActionEvent,
} from "@/lib/quickLogTimelineGroupingViewModel";
import type { QuickLogV2EnvironmentRow } from "@/lib/quickLogV2ManualSnapshotAdapter";

type Row = {
  id: string;
  plant_id: string | null;
  tent_id: string | null;
  occurred_at: string;
  event_type: string;
  source: string;
  note: string | null;
  watering_events?: { volume_ml: number | null } | null;
  environment_events?: {
    temperature_c: number | null;
    humidity_pct: number | null;
    vpd_kpa: number | null;
  } | null;
};

let nextRows: Row[] = [];

vi.mock("@/integrations/supabase/client", () => {
  function makeQuery() {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.in = () => q;
    q.or = () => q;
    q.order = () => q;
    q.limit = () => Promise.resolve({ data: nextRows, error: null });
    return q;
  }
  return { supabase: { from: () => makeQuery() } };
});

const PLANT = "plant-1";
const TENT = "tent-1";

function renderSection() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <QuickLogGroupedTimelineSection
        scope="plant"
        plantId={PLANT}
        tentId={TENT}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  nextRows = [];
});

describe("Plant Timeline — Quick Log UI hardening", () => {
  describe("component renders Quick Log entry as the user sees it", () => {
    it("shows note text, type, occurred_at and Manual source label", async () => {
      const occurredAt = "2026-05-12T10:30:00.000Z";
      nextRows = [
        {
          id: "n-1",
          plant_id: PLANT,
          tent_id: TENT,
          occurred_at: occurredAt,
          event_type: "observation",
          source: "manual",
          note: "Top dressed with worm castings.",
        },
      ];
      renderSection();
      const note = await screen.findByTestId(
        "quick-log-grouped-action-note",
      );
      expect(note.textContent).toBe("Top dressed with worm castings.");
      const title = screen.getByTestId("quick-log-grouped-action-title");
      expect(title.textContent).toBe("Note");
      const ts = screen.getByTestId(
        "quick-log-grouped-action-occurred-at",
      );
      // Formatted via shared helper, anchored in UTC for stability.
      expect(ts.textContent).toMatch(/2026.*UTC/);
      const source = screen.getByTestId(
        "quick-log-grouped-action-source",
      );
      expect(source.textContent).toBe(QUICK_LOG_MANUAL_SOURCE_LABEL);
      expect(source.textContent).not.toMatch(/live|synced|connected|imported/i);
    });

    it("shows Manual source label on a grouped Water + sensor snapshot card", async () => {
      const t = "2026-05-12T11:00:00.000Z";
      nextRows = [
        {
          id: "w-1",
          plant_id: PLANT,
          tent_id: TENT,
          occurred_at: t,
          event_type: "watering",
          source: "manual",
          note: null,
          watering_events: { volume_ml: 750 },
        },
        {
          id: "e-1",
          plant_id: PLANT,
          tent_id: TENT,
          occurred_at: t,
          event_type: "environment",
          source: "manual",
          note: null,
          environment_events: {
            temperature_c: 24.5,
            humidity_pct: 55,
            vpd_kpa: 1.1,
          },
        },
      ];
      renderSection();
      const card = await screen.findByTestId("quick-log-grouped-card");
      expect(card.getAttribute("data-entry-kind")).toBe("grouped");
      const source = within(card).getByTestId(
        "quick-log-grouped-action-source",
      );
      expect(source.textContent).toBe(QUICK_LOG_MANUAL_SOURCE_LABEL);
    });
  });

  describe("empty state copy", () => {
    it("renders the user-safe title and hint when no entries exist", async () => {
      nextRows = [];
      renderSection();
      const empty = await screen.findByTestId(
        "quick-log-grouped-timeline-empty",
      );
      const title = within(empty).getByTestId(
        "quick-log-grouped-timeline-empty-title",
      );
      const hint = within(empty).getByTestId(
        "quick-log-grouped-timeline-empty-hint",
      );
      expect(title.textContent).toBe(
        QUICK_LOG_GROUPED_TIMELINE_EMPTY_TITLE_TEXT,
      );
      expect(hint.textContent).toBe(
        QUICK_LOG_GROUPED_TIMELINE_EMPTY_HINT_TEXT,
      );
      expect(title.textContent).toBe("No timeline entries yet.");
      expect(hint.textContent).toBe(
        "Add a Quick Log to start this plant's history.",
      );
    });
  });
});

describe("Plant Timeline — pure grouping VM determinism", () => {
  function mkAction(
    id: string,
    occurredAt: string,
    kind: "water" | "note" = "note",
  ): QuickLogActionEvent {
    return {
      id,
      kind,
      source: "manual",
      plantId: PLANT,
      tentId: TENT,
      occurredAt,
      noteText: kind === "note" ? `note ${id}` : null,
      volumeMl: kind === "water" ? 500 : null,
    };
  }

  const SCOPE = { kind: "plant" as const, plantId: PLANT, tentId: TENT };

  it("sorts newest first", () => {
    const out = groupQuickLogTimelineEntries({
      actions: [
        mkAction("a", "2026-05-10T10:00:00.000Z"),
        mkAction("b", "2026-05-12T10:00:00.000Z"),
        mkAction("c", "2026-05-11T10:00:00.000Z"),
      ],
      environmentRows: [],
      scope: SCOPE,
    });
    expect(out.map((e) => (e.kind === "action" ? e.action.id : "?"))).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("breaks ties by stable id ordering when occurred_at is identical", () => {
    const t = "2026-05-12T10:00:00.000Z";
    const input = {
      actions: [
        mkAction("z", t),
        mkAction("a", t),
        mkAction("m", t),
      ],
      environmentRows: [] as QuickLogV2EnvironmentRow[],
      scope: SCOPE,
    };
    const first = groupQuickLogTimelineEntries(input);
    const second = groupQuickLogTimelineEntries(input);
    const ids = (xs: typeof first) =>
      xs.map((e) => (e.kind === "action" ? e.action.id : "?"));
    // Same input → identical output (deterministic).
    expect(ids(first)).toEqual(ids(second));
    // Stable id-ascending tie-break.
    expect(ids(first)).toEqual(["a", "m", "z"]);
  });

  it("never labels a missing/unknown source as Live", () => {
    // Pure VM: only "manual" actions are eligible. Anything else is dropped,
    // so the UI cannot fabricate a "Live" label from an unknown source.
    const ineligible = groupQuickLogTimelineEntries({
      actions: [
        {
          id: "u-1",
          kind: "note",
          source: "unknown",
          plantId: PLANT,
          tentId: TENT,
          occurredAt: "2026-05-12T10:00:00.000Z",
          noteText: "x",
        },
        {
          id: "n-1",
          kind: "note",
          source: null as unknown as string,
          plantId: PLANT,
          tentId: TENT,
          occurredAt: "2026-05-12T10:00:00.000Z",
          noteText: "y",
        },
      ],
      environmentRows: [],
      scope: SCOPE,
    });
    expect(ineligible).toEqual([]);
    // Eligible "manual" entries get the honest Manual label.
    const ok = groupQuickLogTimelineEntries({
      actions: [mkAction("m-1", "2026-05-12T10:00:00.000Z")],
      environmentRows: [],
      scope: SCOPE,
    });
    expect(ok).toHaveLength(1);
    if (ok[0].kind === "action") {
      expect(ok[0].actionSourceLabel).toBe("Manual");
    }
  });
});

describe("Plant Timeline — static safety", () => {
  const presenter = readFileSync(
    path.join(
      process.cwd(),
      "src/components/QuickLogGroupedTimelineSection.tsx",
    ),
    "utf8",
  );
  const vm = readFileSync(
    path.join(
      process.cwd(),
      "src/lib/quickLogGroupedTimelineFilterViewModel.ts",
    ),
    "utf8",
  );

  it("presenter contains no service_role or device-control strings", () => {
    expect(presenter).not.toMatch(/service_role/);
    expect(presenter).not.toMatch(
      /\b(autopilot|auto_execute|device_control|relay_on|relay_off|pump_on|pump_off|fan_on|fan_off)\b/i,
    );
  });

  it("presenter never uses *_executed analytics event naming", () => {
    expect(presenter).not.toMatch(/[a-zA-Z_]+_executed\b/);
  });

  it("source labels come from the shared view-model, not duplicated in JSX", () => {
    // The presenter must import the canonical labels.
    expect(presenter).toMatch(/QUICK_LOG_MANUAL_SOURCE_LABEL/);
    // No inline { manual: "Manual", demo: "Demo data", ... } map in the
    // presenter. The shared VM is the single source of truth.
    expect(presenter).not.toMatch(
      /\{\s*manual\s*:\s*["']Manual["']\s*,/,
    );
    // VM owns the canonical strings.
    expect(vm).toMatch(/QUICK_LOG_MANUAL_SOURCE_LABEL\s*=\s*"Manual"/);
  });

  it("presenter never hard-codes a Live label for QuickLog sources", () => {
    // Loose scan: no bare "Live" badge/string used as a source label in
    // the presenter. (Real entries are "Manual"; demo entries are
    // explicitly labeled "Demo data" / "Sample timeline entry".)
    expect(presenter).not.toMatch(/["']Live["']/);
    expect(presenter).not.toMatch(/["']Synced["']/);
  });
});
