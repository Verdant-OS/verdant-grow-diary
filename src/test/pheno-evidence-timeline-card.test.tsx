import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PhenoEvidenceTimelineCard from "@/components/PhenoEvidenceTimelineCard";
import type { ParsedPhenoEvidenceReceipt } from "@/lib/phenoEvidenceCaptureRules";

const receipt: ParsedPhenoEvidenceReceipt = {
  diaryEntryId: "diary-1",
  entryAt: "2026-07-14T12:00:00.000Z",
  huntId: "hunt-1",
  plantId: "plant-1",
  evidenceGoal: "structure",
  stage: "flower",
  hasPhoto: true,
  sensorContext: {
    attached: true,
    freshness: "stale",
    capturedAt: "2026-07-14T11:30:00.000Z",
  },
};

describe("PhenoEvidenceTimelineCard", () => {
  afterEach(cleanup);

  it("renders the manual goal receipt, observation, and explicit safety fence", () => {
    render(<PhenoEvidenceTimelineCard receipt={receipt} noteText="Strong lateral branching." />);
    expect(screen.getByText(/Pheno evidence · Structure/)).toBeInTheDocument();
    expect(screen.getByLabelText("Source: Manual")).toBeInTheDocument();
    expect(screen.getByText("Strong lateral branching.")).toBeInTheDocument();
    expect(
      screen.getByText(/no automatic selection, Action Queue item, or device control/i),
    ).toBeInTheDocument();
  });

  it("shows photo presence and sensor freshness without claiming health or live status", () => {
    render(<PhenoEvidenceTimelineCard receipt={receipt} noteText={null} />);
    expect(screen.getByTestId("pheno-evidence-photo-badge")).toHaveTextContent("Photo attached");
    expect(screen.getByTestId("pheno-evidence-sensor-badge")).toHaveTextContent(
      "Sensor context · Stale",
    );
    expect(screen.getByTestId("pheno-evidence-timeline-card").textContent).not.toMatch(
      /healthy|live/i,
    );
  });

  it("keeps unknown stage and absent attachments explicit by omission", () => {
    render(
      <PhenoEvidenceTimelineCard
        receipt={{ ...receipt, stage: null, hasPhoto: false, sensorContext: null }}
        noteText={null}
      />,
    );
    expect(screen.getByText(/Stage not recorded/)).toBeInTheDocument();
    expect(screen.queryByTestId("pheno-evidence-photo-badge")).toBeNull();
    expect(screen.queryByTestId("pheno-evidence-sensor-badge")).toBeNull();
  });
});
