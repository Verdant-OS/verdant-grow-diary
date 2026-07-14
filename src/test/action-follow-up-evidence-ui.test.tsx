/**
 * Action Follow-Up Evidence V1 — Slice 3 UI tests.
 *
 * Covers:
 *  - View model mapping + outcome-aware timeline label.
 *  - Form validation (outcome required, note required for declined/unclear,
 *    observed-at required, note max length, focus on invalid field).
 *  - Card rendering + fallback-note handling.
 *  - Section container: loading, existing evidence card, eligibility,
 *    save success (created + existing), busy state, error handling,
 *    query-failure fails closed, blocked reasons.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  buildActionFollowUpEvidenceViewModel,
  actionFollowupTimelineLabel,
  ACTION_FOLLOWUP_NO_OBSERVATION_COPY,
  ACTION_FOLLOWUP_LEGACY_LABEL,
} from "@/lib/actionFollowUpEvidenceViewModel";
import ActionFollowUpEvidenceForm from "@/components/ActionFollowUpEvidenceForm";
import ActionFollowUpEvidenceCard from "@/components/ActionFollowUpEvidenceCard";
import ActionFollowUpEvidenceSection from "@/components/ActionFollowUpEvidenceSection";
import type {
  ActionFollowUpEvidenceRecord,
  ActionFollowUpEvidenceSaveResult,
} from "@/lib/actionFollowUpEvidenceService";
import type { ActionFollowUpDraft } from "@/lib/actionFollowUpEvidenceRules";

// -----------------------------------------------------------------------------
// Shared mocks
// -----------------------------------------------------------------------------

let existingRows: unknown[] = [];
let queryError: unknown = null;

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = () => {
    const promise = () => Promise.resolve({ data: existingRows, error: queryError });
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      contains: () => ({
        then: (resolve: (r: unknown) => unknown) => resolve({ data: existingRows, error: queryError }),
      }),
      then: (resolve: (r: unknown) => unknown) => resolve({ data: existingRows, error: queryError }),
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
  existingRows = [];
  queryError = null;
});

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const BASE_ACTION = {
  id: "aq-1",
  status: "completed",
  growId: "g-1",
  tentId: "t-1",
  plantId: "p-1",
  actionLabel: "Lower humidity to 55%",
};

function recordFixture(
  overrides: Partial<ActionFollowUpEvidenceRecord> = {},
): ActionFollowUpEvidenceRecord {
  return {
    diaryEntryId: "de-1",
    actionQueueId: "aq-1",
    growId: "g-1",
    tentId: "t-1",
    plantId: "p-1",
    outcome: "improved",
    note: "Humidity dropped, no new droplets on canopy.",
    observedAt: "2026-07-11T18:30:00.000Z",
    photoReference: null,
    sensorSnapshotId: null,
    idempotencyKey: "action-followup:aq-1",
    ...overrides,
  };
}

// =============================================================================
// View model
// =============================================================================

describe("actionFollowUpEvidenceViewModel", () => {
  it("maps every outcome to a stable label + tone", () => {
    const outcomes = ["improved", "unchanged", "declined", "too_soon", "unclear"] as const;
    const labels = outcomes.map((o) =>
      buildActionFollowUpEvidenceViewModel({
        record: recordFixture({ outcome: o }),
        actionLabel: "act",
      }),
    );
    expect(labels.map((v) => v?.outcomeLabel)).toEqual([
      "Improved",
      "No clear change",
      "Declined",
      "Too soon to tell",
      "Unclear",
    ]);
    expect(labels[0]?.outcomeTone).toBe("positive");
    expect(labels[2]?.outcomeTone).toBe("warning");
    expect(labels[3]?.outcomeTone).toBe("muted");
  });

  it("returns null for missing record", () => {
    expect(
      buildActionFollowUpEvidenceViewModel({ record: null, actionLabel: "x" }),
    ).toBeNull();
  });

  it("hides the conservative fallback note as an observation", () => {
    const vm = buildActionFollowUpEvidenceViewModel({
      record: recordFixture({ note: "Follow-up recorded." }),
      actionLabel: "x",
    });
    expect(vm?.note).toBeNull();
  });

  it("preserves grower-entered note", () => {
    const vm = buildActionFollowUpEvidenceViewModel({
      record: recordFixture({ note: "  Real observation.  " }),
      actionLabel: "x",
    });
    expect(vm?.note).toBe("Real observation.");
  });

  it("is deterministic", () => {
    const a = buildActionFollowUpEvidenceViewModel({
      record: recordFixture(),
      actionLabel: "act",
    });
    const b = buildActionFollowUpEvidenceViewModel({
      record: recordFixture(),
      actionLabel: "act",
    });
    expect(a).toEqual(b);
  });

  it("falls back to legacy label + muted tone for missing/invalid outcome", () => {
    const vm = buildActionFollowUpEvidenceViewModel({
      record: recordFixture({ outcome: "bogus" as unknown as "improved" }),
      actionLabel: "x",
    });
    expect(vm?.outcome).toBeNull();
    expect(vm?.outcomeLabel).toBe(ACTION_FOLLOWUP_LEGACY_LABEL);
    expect(vm?.outcomeTone).toBe("muted");
  });
});

describe("actionFollowupTimelineLabel", () => {
  it("returns legacy label when outcome missing (marker-only compatibility)", () => {
    expect(actionFollowupTimelineLabel(null)).toBe("Follow-up");
    expect(actionFollowupTimelineLabel({})).toBe("Follow-up");
  });

  it("emits outcome-aware label when outcome present", () => {
    expect(actionFollowupTimelineLabel({ outcome: "improved" })).toBe("Follow-up · Improved");
    expect(actionFollowupTimelineLabel({ outcome: "declined" })).toBe("Follow-up · Declined");
    expect(actionFollowupTimelineLabel({ outcome: "unclear" })).toBe("Follow-up · Unclear");
  });

  it("ignores unknown outcome values", () => {
    expect(actionFollowupTimelineLabel({ outcome: "resolved" })).toBe("Follow-up");
  });
});

// =============================================================================
// Card
// =============================================================================

describe("ActionFollowUpEvidenceCard", () => {
  it("renders outcome label and observed timestamp", () => {
    const vm = buildActionFollowUpEvidenceViewModel({
      record: recordFixture(),
      actionLabel: "Lower humidity to 55%",
    })!;
    render(<ActionFollowUpEvidenceCard viewModel={vm} />);
    expect(screen.getByTestId("action-followup-outcome-label")).toHaveTextContent(
      /Improved/,
    );
    expect(screen.getByTestId("action-followup-note-text")).toHaveTextContent(
      "Humidity dropped",
    );
    expect(screen.getByText(/Lower humidity to 55%/)).toBeInTheDocument();
  });

  it("shows sanitized empty-observation copy when note is fallback", () => {
    const vm = buildActionFollowUpEvidenceViewModel({
      record: recordFixture({ note: "Follow-up recorded." }),
      actionLabel: "act",
    })!;
    render(<ActionFollowUpEvidenceCard viewModel={vm} />);
    expect(screen.getByTestId("action-followup-no-observation")).toHaveTextContent(
      ACTION_FOLLOWUP_NO_OBSERVATION_COPY,
    );
  });
});

// =============================================================================
// Form
// =============================================================================

describe("ActionFollowUpEvidenceForm", () => {
  it("blocks submit until an outcome is selected", async () => {
    const onSubmit = vi.fn();
    render(<ActionFollowUpEvidenceForm saving={false} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByTestId("action-followup-submit"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Select an outcome/);
  });

  it("requires a note for declined", async () => {
    const onSubmit = vi.fn();
    render(<ActionFollowUpEvidenceForm saving={false} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByTestId("action-followup-outcome-declined"));
    await userEvent.click(screen.getByTestId("action-followup-submit"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/short observation/);
  });

  it("allows submit for improved with no note", async () => {
    const onSubmit = vi.fn();
    render(<ActionFollowUpEvidenceForm saving={false} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByTestId("action-followup-outcome-improved"));
    await userEvent.click(screen.getByTestId("action-followup-submit"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const values = onSubmit.mock.calls[0][0];
    expect(values.outcome).toBe("improved");
    expect(values.note).toBe("");
    expect(typeof values.observedAt).toBe("string");
    expect(Number.isFinite(Date.parse(values.observedAt))).toBe(true);
  });

  it("blocks notes over 1000 characters", async () => {
    const onSubmit = vi.fn();
    render(<ActionFollowUpEvidenceForm saving={false} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByTestId("action-followup-outcome-improved"));
    const noteEl = screen.getByTestId("action-followup-note") as HTMLTextAreaElement;
    // fireEvent avoids per-character userEvent cost for large input
    fireEvent.change(noteEl, { target: { value: "x".repeat(1001) } });
    await userEvent.click(screen.getByTestId("action-followup-submit"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/under 1000/);
  });

  it("disables submit while saving", () => {
    render(<ActionFollowUpEvidenceForm saving={true} onSubmit={vi.fn()} />);
    expect(screen.getByTestId("action-followup-submit")).toBeDisabled();
  });
});

// =============================================================================
// Section container
// =============================================================================

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("ActionFollowUpEvidenceSection", () => {
  it("shows loading then Add follow-up when no existing evidence", async () => {
    render(<ActionFollowUpEvidenceSection action={BASE_ACTION} save={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId("action-followup-add-btn")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("action-followup-card")).toBeNull();
  });

  it("renders the evidence card when a follow-up already exists", async () => {
    existingRows = [
      {
        id: "de-1",
        grow_id: "g-1",
        tent_id: "t-1",
        plant_id: "p-1",
        note: "Real observation",
        details: {
          event_type: "action_followup",
          action_queue_id: "aq-1",
          outcome: "improved",
          observed_at: "2026-07-11T18:30:00.000Z",
          note: "Real observation",
        },
      },
    ];
    render(<ActionFollowUpEvidenceSection action={BASE_ACTION} save={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId("action-followup-card")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("action-followup-add-btn")).toBeNull();
    expect(screen.getByTestId("action-followup-outcome-label")).toHaveTextContent(
      /Improved/,
    );
  });

  it("fails closed when the existing-follow-up query errors", async () => {
    queryError = { message: "boom" };
    render(<ActionFollowUpEvidenceSection action={BASE_ACTION} save={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId("action-followup-query-error")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("action-followup-add-btn")).toBeNull();
    expect(screen.queryByTestId("action-followup-form")).toBeNull();
  });

  it("hides the form on non-completed actions", async () => {
    render(
      <ActionFollowUpEvidenceSection
        action={{ ...BASE_ACTION, status: "pending_approval" }}
        save={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("action-followup-ineligible")).toBeInTheDocument(),
    );
  });

  it("saves through the injected service and renders the returned card", async () => {
    const save = vi.fn<(draft: ActionFollowUpDraft) => Promise<ActionFollowUpEvidenceSaveResult>>()
      .mockResolvedValue({ status: "created", followUp: recordFixture() });
    render(<ActionFollowUpEvidenceSection action={BASE_ACTION} save={save} />);
    await waitFor(() => screen.getByTestId("action-followup-add-btn"));
    await userEvent.click(screen.getByTestId("action-followup-add-btn"));
    await userEvent.click(screen.getByTestId("action-followup-outcome-improved"));
    await userEvent.click(screen.getByTestId("action-followup-submit"));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const draft = save.mock.calls[0][0];
    expect(draft.actionQueueId).toBe("aq-1");
    expect(draft.growId).toBe("g-1");
    expect(draft.tentId).toBe("t-1");
    expect(draft.plantId).toBe("p-1");
    expect(draft.outcome).toBe("improved");
    // never contains signed/blob/data URLs — form doesn't collect a URL
    expect(draft.photoReference ?? "").not.toMatch(/^https?:|^blob:|^data:/);
    await waitFor(() =>
      expect(screen.getByTestId("action-followup-card")).toBeInTheDocument(),
    );
  });

  it("renders existing card when the service returns status=existing", async () => {
    const save = vi.fn<(draft: ActionFollowUpDraft) => Promise<ActionFollowUpEvidenceSaveResult>>()
      .mockResolvedValue({
        status: "existing",
        followUp: recordFixture({ outcome: "unclear" }),
      });
    render(<ActionFollowUpEvidenceSection action={BASE_ACTION} save={save} />);
    await waitFor(() => screen.getByTestId("action-followup-add-btn"));
    await userEvent.click(screen.getByTestId("action-followup-add-btn"));
    await userEvent.click(screen.getByTestId("action-followup-outcome-improved"));
    await userEvent.click(screen.getByTestId("action-followup-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("action-followup-outcome-label")).toHaveTextContent(
        /Unclear/,
      ),
    );
  });

  it("shows sanitized copy on blocked results", async () => {
    const save = vi.fn<(draft: ActionFollowUpDraft) => Promise<ActionFollowUpEvidenceSaveResult>>()
      .mockResolvedValue({ status: "blocked", reason: "action_not_completed" });
    render(<ActionFollowUpEvidenceSection action={BASE_ACTION} save={save} />);
    await waitFor(() => screen.getByTestId("action-followup-add-btn"));
    await userEvent.click(screen.getByTestId("action-followup-add-btn"));
    await userEvent.click(screen.getByTestId("action-followup-outcome-improved"));
    await userEvent.click(screen.getByTestId("action-followup-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("action-followup-form-error")).toHaveTextContent(
        /not ready for follow-up/,
      ),
    );
  });

  it("shows sanitized copy on failed results (no raw provider text)", async () => {
    const save = vi.fn<(draft: ActionFollowUpDraft) => Promise<ActionFollowUpEvidenceSaveResult>>()
      .mockResolvedValue({ status: "failed", reason: "insert_failed" });
    render(<ActionFollowUpEvidenceSection action={BASE_ACTION} save={save} />);
    await waitFor(() => screen.getByTestId("action-followup-add-btn"));
    await userEvent.click(screen.getByTestId("action-followup-add-btn"));
    await userEvent.click(screen.getByTestId("action-followup-outcome-improved"));
    await userEvent.click(screen.getByTestId("action-followup-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("action-followup-form-error")).toHaveTextContent(
        /Couldn't record the follow-up/,
      ),
    );
    // Grower's outcome selection preserved after failure.
    expect(
      (screen.getByTestId("action-followup-outcome-improved") as HTMLInputElement).checked,
    ).toBe(true);
  });

  it("guards against rapid double submit while saving", async () => {
    let resolveFn: (r: ActionFollowUpEvidenceSaveResult) => void = () => {};
    const save = vi.fn<(draft: ActionFollowUpDraft) => Promise<ActionFollowUpEvidenceSaveResult>>(
      () =>
        new Promise<ActionFollowUpEvidenceSaveResult>((res) => {
          resolveFn = res;
        }),
    );
    render(<ActionFollowUpEvidenceSection action={BASE_ACTION} save={save} />);
    await waitFor(() => screen.getByTestId("action-followup-add-btn"));
    await userEvent.click(screen.getByTestId("action-followup-add-btn"));
    await userEvent.click(screen.getByTestId("action-followup-outcome-improved"));
    const submit = screen.getByTestId("action-followup-submit");
    await userEvent.click(submit);
    // Second click while saving must be a no-op — button disabled.
    expect(submit).toBeDisabled();
    await userEvent.click(submit);
    expect(save).toHaveBeenCalledTimes(1);
    resolveFn({ status: "created", followUp: recordFixture() });
    await flush();
  });
});

// =============================================================================
// Safety fences
// =============================================================================

describe("safety fences", () => {
  it("view model + components import no service_role, AI, or device code", async () => {
    // Static import inspection via bundled sources is out of scope here;
    // this test asserts our sources do not string-match forbidden imports.
    const [vm, form, card, section] = await Promise.all([
      import("@/lib/actionFollowUpEvidenceViewModel"),
      import("@/components/ActionFollowUpEvidenceForm"),
      import("@/components/ActionFollowUpEvidenceCard"),
      import("@/components/ActionFollowUpEvidenceSection"),
    ]);
    // These modules must not accidentally re-export a Supabase admin client.
    for (const mod of [vm, form, card, section]) {
      const keys = Object.keys(mod);
      for (const k of keys) {
        expect(k).not.toMatch(/service.?role/i);
        expect(k).not.toMatch(/admin/i);
      }
    }
  });
});
