/**
 * PHENOHUNT stress testing — diary links + management controls.
 *
 * Covers pure filter/sort helper, the diary-linked display component
 * (renders when present, hides when empty), and the observations list
 * (edit updates allowed fields + preserves created_at, delete removes
 * only the selected observation and confirms first). Static safety scan
 * guards against AI, Action Queue, automation, device, sensor-ingest,
 * and service_role in the new files.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DiaryStressObservationsSection from "@/components/DiaryStressObservationsSection";
import PhenoStressObservationsList from "@/components/PhenoStressObservationsList";
import {
  filterAndSortStressObservations,
} from "@/lib/pheno/phenoStressFilterSort";
import type { PhenoStressObservationRow } from "@/lib/pheno/phenoStressObservationsApi";

function makeRow(
  overrides: Partial<PhenoStressObservationRow> = {},
): PhenoStressObservationRow {
  return {
    id: overrides.id ?? "obs-1",
    userId: "u1",
    huntId: "h1",
    plantId: overrides.plantId ?? "plant-a",
    stressFactor: overrides.stressFactor ?? "Drought",
    status: overrides.status ?? "planned",
    startDate: overrides.startDate ?? "2026-06-01",
    endDate: overrides.endDate ?? null,
    intensity: overrides.intensity ?? "low",
    plantResponse: overrides.plantResponse ?? null,
    recoveryNotes: overrides.recoveryNotes ?? null,
    yieldImpactNotes: overrides.yieldImpactNotes ?? null,
    diseasePestNotes: overrides.diseasePestNotes ?? null,
    recommendation: overrides.recommendation ?? "keep",
    linkedDiaryEntryId: overrides.linkedDiaryEntryId ?? null,
    notes: overrides.notes ?? null,
    createdAt: overrides.createdAt ?? "2026-06-01T00:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-06-01T00:00:00Z",
  };
}

describe("filterAndSortStressObservations", () => {
  const rows: readonly PhenoStressObservationRow[] = [
    makeRow({
      id: "1",
      plantId: "plant-b",
      status: "planned",
      intensity: "high",
      recommendation: "reject",
      createdAt: "2026-06-01T00:00:00Z",
    }),
    makeRow({
      id: "2",
      plantId: "plant-a",
      status: "observed",
      intensity: "moderate",
      recommendation: "watch",
      createdAt: "2026-06-05T00:00:00Z",
      endDate: "2026-06-06",
      plantResponse: "leaf curl",
    }),
    makeRow({
      id: "3",
      plantId: "plant-c",
      status: "observed",
      intensity: "low",
      recommendation: "keep",
      createdAt: "2026-06-03T00:00:00Z",
      endDate: "2026-06-04",
      plantResponse: "no visible change",
    }),
  ];

  it("filters by status / intensity / recommendation", () => {
    expect(
      filterAndSortStressObservations(rows, { status: "observed" }).map((r) => r.id),
    ).toEqual(["2", "3"]);
    expect(
      filterAndSortStressObservations(rows, { intensity: "high" }).map((r) => r.id),
    ).toEqual(["1"]);
    expect(
      filterAndSortStressObservations(rows, { recommendation: "keep" }).map(
        (r) => r.id,
      ),
    ).toEqual(["3"]);
  });

  it("sorts by newest, oldest, intensity, recommendation, and candidate", () => {
    expect(
      filterAndSortStressObservations(rows, { sortBy: "newest" }).map((r) => r.id),
    ).toEqual(["2", "3", "1"]);
    expect(
      filterAndSortStressObservations(rows, { sortBy: "oldest" }).map((r) => r.id),
    ).toEqual(["1", "3", "2"]);
    // intensity high → moderate → low
    expect(
      filterAndSortStressObservations(rows, { sortBy: "intensity" }).map(
        (r) => r.id,
      ),
    ).toEqual(["1", "2", "3"]);
    // recommendation keep → watch → reject
    expect(
      filterAndSortStressObservations(rows, { sortBy: "recommendation" }).map(
        (r) => r.id,
      ),
    ).toEqual(["3", "2", "1"]);
    // candidate ID a → b → c
    expect(
      filterAndSortStressObservations(rows, { sortBy: "candidate" }).map(
        (r) => r.id,
      ),
    ).toEqual(["2", "1", "3"]);
  });
});

describe("DiaryStressObservationsSection", () => {
  it("renders linked observations when present", () => {
    const rows = [
      makeRow({
        id: "linked-1",
        linkedDiaryEntryId: "diary-1",
        stressFactor: "Heat",
        intensity: "moderate",
        status: "observed",
        recommendation: "watch",
        plantResponse: "wilting tips",
      }),
    ];
    render(
      <DiaryStressObservationsSection
        diaryEntryId="diary-1"
        plantId="plant-a"
        preloaded={rows}
        candidateLabels={{ "plant-a": "Cand-A" }}
        buildCandidateHref={(pid) => `/candidates/${pid}`}
      />,
    );
    expect(screen.getByTestId("diary-stress-observations-diary-1")).toBeInTheDocument();
    expect(screen.getByTestId("diary-stress-row-linked-1")).toBeInTheDocument();
    expect(screen.getByTestId("diary-stress-link-linked-1")).toHaveAttribute(
      "href",
      "/candidates/plant-a",
    );
    expect(screen.getByText("Cand-A")).toBeInTheDocument();
    cleanup();
  });

  it("renders nothing (no noisy empty UI) when no observations are linked", () => {
    const { container } = render(
      <DiaryStressObservationsSection diaryEntryId="diary-x" preloaded={[]} />,
    );
    expect(container.firstChild).toBeNull();
    cleanup();
  });

  it("filters out rows that don't match the diary entry or its plant", () => {
    const rows = [
      makeRow({ id: "other", linkedDiaryEntryId: "diary-other", plantId: "plant-z" }),
    ];
    const { container } = render(
      <DiaryStressObservationsSection
        diaryEntryId="diary-1"
        plantId="plant-a"
        preloaded={rows}
      />,
    );
    expect(container.firstChild).toBeNull();
    cleanup();
  });
});

describe("PhenoStressObservationsList — edit & delete", () => {
  const baseRows: PhenoStressObservationRow[] = [
    makeRow({
      id: "row-1",
      plantId: "plant-a",
      status: "observed",
      intensity: "moderate",
      recommendation: "watch",
      startDate: "2026-06-01",
      endDate: "2026-06-05",
      plantResponse: "leaf curl",
      createdAt: "2026-06-01T00:00:00Z",
      updatedAt: "2026-06-01T00:00:00Z",
    }),
    makeRow({
      id: "row-2",
      plantId: "plant-b",
      status: "planned",
      intensity: "high",
      recommendation: "reject",
      startDate: "2026-06-02",
      createdAt: "2026-06-02T00:00:00Z",
    }),
  ];

  it("edit → save calls onUpdate with allowed fields and never sends created_at", async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    const onDelete = vi.fn().mockResolvedValue(true);
    render(
      <PhenoStressObservationsList
        rows={baseRows}
        candidates={[
          { candidateId: "plant-a", candidateLabel: "Cand-A" },
          { candidateId: "plant-b", candidateLabel: "Cand-B" },
        ]}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByTestId("stress-edit-row-1"));
    const notes = screen.getByTestId("stress-edit-notes-row-1") as HTMLTextAreaElement;
    fireEvent.change(notes, { target: { value: "updated notes" } });
    fireEvent.click(screen.getByTestId("stress-edit-save-row-1"));

    // wait for microtask flush
    await Promise.resolve();
    await Promise.resolve();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [id, payload] = onUpdate.mock.calls[0];
    expect(id).toBe("row-1");
    expect(payload.notes).toBe("updated notes");
    // Allowed fields present
    expect(payload).toEqual(
      expect.objectContaining({
        plantId: "plant-a",
        stressFactor: expect.any(String),
        status: "observed",
        startDate: "2026-06-01",
        endDate: "2026-06-05",
        intensity: "moderate",
        recommendation: "watch",
      }),
    );
    // created_at and updated_at MUST NOT be sent (preserved DB-side)
    expect(payload).not.toHaveProperty("createdAt");
    expect(payload).not.toHaveProperty("created_at");
    expect(payload).not.toHaveProperty("updatedAt");
    expect(payload).not.toHaveProperty("updated_at");
    // Never a hunt or user rebind on update
    expect(payload).not.toHaveProperty("userId");
    expect(payload).not.toHaveProperty("huntId");
    cleanup();
  });

  it("delete calls onDelete only for the confirmed row and never touches others", async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    const onDelete = vi.fn().mockResolvedValue(true);
    render(
      <PhenoStressObservationsList
        rows={baseRows}
        onUpdate={onUpdate}
        onDelete={onDelete}
        confirmDelete={() => true}
      />,
    );
    fireEvent.click(screen.getByTestId("stress-delete-row-2"));
    await Promise.resolve();
    await Promise.resolve();
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith("row-2");
    expect(onUpdate).not.toHaveBeenCalled();
    cleanup();
  });

  it("delete is aborted when user cancels the confirmation prompt", () => {
    const onDelete = vi.fn().mockResolvedValue(true);
    render(
      <PhenoStressObservationsList
        rows={baseRows}
        onUpdate={vi.fn()}
        onDelete={onDelete}
        confirmDelete={() => false}
      />,
    );
    fireEvent.click(screen.getByTestId("stress-delete-row-1"));
    expect(onDelete).not.toHaveBeenCalled();
    cleanup();
  });

  it("applies filter and sort controls to the visible rows", () => {
    render(
      <PhenoStressObservationsList
        rows={baseRows}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    // default newest first: row-2 (2026-06-02) then row-1
    const initial = screen.getAllByTestId(/^stress-row-/);
    expect(initial.map((el) => el.getAttribute("data-testid"))).toEqual([
      "stress-row-row-2",
      "stress-row-row-1",
    ]);

    fireEvent.change(screen.getByTestId("stress-filter-status"), {
      target: { value: "observed" },
    });
    const observedOnly = screen.getAllByTestId(/^stress-row-/);
    expect(observedOnly).toHaveLength(1);
    expect(observedOnly[0].getAttribute("data-testid")).toBe("stress-row-row-1");
    cleanup();
  });
});

describe("safety scan — no AI / Action Queue / automation / device / sensor ingest", () => {
  const files = [
    "src/components/DiaryStressObservationsSection.tsx",
    "src/components/PhenoStressObservationsList.tsx",
    "src/lib/pheno/phenoStressFilterSort.ts",
  ];
  const FORBIDDEN = [
    "action_queue",
    "actionqueue",
    "openai",
    "anthropic",
    "gemini",
    "sensor_readings",
    "sensoringest",
    "mqtt",
    "webhook",
    "service_role",
  ];
  for (const f of files) {
    it(`${f} avoids forbidden surfaces`, () => {
      const src = readFileSync(path.resolve(process.cwd(), f), "utf8").toLowerCase();
      for (const needle of FORBIDDEN) {
        expect(src).not.toContain(needle);
      }
    });
  }
});
