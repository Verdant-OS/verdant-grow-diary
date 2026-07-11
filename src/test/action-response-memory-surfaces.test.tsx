/**
 * Milestone 5 — cross-surface regressions + static safety for the canonical
 * Action Response Memory integrations (Action Detail / Timeline / Plant
 * Detail) and a forbidden-surface scan of every new M5 file.
 */
import { describe, expect, it, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  buildActionResponseMemories,
  isActionResponseCandidateDetails,
  selectRecentPlantActionResponse,
} from "../lib/actionResponseMemoryRules";
import { buildActionResponseMemoryCardViewModel, toActionFollowUpEvidenceViewModel } from "../lib/actionResponseMemoryViewModel";
import { stripSourceComments } from "./utils/stripSourceComments";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const TIMELINE_SRC = read("src/pages/Timeline.tsx");
const PLANT_DETAIL_SRC = read("src/pages/PlantDetail.tsx");
const SECTION_SRC = read("src/components/ActionFollowUpEvidenceSection.tsx");

const RESPONSE_ROW = {
  id: "row-1",
  grow_id: "grow-1",
  tent_id: "tent-1",
  plant_id: "plant-1",
  entry_at: "2026-07-02T13:00:00Z",
  details: {
    event_type: "action_followup",
    action_queue_id: "act-1",
    outcome: "improved",
    observed_at: "2026-07-02T12:00:00Z",
    note: "Perked up.",
  },
};
const MARKER_ROW = {
  id: "marker-1",
  grow_id: "grow-1",
  tent_id: "tent-1",
  plant_id: "plant-1",
  entry_at: "2026-07-01T12:05:00Z",
  details: {
    event_type: "action_followup",
    action_queue_id: "act-1",
    followup_kind: "24h_recheck",
  },
};
const ACTION_ROW = {
  id: "act-1",
  grow_id: "grow-1",
  tent_id: "tent-1",
  plant_id: "plant-1",
  status: "completed",
  suggested_change: "Vent more",
  completed_at: "2026-07-01T12:00:00Z",
};

