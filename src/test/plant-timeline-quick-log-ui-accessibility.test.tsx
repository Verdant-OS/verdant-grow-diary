/**
 * Plant Timeline Quick Log UI + accessibility coverage.
 *
 * Strengthens grower confidence in the Plant Timeline by covering:
 *  - Empty-state CTA opens the existing QuickLog launch flow.
 *  - Sensor snapshot source-badge behavior (Manual only when telemetry
 *    is valid/usable; never "Live" for missing/unknown sources).
 *  - All supported Quick Log action labels render through the shared
 *    label helpers (no JSX label duplication).
 *  - Screen-reader accessibility: section heading, action label,
 *    source badge accessible name, occurred_at accessible name, CTA
 *    accessible name.
 *  - Static safety scan: no service_role, no device-control strings,
 *    no `*_executed` analytics, no inline source/action label maps,
 *    no bare "Live" fallbacks.
 *
 * Scope: tests + (separately) tiny presenter accessibility polish. No
 * schema, RLS, auth, edge-function, RPC, AI Doctor, Alerts, Action
 * Queue, automation, device-control, or fake-live-data changes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogGroupedTimelineSection from "@/components/QuickLogGroupedTimelineSection";
import {
  QUICK_LOG_ACTION_LABELS,
  QUICK_LOG_MANUAL_SOURCE_LABEL,
  formatQuickLogOccurredAt,
  quickLogActionLabel,
  quickLogOccurredAtAccessibleLabel,
  quickLogSourceAccessibleLabel,
} from "@/lib/quickLogGroupedTimelineFilterViewModel";

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

// ---------------------------------------------------------------------------
// 1. Empty-state CTA opens the existing Quick Log flow
// ---------------------------------------------------------------------------

describe("Plant Timeline empty-state CTA", () => {
  it("renders the empty-state copy and opens the existing Quick Log sheet on click", async () => {
    nextRows = [];
    renderSection();
    const empty = await screen.findByTestId(
      "quick-log-grouped-timeline-empty",
    );
    expect(empty.textContent).toContain("No timeline entries yet.");
    expect(empty.textContent).toContain(
      "Add a Quick Log to start this plant's history.",
    );
    const cta = within(empty).getByTestId(
      "quick-log-grouped-timeline-create-button",
    );
    // Existing app pattern: CTA opens the existing QuickLogV2Sheet.
    // No new launch path is invented (no route nav, no custom event).
    fireEvent.click(cta);
    await waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Sensor snapshot source badge behavior
// ---------------------------------------------------------------------------

describe("Sensor snapshot source badge", () => {
  it("shows the Manual source badge when telemetry is valid/usable", async () => {
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
        watering_events: { volume_ml: 500 },
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
    const badge = await screen.findByTestId(
      "quick-log-grouped-action-source",
    );
    expect(badge.textContent).toBe(QUICK_LOG_MANUAL_SOURCE_LABEL);
  });

  it("renders no source badge when an environment-only row has no usable telemetry", async () => {
    nextRows = [
      {
        id: "e-empty",
        plant_id: PLANT,
        tent_id: TENT,
        occurred_at: "2026-05-12T11:00:00.000Z",
        event_type: "environment",
        source: "manual",
        note: null,
        environment_events: {
          temperature_c: null,
          humidity_pct: null,
          vpd_kpa: null,
        },
      },
    ];
    renderSection();
    // With no usable telemetry, the row is dropped entirely → empty
    // state, and never gets a fabricated source badge.
    await screen.findByTestId("quick-log-grouped-timeline-empty");
    expect(
      screen.queryByTestId("quick-log-grouped-action-source"),
    ).toBeNull();
    expect(
      screen.queryByTestId("quick-log-grouped-env-demo-source"),
    ).toBeNull();
  });

  it("never renders a 'Live' label anywhere in the timeline", async () => {
    const t = "2026-05-12T11:00:00.000Z";
    nextRows = [
      {
        id: "n-1",
        plant_id: PLANT,
        tent_id: TENT,
        occurred_at: t,
        event_type: "observation",
        source: "manual",
        note: "Looking good.",
      },
    ];
    const { container } = renderSection();
    await screen.findByTestId("quick-log-grouped-action-source");
    expect(container.textContent ?? "").not.toMatch(/\bLive\b/);
    expect(container.textContent ?? "").not.toMatch(/\bSynced\b/);
  });

  it("drops actions with unknown/null source so they cannot leak as Live", async () => {
    nextRows = [
      {
        id: "u-1",
        plant_id: PLANT,
        tent_id: TENT,
        occurred_at: "2026-05-12T11:00:00.000Z",
        event_type: "observation",
        source: "unknown",
        note: "stray",
      },
    ];
    renderSection();
    await screen.findByTestId("quick-log-grouped-timeline-empty");
    expect(
      screen.queryByTestId("quick-log-grouped-action-source"),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Quick Log action type labels + occurred_at formatting
// ---------------------------------------------------------------------------

describe("Quick Log action labels via shared helpers", () => {
  // QuickLog v2 grouped timeline natively supports water + note. The
  // remaining diary event types are owned by `growDiaryTimelineRules`
  // (titleForEventType). Tests assert the user-facing labels exist
  // through SHARED helpers so JSX never duplicates the map.
  it("Watering label resolves through quickLogActionLabel", () => {
    expect(quickLogActionLabel("water")).toBe("Watering");
    expect(QUICK_LOG_ACTION_LABELS.water).toBe("Watering");
  });

  it("Note label resolves through quickLogActionLabel", () => {
    expect(quickLogActionLabel("note")).toBe("Note");
    expect(QUICK_LOG_ACTION_LABELS.note).toBe("Note");
  });

  it("Feeding/Training/Harvest labels resolve through the shared diary helper", async () => {
    const mod = await import("@/lib/growDiaryTimelineRules");
    // titleForEventType is private; assert via the public toTimelineItem.
    type Entry = Parameters<typeof mod.toTimelineItem>[0];
    const base = {
      id: "x",
      growId: "g",
      plantId: PLANT,
      tentId: TENT,
      stage: "veg",
      createdAt: "2026-05-12T11:00:00.000Z",
      createdAtLabel: "May 12",
      note: "",
      photoUrl: null,
      eventType: "",
      details: {},
      warnings: [],
      isValidForAiContext: true,
    } as unknown as Entry;
    expect(
      mod.toTimelineItem({ ...base, eventType: "feeding" } as Entry).title,
    ).toBe("Feeding");
    expect(
      mod.toTimelineItem({ ...base, eventType: "training" } as Entry).title,
    ).toBe("Training");
    expect(
      mod.toTimelineItem({ ...base, eventType: "harvest" } as Entry).title,
    ).toBe("Harvest");
  });

  it("Diagnosis label falls back deterministically via the shared helper (capitalized)", async () => {
    // "diagnosis" is not a stored diary event type; the shared helper
    // produces a safe, capitalized fallback rather than letting JSX
    // invent its own label table.
    const mod = await import("@/lib/growDiaryTimelineRules");
    type Entry = Parameters<typeof mod.toTimelineItem>[0];
    const base = {
      id: "x",
      growId: "g",
      plantId: PLANT,
      tentId: TENT,
      stage: "veg",
      createdAt: "2026-05-12T11:00:00.000Z",
      createdAtLabel: "May 12",
      note: "",
      photoUrl: null,
      eventType: "diagnosis",
      details: {},
      warnings: [],
      isValidForAiContext: true,
    } as unknown as Entry;
    expect(mod.toTimelineItem(base).title).toBe("Diagnosis");
  });

  it("formatQuickLogOccurredAt produces a deterministic, UTC-stable string", () => {
    const out = formatQuickLogOccurredAt("2026-03-15T09:00:00.000Z");
    // Stable across machines/timezones — UTC-anchored.
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/UTC$/);
    // Invalid input is passed through, never invented as "now".
    expect(formatQuickLogOccurredAt("not-a-date")).toBe("not-a-date");
    expect(formatQuickLogOccurredAt("")).toBe("");
    expect(formatQuickLogOccurredAt(null)).toBe("");
  });

  it("renders the Watering label + formatted occurred_at in the UI", async () => {
    const iso = "2026-03-15T09:00:00.000Z";
    nextRows = [
      {
        id: "w-2",
        plant_id: PLANT,
        tent_id: TENT,
        occurred_at: iso,
        event_type: "watering",
        source: "manual",
        note: null,
        watering_events: { volume_ml: 250 },
      },
    ];
    renderSection();
    const title = await screen.findByTestId(
      "quick-log-grouped-action-title",
    );
    expect(title.textContent).toBe("Watering");
    const ts = screen.getByTestId("quick-log-grouped-action-occurred-at");
    expect(ts.textContent).toBe(formatQuickLogOccurredAt(iso));
  });
});

// ---------------------------------------------------------------------------
// 4. Accessibility coverage
// ---------------------------------------------------------------------------

describe("Plant Timeline accessibility", () => {
  it("exposes the section heading by accessible name", async () => {
    nextRows = [];
    renderSection();
    const heading = await screen.findByRole("heading", {
      name: /QuickLog memory/i,
    });
    expect(heading).toBeTruthy();
  });

  it("CTA in the empty state has a clear accessible name", async () => {
    nextRows = [];
    renderSection();
    const btn = await screen.findByRole("button", {
      name: /Create Quick Log/i,
    });
    expect(btn).toBeTruthy();
  });

  it("entry action label, source badge, and occurred_at are accessible", async () => {
    const iso = "2026-03-15T09:00:00.000Z";
    nextRows = [
      {
        id: "n-2",
        plant_id: PLANT,
        tent_id: TENT,
        occurred_at: iso,
        event_type: "observation",
        source: "manual",
        note: "Trichomes cloudy.",
      },
    ];
    renderSection();
    // Action label is rendered as visible text and identifies the type.
    const title = await screen.findByTestId(
      "quick-log-grouped-action-title",
    );
    expect(title.textContent).toBe("Note");
    // Source badge carries an accessible label, e.g. "Source: Manual".
    const badge = screen.getByTestId("quick-log-grouped-action-source");
    expect(badge.getAttribute("aria-label")).toBe(
      quickLogSourceAccessibleLabel(QUICK_LOG_MANUAL_SOURCE_LABEL),
    );
    expect(badge.getAttribute("aria-label")).toBe("Source: Manual");
    // occurred_at carries an accessible "Occurred at …" label.
    const ts = screen.getByTestId("quick-log-grouped-action-occurred-at");
    const formatted = formatQuickLogOccurredAt(iso);
    expect(ts.getAttribute("aria-label")).toBe(
      quickLogOccurredAtAccessibleLabel(formatted),
    );
    expect(ts.getAttribute("aria-label")).toMatch(/^Occurred at /);
    // Accessible text must not leak internal IDs.
    expect(ts.getAttribute("aria-label") ?? "").not.toContain("n-2");
    expect(badge.getAttribute("aria-label") ?? "").not.toContain("n-2");
  });
});

// ---------------------------------------------------------------------------
// 5. Static safety scan
// ---------------------------------------------------------------------------

describe("Static safety — presenter and shared view-model", () => {
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

  it("presenter has no inline action-label map (uses quickLogActionLabel)", () => {
    expect(presenter).toMatch(/quickLogActionLabel/);
    // No literal `{ water: "Watering", note: "Note" }` map in JSX.
    expect(presenter).not.toMatch(
      /water\s*:\s*["']Watering["'][\s\S]{0,40}note\s*:\s*["']Note["']/,
    );
    // No string-literal switch branch returning "Watering" or "Note".
    expect(presenter).not.toMatch(/return\s+["']Watering["']/);
    expect(presenter).not.toMatch(/return\s+["']Note["']/);
  });

  it("presenter has no inline source-label map (uses shared constants)", () => {
    expect(presenter).toMatch(/QUICK_LOG_MANUAL_SOURCE_LABEL/);
    expect(presenter).not.toMatch(
      /\{\s*manual\s*:\s*["']Manual["']\s*,/,
    );
  });

  it("presenter never hard-codes a 'Live' fallback for QuickLog sources", () => {
    expect(presenter).not.toMatch(/["']Live["']/);
    expect(presenter).not.toMatch(/["']Synced["']/);
  });

  it("shared view-model owns the canonical action + source labels", () => {
    expect(vm).toMatch(/QUICK_LOG_ACTION_LABELS\s*=/);
    expect(vm).toMatch(/water\s*:\s*["']Watering["']/);
    expect(vm).toMatch(/note\s*:\s*["']Note["']/);
    expect(vm).toMatch(/QUICK_LOG_MANUAL_SOURCE_LABEL\s*=\s*["']Manual["']/);
  });
});
