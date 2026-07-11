/**
 * Action Follow-Up Evidence V1 — Slice 4b tests.
 *
 * Covers:
 *  - Pure `filterManualSensorSnapshotCandidates` rules (Manual-only,
 *    grow/tent/plant scoping, stale/invalid/unknown exclusion,
 *    deterministic sort).
 *  - `loadManualSensorCandidates` service: authenticated client,
 *    query scope, defense-in-depth filtering, sanitized errors.
 *  - `ActionFollowUpManualSensorSelector` UI: default "No sensor
 *    snapshot", Manual-only listing, empty & error states, 44px
 *    control height, snapshot ID never leaked.
 *  - `ActionFollowUpManualSensorEvidence` UI: Manual badge, never
 *    Live, captured/metric rendering, unavailable copy.
 *  - `ActionFollowUpEvidenceSection` integration: selector renders,
 *    selected ID passes exactly through save, no selection passes
 *    null, query-error passes null, existing follow-up renders
 *    associated evidence.
 *  - Static safety: no sensor-mutation helpers imported.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  filterManualSensorSnapshotCandidates,
  timelineCardToCandidateInput,
  type ActionFollowUpManualSensorCandidateInput,
} from "@/lib/actionFollowUpManualSensorRules";
import {
  loadManualSensorCandidates,
  loadManualSensorSnapshotById,
} from "@/lib/actionFollowUpManualSensorService";
import ActionFollowUpManualSensorSelector from "@/components/ActionFollowUpManualSensorSelector";
import ActionFollowUpManualSensorEvidence, {
  ACTION_FOLLOWUP_SENSOR_UNAVAILABLE_COPY,
} from "@/components/ActionFollowUpManualSensorEvidence";
import ActionFollowUpEvidenceSection from "@/components/ActionFollowUpEvidenceSection";
import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";
import type { ActionFollowUpEvidenceRecord } from "@/lib/actionFollowUpEvidenceService";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

let existingFollowUpRows: unknown[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = () => {
    const promise = () =>
      Promise.resolve({ data: existingFollowUpRows, error: null });
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      contains: () => ({
        then: (r: (x: unknown) => unknown) =>
          r({ data: existingFollowUpRows, error: null }),
      }),
      order: () => chain,
      then: (r: (x: unknown) => unknown) =>
        r({ data: existingFollowUpRows, error: null }),
      limit: () => promise(),
    };
    return chain;
  };
  return { supabase: { from: () => makeChain() } };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(), warning: vi.fn() },
}));

beforeEach(() => {
  existingFollowUpRows = [];
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function candidateFixture(
  overrides: Partial<ActionFollowUpManualSensorCandidateInput> = {},
): ActionFollowUpManualSensorCandidateInput {
  return {
    id: "sn-1",
    capturedAt: "2026-07-11T12:00:00.000Z",
    tentId: "t-1",
    plantId: "p-1",
    source: "manual",
    severity: "ok",
    growId: "g-1",
    ...overrides,
  };
}

function cardFixture(
  overrides: Partial<ManualSnapshotTimelineCard> = {},
): ManualSnapshotTimelineCard {
  return {
    id: "sn-1",
    title: "Manual sensor snapshot",
    capturedAt: "2026-07-11T12:00:00.000Z",
    sourceLabel: "Manual",
    source: "manual",
    tentId: "t-1",
    plantId: "p-1",
    isTentLevel: false,
    notes: null,
    readings: [
      { field: "air_temp_c", value: 27.5, unit: "°C", derived: false },
      { field: "humidity_pct", value: 55, unit: "%", derived: false },
      { field: "vpd_kpa", value: 1.42, unit: "kPa", derived: false },
    ],
    severity: "ok",
    warnings: [],
    errors: [],
    ...overrides,
  } as ManualSnapshotTimelineCard;
}

const CTX = { growId: "g-1", tentId: "t-1" as string | null, plantId: "p-1" as string | null };

// =============================================================================
// Pure candidate rules
// =============================================================================

describe("filterManualSensorSnapshotCandidates", () => {
  it("accepts a matching Manual snapshot", () => {
    const out = filterManualSensorSnapshotCandidates([candidateFixture()], CTX);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("sn-1");
  });

  it.each([
    ["live"],
    ["csv"],
    ["demo"],
    ["stale"],
    ["invalid"],
    ["unknown"],
    [""],
    [null],
  ] as const)("excludes source=%s", (source) => {
    const out = filterManualSensorSnapshotCandidates(
      [candidateFixture({ source: source as string | null })],
      CTX,
    );
    expect(out).toHaveLength(0);
  });

  it("excludes Manual snapshot whose validation severity is invalid", () => {
    const out = filterManualSensorSnapshotCandidates(
      [candidateFixture({ severity: "invalid" })],
      CTX,
    );
    expect(out).toHaveLength(0);
  });

  it("excludes wrong-grow snapshot when growId is provided on the candidate", () => {
    const out = filterManualSensorSnapshotCandidates(
      [candidateFixture({ growId: "other-grow" })],
      CTX,
    );
    expect(out).toHaveLength(0);
  });

  it("excludes wrong-tent snapshot", () => {
    const out = filterManualSensorSnapshotCandidates(
      [candidateFixture({ tentId: "other-tent" })],
      CTX,
    );
    expect(out).toHaveLength(0);
  });

  it("excludes wrong-plant snapshot", () => {
    const out = filterManualSensorSnapshotCandidates(
      [candidateFixture({ plantId: "other-plant" })],
      CTX,
    );
    expect(out).toHaveLength(0);
  });

  it("accepts tent-level (plant_id null) snapshot when action has a plant", () => {
    const out = filterManualSensorSnapshotCandidates(
      [candidateFixture({ plantId: null })],
      CTX,
    );
    expect(out).toHaveLength(1);
  });

  it("only accepts tent-level snapshots when action has no plant", () => {
    const ctx = { growId: "g-1", tentId: "t-1", plantId: null };
    const out = filterManualSensorSnapshotCandidates(
      [
        candidateFixture({ id: "a", plantId: null }),
        candidateFixture({ id: "b", plantId: "p-1" }),
      ],
      ctx,
    );
    expect(out.map((c) => c.id)).toEqual(["a"]);
  });

  it("excludes rows with invalid captured timestamp", () => {
    const out = filterManualSensorSnapshotCandidates(
      [candidateFixture({ capturedAt: "not-a-date" })],
      CTX,
    );
    expect(out).toHaveLength(0);
  });

  it("sorts by capturedAt desc, then id asc", () => {
    const out = filterManualSensorSnapshotCandidates(
      [
        candidateFixture({ id: "b", capturedAt: "2026-07-10T00:00:00Z" }),
        candidateFixture({ id: "a", capturedAt: "2026-07-11T00:00:00Z" }),
        candidateFixture({ id: "c", capturedAt: "2026-07-11T00:00:00Z" }),
      ],
      CTX,
    );
    expect(out.map((c) => c.id)).toEqual(["a", "c", "b"]);
  });

  it("returns deterministic output for the same input", () => {
    const input = [
      candidateFixture({ id: "z" }),
      candidateFixture({ id: "y" }),
    ];
    const a = filterManualSensorSnapshotCandidates(input, CTX);
    const b = filterManualSensorSnapshotCandidates(input, CTX);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  it("returns empty when growId is missing", () => {
    expect(
      filterManualSensorSnapshotCandidates([candidateFixture()], {
        growId: "",
        tentId: "t-1",
        plantId: "p-1",
      }),
    ).toHaveLength(0);
  });

  it("timelineCardToCandidateInput passes source=manual through", () => {
    const input = timelineCardToCandidateInput(cardFixture());
    expect(input.source).toBe("manual");
  });
});

// =============================================================================
// Service loader
// =============================================================================

function makeClient(
  data: unknown,
  error: unknown = null,
): { from: (t: string) => unknown; _lastTent?: string } {
  const state = { lastTent: null as string | null };
  const chain: Record<string, unknown> = {
    select: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data, error }),
    eq: (col: string, val: string) => {
      if (col === "tent_id") state.lastTent = val;
      return chain;
    },
  };
  return {
    from: () => chain,
    get _lastTent() {
      return state.lastTent;
    },
  } as { from: (t: string) => unknown; _lastTent?: string };
}

describe("loadManualSensorCandidates", () => {
  it("returns loaded=empty when growId missing", async () => {
    const client = makeClient([]);
    const r = await loadManualSensorCandidates({
      context: { growId: "", tentId: null, plantId: null },
      client: client as never,
    });
    expect(r.status).toBe("loaded");
    if (r.status === "loaded") expect(r.candidates).toEqual([]);
  });

  it("sanitizes raw provider errors into query_failed", async () => {
    const client = makeClient(null, { message: "postgres exploded", code: "42501" });
    const r = await loadManualSensorCandidates({
      context: { growId: "g-1", tentId: "t-1", plantId: null },
      client: client as never,
    });
    expect(r.status).toBe("failed");
    if (r.status === "failed") expect(r.reason).toBe("query_failed");
  });

  it("scopes the query to tent_id when the action has a tent", async () => {
    const client = makeClient([]);
    await loadManualSensorCandidates({
      context: { growId: "g-1", tentId: "t-42", plantId: null },
      client: client as never,
    });
    expect((client as { _lastTent?: string })._lastTent).toBe("t-42");
  });
});

describe("loadManualSensorSnapshotById", () => {
  it("returns null for empty id", async () => {
    expect(await loadManualSensorSnapshotById("")).toBeNull();
  });

  it("returns null when the row is missing", async () => {
    const client = makeClient([]);
    expect(
      await loadManualSensorSnapshotById("missing", client as never),
    ).toBeNull();
  });

  it("returns null on provider error", async () => {
    const client = makeClient(null, { message: "boom" });
    expect(
      await loadManualSensorSnapshotById("sn-1", client as never),
    ).toBeNull();
  });
});

// =============================================================================
// Selector UI
// =============================================================================

describe("ActionFollowUpManualSensorSelector", () => {
  it("renders No sensor snapshot by default (no preselection)", () => {
    const onChange = vi.fn();
    render(
      <ActionFollowUpManualSensorSelector
        status="loaded"
        candidates={[cardFixture({ id: "sn-a" })]}
        value={null}
        onChange={onChange}
      />,
    );
    const select = screen.getByTestId(
      "action-followup-manual-sensor-select",
    ) as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByRole("option", { name: /no sensor snapshot/i })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("meets 44px minimum control height", () => {
    render(
      <ActionFollowUpManualSensorSelector
        status="loaded"
        candidates={[]}
        value={null}
        onChange={vi.fn()}
      />,
    );
    const select = screen.getByTestId(
      "action-followup-manual-sensor-select",
    );
    expect(select.className).toContain("min-h-[44px]");
  });

  it("lists Manual candidates with captured time and metrics", () => {
    render(
      <ActionFollowUpManualSensorSelector
        status="loaded"
        candidates={[cardFixture({ id: "sn-1" })]}
        value={null}
        onChange={vi.fn()}
      />,
    );
    const option = screen.getByRole("option", { name: /Manual/i });
    expect(option.textContent).toMatch(/Manual/);
    expect(option.textContent).toMatch(/RH/);
    expect(option.textContent).toMatch(/kPa/);
    // Never labels a Manual candidate as Live.
    expect(option.textContent?.toLowerCase()).not.toContain("live");
    // Raw ID is not visible in the option label.
    expect(option.textContent).not.toContain("sn-1");
  });

  it("shows empty state and preserves core form usability", () => {
    render(
      <ActionFollowUpManualSensorSelector
        status="loaded"
        candidates={[]}
        value={null}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("action-followup-manual-sensor-empty"),
    ).toBeInTheDocument();
  });

  it("shows sanitized error copy and preserves core form usability", () => {
    render(
      <ActionFollowUpManualSensorSelector
        status="error"
        candidates={[]}
        value={null}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("action-followup-manual-sensor-error"),
    ).toBeInTheDocument();
  });

  it("emits null when the grower reverts to the default option", () => {
    const onChange = vi.fn();
    render(
      <ActionFollowUpManualSensorSelector
        status="loaded"
        candidates={[cardFixture({ id: "sn-1" })]}
        value="sn-1"
        onChange={onChange}
      />,
    );
    const select = screen.getByTestId(
      "action-followup-manual-sensor-select",
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

// =============================================================================
// Evidence card
// =============================================================================

describe("ActionFollowUpManualSensorEvidence", () => {
  it("renders Manual source badge and captured time", () => {
    render(
      <ActionFollowUpManualSensorEvidence
        state={{ status: "ready", card: cardFixture() }}
      />,
    );
    const badge = screen.getByTestId("action-followup-manual-sensor-source");
    expect(badge.getAttribute("data-source")).toBe("manual");
    expect(badge.textContent?.toLowerCase()).not.toContain("live");
    expect(
      screen.getByTestId("action-followup-manual-sensor-captured-at"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("action-followup-manual-sensor-metric-air_temp_c"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("action-followup-manual-sensor-metric-humidity_pct"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("action-followup-manual-sensor-metric-vpd_kpa"),
    ).toBeInTheDocument();
  });

  it("does not display the raw snapshot ID", () => {
    render(
      <ActionFollowUpManualSensorEvidence
        state={{ status: "ready", card: cardFixture({ id: "sn-secret" }) }}
      />,
    );
    expect(
      screen.getByTestId("action-followup-manual-sensor-evidence").textContent,
    ).not.toContain("sn-secret");
  });

  it("renders unavailable copy when the snapshot is missing", () => {
    render(<ActionFollowUpManualSensorEvidence state={{ status: "unavailable" }} />);
    expect(
      screen.getByTestId("action-followup-manual-sensor-unavailable").textContent,
    ).toBe(ACTION_FOLLOWUP_SENSOR_UNAVAILABLE_COPY);
  });
});

// =============================================================================
// Section integration
// =============================================================================

const BASE_ACTION = {
  id: "aq-1",
  status: "completed",
  growId: "g-1",
  tentId: "t-1",
  plantId: "p-1",
  actionLabel: "Lower humidity to 55%",
};

describe("ActionFollowUpEvidenceSection — Slice 4b integration", () => {
  it("renders the selector, passes selected snapshot ID exactly through save", async () => {
    const save = vi
      .fn()
      .mockResolvedValue({
        status: "created",
        followUp: {
          diaryEntryId: "de-1",
          actionQueueId: "aq-1",
          growId: "g-1",
          tentId: "t-1",
          plantId: "p-1",
          outcome: "improved",
          note: "n",
          observedAt: "2026-07-11T18:30:00.000Z",
          photoReference: null,
          sensorSnapshotId: "sn-1",
          idempotencyKey: "action-followup:aq-1",
        } satisfies ActionFollowUpEvidenceRecord,
      });
    const loadCandidates = vi
      .fn()
      .mockResolvedValue({
        status: "loaded",
        candidates: [cardFixture({ id: "sn-1" })],
      });
    render(
      <ActionFollowUpEvidenceSection
        action={BASE_ACTION}
        save={save}
        loadCandidates={loadCandidates}
        loadSnapshotById={vi.fn().mockResolvedValue(cardFixture({ id: "sn-1" }))}
      />,
    );
    await waitFor(() => screen.getByTestId("action-followup-add-btn"));
    await userEvent.click(screen.getByTestId("action-followup-add-btn"));
    await waitFor(() => screen.getByTestId("action-followup-manual-sensor-select"));
    await userEvent.click(screen.getByTestId("action-followup-outcome-improved"));
    fireEvent.change(
      screen.getByTestId("action-followup-manual-sensor-select"),
      { target: { value: "sn-1" } },
    );
    await userEvent.click(screen.getByTestId("action-followup-submit"));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const draft = save.mock.calls[0][0];
    expect(draft.sensorSnapshotId).toBe("sn-1");
  });

  it("passes null when no snapshot is selected", async () => {
    const save = vi
      .fn()
      .mockResolvedValue({
        status: "created",
        followUp: {
          diaryEntryId: "de-1",
          actionQueueId: "aq-1",
          growId: "g-1",
          tentId: "t-1",
          plantId: "p-1",
          outcome: "improved",
          note: "n",
          observedAt: "2026-07-11T18:30:00.000Z",
          photoReference: null,
          sensorSnapshotId: null,
          idempotencyKey: "action-followup:aq-1",
        } satisfies ActionFollowUpEvidenceRecord,
      });
    const loadCandidates = vi
      .fn()
      .mockResolvedValue({ status: "loaded", candidates: [] });
    render(
      <ActionFollowUpEvidenceSection
        action={BASE_ACTION}
        save={save}
        loadCandidates={loadCandidates}
      />,
    );
    await waitFor(() => screen.getByTestId("action-followup-add-btn"));
    await userEvent.click(screen.getByTestId("action-followup-add-btn"));
    await waitFor(() => screen.getByTestId("action-followup-outcome-improved"));
    await userEvent.click(screen.getByTestId("action-followup-outcome-improved"));
    await userEvent.click(screen.getByTestId("action-followup-submit"));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].sensorSnapshotId).toBeNull();
  });

  it("passes null when the candidate query fails, and still submits", async () => {
    const save = vi.fn().mockResolvedValue({
      status: "created",
      followUp: {
        diaryEntryId: "de-1",
        actionQueueId: "aq-1",
        growId: "g-1",
        tentId: "t-1",
        plantId: "p-1",
        outcome: "improved",
        note: "n",
        observedAt: "2026-07-11T18:30:00.000Z",
        photoReference: null,
        sensorSnapshotId: null,
        idempotencyKey: "action-followup:aq-1",
      } satisfies ActionFollowUpEvidenceRecord,
    });
    const loadCandidates = vi
      .fn()
      .mockResolvedValue({ status: "failed", reason: "query_failed" });
    render(
      <ActionFollowUpEvidenceSection
        action={BASE_ACTION}
        save={save}
        loadCandidates={loadCandidates}
      />,
    );
    await waitFor(() => screen.getByTestId("action-followup-add-btn"));
    await userEvent.click(screen.getByTestId("action-followup-add-btn"));
    await waitFor(() =>
      screen.getByTestId("action-followup-manual-sensor-error"),
    );
    await userEvent.click(screen.getByTestId("action-followup-outcome-improved"));
    await userEvent.click(screen.getByTestId("action-followup-submit"));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].sensorSnapshotId).toBeNull();
  });

  it("renders the associated sensor evidence for an existing follow-up with snapshot", async () => {
    existingFollowUpRows = [
      {
        id: "de-1",
        grow_id: "g-1",
        tent_id: "t-1",
        plant_id: "p-1",
        note: "",
        details: {
          event_type: "action_followup",
          action_queue_id: "aq-1",
          outcome: "improved",
          observed_at: "2026-07-11T18:30:00.000Z",
          sensor_snapshot_id: "sn-1",
        },
      },
    ];
    const loadSnapshotById = vi
      .fn()
      .mockResolvedValue(cardFixture({ id: "sn-1" }));
    render(
      <ActionFollowUpEvidenceSection
        action={BASE_ACTION}
        save={vi.fn()}
        loadCandidates={vi
          .fn()
          .mockResolvedValue({ status: "loaded", candidates: [] })}
        loadSnapshotById={loadSnapshotById}
      />,
    );
    await waitFor(() =>
      screen.getByTestId("action-followup-manual-sensor-source"),
    );
    expect(loadSnapshotById).toHaveBeenCalledWith("sn-1");
    expect(
      screen.getByTestId("action-followup-manual-sensor-source").getAttribute("data-source"),
    ).toBe("manual");
  });

  it("shows unavailable copy when the associated snapshot cannot be resolved", async () => {
    existingFollowUpRows = [
      {
        id: "de-1",
        grow_id: "g-1",
        tent_id: "t-1",
        plant_id: "p-1",
        note: "",
        details: {
          event_type: "action_followup",
          action_queue_id: "aq-1",
          outcome: "improved",
          observed_at: "2026-07-11T18:30:00.000Z",
          sensor_snapshot_id: "sn-missing",
        },
      },
    ];
    render(
      <ActionFollowUpEvidenceSection
        action={BASE_ACTION}
        save={vi.fn()}
        loadCandidates={vi
          .fn()
          .mockResolvedValue({ status: "loaded", candidates: [] })}
        loadSnapshotById={vi.fn().mockResolvedValue(null)}
      />,
    );
    await waitFor(() =>
      screen.getByTestId("action-followup-manual-sensor-unavailable"),
    );
    // Outcome card is still rendered — unavailable evidence doesn't hide it.
    expect(screen.getByTestId("action-followup-card")).toBeInTheDocument();
  });
});

// =============================================================================
// Static safety fences
// =============================================================================

describe("Slice 4b static safety fences", () => {
  const ROOT = resolve(__dirname, "../..");
  const files = [
    "src/lib/actionFollowUpManualSensorRules.ts",
    "src/lib/actionFollowUpManualSensorService.ts",
    "src/components/ActionFollowUpManualSensorSelector.tsx",
    "src/components/ActionFollowUpManualSensorEvidence.tsx",
  ];

  function readAll(): string {
    return files
      .map((f) => readFileSync(resolve(ROOT, f), "utf8"))
      .join("\n");
  }

  it("never inserts, updates, or deletes sensor rows", () => {
    const src = readAll();
    expect(src).not.toMatch(/from\(["']sensor_readings["']\)\s*\.\s*(insert|update|upsert|delete)/);
    expect(src).not.toMatch(/from\(["']diary_entries["']\)\s*\.\s*(insert|update|upsert|delete)/);
  });

  it("never imports a service-role client", () => {
    const src = readAll();
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE|service_role/);
  });

  it("never imports device-control or AI-model helpers", () => {
    const src = readAll();
    expect(src).not.toMatch(/device.*control|deviceCommand|executeDevice/i);
    expect(src).not.toMatch(/ai-doctor-review|ai-coach|openai|anthropic/i);
  });
});