describe("1. one canonical response → one Timeline response event", () => {
  it("the canonical model yields exactly one memory per response, keyed to its own row", () => {
    const memories = buildActionResponseMemories({
      responseRows: [RESPONSE_ROW, MARKER_ROW],
      actions: [ACTION_ROW],
      sensorRows: [],
    });
    expect(memories).toHaveLength(1);
    expect(memories[0].response.rowId).toBe("row-1");
  });

  it("Timeline renders the compact card INSIDE the row (map by row id, no extra event)", () => {
    // The card is looked up by the entry's own diary row id and rendered in
    // the entry's <li>; nothing inserts additional timeline rows.
    expect(TIMELINE_SRC).toContain("actionResponseCardByRowId.get(e.id)");
    expect(TIMELINE_SRC).toMatch(/map\.set\(memory\.response\.rowId/);
    expect(TIMELINE_SRC).toContain('variant="compact"');
    expect(TIMELINE_SRC).toContain("showActionLink={false}");
  });

  it("the Action responses filter derives from the same canonical predicate", () => {
    expect(TIMELINE_SRC).toContain("isActionResponseCandidateDetails");
    expect(TIMELINE_SRC).toMatch(/kinds\.push\("actionresponse"\)/);
    expect(TIMELINE_SRC).toMatch(/actionresponse:\s*0/);
    expect(TIMELINE_SRC).toMatch(/label="Action responses"/);
    expect(TIMELINE_SRC).toMatch(/count=\{eventCounts\.actionresponse\}/);
  });

  it("existing filters are preserved, not replaced", () => {
    expect(TIMELINE_SRC).toMatch(/label="Follow-ups"/);
    expect(TIMELINE_SRC).toMatch(/count=\{eventCounts\.followup\}/);
    expect(TIMELINE_SRC).toMatch(/stageFilter !== "all"/);
    expect(TIMELINE_SRC).toMatch(/eventFilter !== "all"/);
  });
});

describe("2. legacy follow-up rows remain visible and non-canonical", () => {
  it("marker rows produce no canonical memory (legacy presenter keeps them)", () => {
    expect(isActionResponseCandidateDetails(MARKER_ROW.details)).toBe(false);
    const memories = buildActionResponseMemories({
      responseRows: [MARKER_ROW],
      actions: [ACTION_ROW],
      sensorRows: [],
    });
    expect(memories).toEqual([]);
  });

  it("the evidence section still renders legacy records through the original view model", () => {
    expect(SECTION_SRC).toContain("buildActionFollowUpEvidenceViewModel");
    expect(SECTION_SRC).toContain("canonicalMemoryFromRecord");
    expect(SECTION_SRC).toContain("ACTION_RESPONSE_MEMORY_HISTORICAL_COPY");
  });
});

describe("3-4. Plant Detail scope", () => {
  it("exact-plant response appears; tent/grow-level appears on no plant card", () => {
    const plantScoped = buildActionResponseMemories({
      responseRows: [RESPONSE_ROW],
      actions: [ACTION_ROW],
      sensorRows: [],
    });
    expect(selectRecentPlantActionResponse(plantScoped, "plant-1")?.actionId).toBe("act-1");
    expect(selectRecentPlantActionResponse(plantScoped, "plant-2")).toBeNull();

    const tentScoped = buildActionResponseMemories({
      responseRows: [{ ...RESPONSE_ROW, plant_id: null }],
      actions: [{ ...ACTION_ROW, plant_id: null }],
      sensorRows: [],
    });
    expect(selectRecentPlantActionResponse(tentScoped, "plant-1")).toBeNull();
  });

  it("PlantDetail mounts exactly one calm card after the recap, and it is read-only", () => {
    expect(PLANT_DETAIL_SRC).toContain("PlantDetailRecentActionResponse");
    const recapIdx = PLANT_DETAIL_SRC.indexOf("<PlantDetailRecentActivityRecap");
    const cardIdx = PLANT_DETAIL_SRC.indexOf("<PlantDetailRecentActionResponse");
    const harvestIdx = PLANT_DETAIL_SRC.indexOf("<PlantDetailHarvestWatchCard");
    expect(recapIdx).toBeGreaterThan(-1);
    expect(cardIdx).toBeGreaterThan(recapIdx);
    expect(harvestIdx).toBeGreaterThan(cardIdx);
  });
});

describe("5. surfaces agree on outcome and evidence state", () => {
  it("Action Detail adapter and shared card view model agree for the same memory", () => {
    const memory = buildActionResponseMemories({
      responseRows: [
        { ...RESPONSE_ROW, details: { ...RESPONSE_ROW.details, photo_reference: "storage://diary-photos/u/g/plant-profiles/p/x.jpg" } },
      ],
      actions: [ACTION_ROW],
      sensorRows: [],
    })[0];
    const adapted = toActionFollowUpEvidenceViewModel({ memory });
    const shared = buildActionResponseMemoryCardViewModel({ memory })!;
    expect(adapted.outcomeLabel).toBe(shared.outcomeLabel);
    expect(adapted.hasPhotoEvidence).toBe(shared.photoState === "available");
    expect(adapted.photoReference).toBe(shared.photoReference);
    expect(adapted.note).toBe("Perked up.");
  });
});

describe("6-7. Plant Detail component behavior (loading/empty/failure states)", () => {
  async function renderPlantCard(state: unknown) {
    vi.resetModules();
    vi.doMock("@/hooks/useActionResponseMemory", () => ({
      useActionResponseMemory: () => ({ state, reload: () => {} }),
    }));
    vi.doMock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
    const { default: PlantDetailRecentActionResponse } = await import(
      "../components/PlantDetailRecentActionResponse"
    );
    return render(
      <MemoryRouter>
        <PlantDetailRecentActionResponse growId="grow-1" plantId="plant-1" />
      </MemoryRouter>,
    );
  }

  it("renders the card for an exact-plant memory with evidence intact", async () => {
    const memories = buildActionResponseMemories({
      responseRows: [{ ...RESPONSE_ROW, details: { ...RESPONSE_ROW.details, photo_reference: "https://bad/signed?token=1" } }],
      actions: [ACTION_ROW],
      sensorRows: [],
    });
    await renderPlantCard({ status: "ok", memories });
    await waitFor(() => {
      expect(screen.getByTestId("plant-detail-recent-action-response")).toBeTruthy();
    });
    // Invalid photo does not hide outcome/note.
    expect(screen.getByTestId("action-response-memory-photo-unavailable")).toBeTruthy();
    expect(screen.getByTestId("action-response-memory-outcome")).toBeTruthy();
    expect(screen.getByTestId("action-response-memory-note")).toBeTruthy();
  });

  it("renders nothing while loading, when empty, and when unavailable", async () => {
    for (const state of [
      { status: "loading" },
      { status: "idle" },
      { status: "unavailable" },
      { status: "ok", memories: [] },
    ]) {
      const { container, unmount } = await renderPlantCard(state);
      expect(container.textContent).toBe("");
      unmount();
    }
  });
});

describe("static safety — every new M5 file", () => {
  const M5_FILES = [
    "src/lib/actionResponseMemoryRules.ts",
    "src/lib/actionResponseMemoryViewModel.ts",
    "src/lib/actionResponseMemoryService.ts",
    "src/hooks/useActionResponseMemory.ts",
    "src/components/ActionResponseMemoryCard.tsx",
    "src/components/PlantDetailRecentActionResponse.tsx",
  ] as const;

  const FORBIDDEN: Array<[string, RegExp]> = [
    ["file input", /type=["']file["']/],
    ["camera capture", /\bcapture=/],
    ["storage upload", /\.upload\s*\(/],
    ["object URL", /createObjectURL/],
    ["service role", /service_role/i],
    ["edge invoke", /functions\.invoke/],
    ["AI provider", /openai|anthropic|gemini/i],
    ["queue write", /from\(["']action_queue["']\)[\s\S]{0,160}\.(insert|update|delete|upsert)\(/],
    ["alert write", /from\(["']alerts["']\)/],
    ["mqtt", /mqtt/i],
    ["relay", /\brelay\b/i],
    ["actuator", /\bactuator\b/i],
    ["device command", /device.command/i],
  ];

  it.each(M5_FILES)("%s exposes no forbidden surface", (rel) => {
    const src = stripSourceComments(read(rel));
    for (const [name, re] of FORBIDDEN) {
      expect(re.test(src), `${rel} must not contain ${name}`).toBe(false);
    }
  });

  it("mobile overflow regression: long content wraps, no fixed widths", () => {
    const card = read("src/components/ActionResponseMemoryCard.tsx");
    expect(card).toContain("break-words");
    expect(card).toContain("whitespace-pre-wrap");
    expect(card).toContain("flex-wrap");
    // No hard pixel widths that could overflow a 320px viewport.
    expect(card).not.toMatch(/\bw-\[\d{3,}px\]|min-w-\[\d{3,}px\]/);
  });

  it("new files never claim causation", () => {
    for (const rel of M5_FILES) {
      const src = read(rel);
      expect(src).not.toMatch(
        /\bworked\b|\bcured\b|\bproved\b|successful treatment|confirmed resolution/i,
      );
    }
  });
});
