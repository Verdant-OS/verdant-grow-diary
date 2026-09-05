/**
 * VisitCheckpointCue — presence/absence + PlantDetail mount + safety fences.
 * Mocks usePlantRecentActivity; pure parse/visibility covered in
 * visit-checkpoint-resurface-rules.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { composeGrowWalkCloseoutNote } from "@/lib/growWalkContracts";
import { stripSourceComments } from "./utils/stripSourceComments";

const useRecentMock = vi.fn();
vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: (id: string | null | undefined) => useRecentMock(id),
}));

import VisitCheckpointCue from "@/components/VisitCheckpointCue";

const ROOT = resolve(__dirname, "../..");
const COMP = stripSourceComments(
  readFileSync(resolve(ROOT, "src/components/VisitCheckpointCue.tsx"), "utf8"),
);
const RULES = stripSourceComments(
  readFileSync(resolve(ROOT, "src/lib/visitCheckpointResurfaceRules.ts"), "utf8"),
);
const PAGE = stripSourceComments(readFileSync(resolve(ROOT, "src/pages/PlantDetail.tsx"), "utf8"));

const PLANT_ID = "11111111-1111-4111-8111-111111111111";
const NOW_MS = Date.parse("2026-09-05T12:00:00.000Z");

function diaryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    plant_id: PLANT_ID,
    tent_id: null,
    event_type: "quick_log",
    note: composeGrowWalkCloseoutNote({
      observation: "Canopy look",
      nextCheckpoint: "72 hours",
    }),
    entry_at: "2026-09-04T12:00:00.000Z",
    details: { event_type: "note", source: "manual" },
    ...overrides,
  };
}

beforeEach(() => {
  useRecentMock.mockReset();
});

describe("VisitCheckpointCue render", () => {
  it("renders nothing while loading or on error", () => {
    useRecentMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const loading = render(<VisitCheckpointCue plantId={PLANT_ID} nowMs={NOW_MS} />);
    expect(loading.container).toBeEmptyDOMElement();
    loading.unmount();

    useRecentMock.mockReturnValue({ data: [], isLoading: false, isError: true });
    const errored = render(<VisitCheckpointCue plantId={PLANT_ID} nowMs={NOW_MS} />);
    expect(errored.container).toBeEmptyDOMElement();
  });

  it("renders nothing when recent notes lack Next checkpoint", () => {
    useRecentMock.mockReturnValue({
      data: [
        diaryRow({
          note: composeGrowWalkCloseoutNote({
            observation: "Just observing",
            action: "No change",
          }),
        }),
      ],
      isLoading: false,
      isError: false,
    });
    const { container } = render(<VisitCheckpointCue plantId={PLANT_ID} nowMs={NOW_MS} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("visit-checkpoint-cue")).toBeNull();
  });

  it("shows a read-only cue when a recent note has Next checkpoint: 72 hours", () => {
    useRecentMock.mockReturnValue({
      data: [diaryRow()],
      isLoading: false,
      isError: false,
    });
    render(<VisitCheckpointCue plantId={PLANT_ID} nowMs={NOW_MS} />);
    const cue = screen.getByTestId("visit-checkpoint-cue");
    expect(cue).toHaveAttribute("data-checkpoint", "72 hours");
    expect(screen.getByTestId("visit-checkpoint-cue-body").textContent).toContain("72 hours");
    expect(cue.textContent).toMatch(/Reminder only/i);
    expect(cue.textContent).not.toMatch(/Action Queue|Approve|Enqueue/i);
  });

  it("renders nothing without a plantId", () => {
    useRecentMock.mockReturnValue({ data: [diaryRow()], isLoading: false, isError: false });
    const { container } = render(<VisitCheckpointCue plantId={null} nowMs={NOW_MS} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("VisitCheckpointCue mount + safety", () => {
  it("PlantDetail mounts VisitCheckpointCue", () => {
    expect(PAGE).toMatch(/VisitCheckpointCue/);
    expect(PAGE).toMatch(/plantId=\{plant\.id\}/);
  });

  it("does not enqueue Action Queue or mutate from rules/presenter", () => {
    for (const src of [COMP, RULES]) {
      expect(src).not.toMatch(/action_queue/);
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.rpc\(/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/service_role/);
    }
  });
});
