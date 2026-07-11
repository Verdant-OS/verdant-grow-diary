/**
 * Milestone 5 — shared ActionResponseMemoryCard presenter + view model.
 *
 * Covers: shared outcome-label parity, note/outcome persistence when the
 * photo is unavailable, historical-only copy, no causal language, safe
 * Action Detail link, no internal-id/storage-path text, tap-target size,
 * and accessibility names.
 */
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActionResponseMemoryCard from "../components/ActionResponseMemoryCard";
import {
  buildActionResponseMemoryCardViewModel,
  ACTION_RESPONSE_PHOTO_UNAVAILABLE_COPY,
  toActionFollowUpEvidenceViewModel,
} from "../lib/actionResponseMemoryViewModel";
import {
  buildActionResponseMemories,
  ACTION_RESPONSE_MEMORY_HISTORICAL_COPY,
  type ActionResponseMemory,
} from "../lib/actionResponseMemoryRules";
import { actionFollowUpOutcomeLabel } from "../lib/actionFollowUpEvidenceViewModel";
import { ACTION_FOLLOWUP_OUTCOMES } from "../lib/actionFollowUpEvidenceRules";

afterEach(cleanup);

const ROW_ID = "row-internal-11111111";
const ACTION_ID = "act-internal-22222222";
const SNAP_ID = "snap-internal-33333333";
const STORAGE_REF = "storage://diary-photos/u1/g1/plant-profiles/p1/leaf.jpg";

function memory(over?: {
  outcome?: (typeof ACTION_FOLLOWUP_OUTCOMES)[number];
  photoReference?: string | null;
  sensorSnapshotId?: string | null;
}): ActionResponseMemory {
  const memories = buildActionResponseMemories({
    responseRows: [
      {
        id: ROW_ID,
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        entry_at: "2026-07-02T13:00:00Z",
        details: {
          event_type: "action_followup",
          action_queue_id: ACTION_ID,
          outcome: over?.outcome ?? "improved",
          observed_at: "2026-07-02T12:00:00Z",
          note: "New growth looks steadier this morning.",
          photo_reference: over?.photoReference ?? null,
          sensor_snapshot_id: over?.sensorSnapshotId ?? null,
        },
      },
    ],
    actions: [
      {
        id: ACTION_ID,
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        status: "completed",
        suggested_change: "Raise the light a few inches",
        completed_at: "2026-07-01T12:00:00Z",
      },
    ],
    sensorRows: over?.sensorSnapshotId
      ? [{ id: over.sensorSnapshotId, tent_id: "tent-1", source: "manual", captured_at: "2026-07-02T11:00:00Z" }]
      : [],
  });
  return memories[0];
}

function renderCard(m: ActionResponseMemory, props?: Record<string, unknown>) {
  const vm = buildActionResponseMemoryCardViewModel({ memory: m })!;
  return render(
    <MemoryRouter>
      <ActionResponseMemoryCard viewModel={vm} {...props} />
    </MemoryRouter>,
  );
}

describe("shared outcome label parity", () => {
  it("1. every outcome renders the same label the centralized mapping produces", () => {
    for (const outcome of ACTION_FOLLOWUP_OUTCOMES) {
      const { unmount } = renderCard(memory({ outcome }));
      expect(screen.getByTestId("action-response-memory-outcome").textContent).toBe(
        actionFollowUpOutcomeLabel(outcome),
      );
      unmount();
    }
  });

  it("1b. the Action Detail adapter uses the identical mapping (surface parity)", () => {
    for (const outcome of ACTION_FOLLOWUP_OUTCOMES) {
      const adapted = toActionFollowUpEvidenceViewModel({ memory: memory({ outcome }) });
      const shared = buildActionResponseMemoryCardViewModel({ memory: memory({ outcome }) })!;
      expect(adapted.outcomeLabel).toBe(shared.outcomeLabel);
      expect(adapted.outcomeTone).toBe(shared.outcomeTone);
    }
  });
});

describe("evidence resilience", () => {
  it("2. note and outcome remain visible when the photo is unavailable", () => {
    renderCard(memory({ photoReference: "https://cdn.example/signed?token=zzz" }));
    expect(screen.getByTestId("action-response-memory-photo-unavailable").textContent).toBe(
      ACTION_RESPONSE_PHOTO_UNAVAILABLE_COPY,
    );
    expect(screen.getByTestId("action-response-memory-outcome")).toBeTruthy();
    expect(screen.getByTestId("action-response-memory-note").textContent).toContain(
      "New growth looks steadier",
    );
  });

  it("2b. sensor evidence renders honestly alongside an unavailable photo", () => {
    renderCard(memory({ photoReference: "blob:x", sensorSnapshotId: SNAP_ID }));
    expect(screen.getByTestId("action-response-memory-sensor-line")).toBeTruthy();
    expect(screen.getByTestId("action-response-memory-photo-unavailable")).toBeTruthy();
  });
});

describe("historical-only truth", () => {
  it("3. the historical-evidence warning is always visible", () => {
    renderCard(memory());
    expect(screen.getByTestId("action-response-memory-historical-note").textContent).toBe(
      ACTION_RESPONSE_MEMORY_HISTORICAL_COPY,
    );
  });

  it("4. rendered text carries no causal language", () => {
    const { container } = renderCard(memory({ sensorSnapshotId: SNAP_ID }));
    const text = container.textContent ?? "";
    expect(text).not.toMatch(
      /\bworked\b|\bfixed\b|\bcured\b|\bproved\b|\bcaused\b|successful treatment|confirmed resolution/i,
    );
    // Historical sensor evidence is never presented as current/live.
    expect(text).not.toMatch(/\bcurrent conditions\b|\blive right now\b/i);
  });
});

describe("links and internal ids", () => {
  it("5. the View action link targets the authoritative Action Detail route", () => {
    renderCard(memory());
    const link = screen.getByTestId("action-response-memory-view-action");
    expect(link.getAttribute("href")).toBe(`/actions/${ACTION_ID}`);
    expect(link.textContent).toContain("View action");
  });

  it("6. no internal id or storage path appears as visible or accessible text", () => {
    const { container } = renderCard(memory({ photoReference: STORAGE_REF, sensorSnapshotId: SNAP_ID }));
    const text = container.textContent ?? "";
    expect(text).not.toContain(ROW_ID);
    expect(text).not.toContain(ACTION_ID);
    expect(text).not.toContain(SNAP_ID);
    expect(text).not.toContain("storage://");
    for (const el of Array.from(container.querySelectorAll("[aria-label]"))) {
      const label = el.getAttribute("aria-label") ?? "";
      expect(label).not.toContain(ACTION_ID);
      expect(label).not.toContain(STORAGE_REF);
    }
  });

  it("9. the internal link meets the 44px minimum tap target", () => {
    renderCard(memory());
    const link = screen.getByTestId("action-response-memory-view-action");
    expect(link.className).toContain("min-h-11");
  });
});

describe("variants and controls", () => {
  it("compact variant renders no photo slot and no link row", () => {
    renderCard(memory({ photoReference: STORAGE_REF }), {
      variant: "compact",
      showActionLink: false,
      photoEvidenceSlot: <div data-testid="should-not-render" />,
    });
    expect(screen.queryByTestId("should-not-render")).toBeNull();
    expect(screen.queryByTestId("action-response-memory-view-action")).toBeNull();
    expect(screen.getByTestId("action-response-memory-historical-note")).toBeTruthy();
  });

  it("7-8. offers no edit/complete/approve/reject/upload/AI controls; a11y roles intact", () => {
    const { container } = renderCard(memory());
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\bApprove\b|\bReject\b|\bComplete\b|\bUpload\b|\bAsk AI\b/);
    // The historical warning is exposed as a note role for screen readers.
    expect(screen.getByRole("note").textContent).toBe(ACTION_RESPONSE_MEMORY_HISTORICAL_COPY);
  });
});
