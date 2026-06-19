import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AiDoctorPhase1TimelineEvidenceCard } from "@/components/AiDoctorPhase1TimelineEvidenceCard";
import {
  buildAiDoctorPhase1TimelineEvidenceViewModel,
  type AiDoctorPhase1TimelineEvidenceViewModel,
} from "@/lib/aiDoctorPhase1TimelineEvidenceViewModel";
import { AI_DOCTOR_PHASE1_TIMELINE_KIND } from "@/lib/aiDoctorPhase1TimelineDraft";

function makeVm(): AiDoctorPhase1TimelineEvidenceViewModel {
  return buildAiDoctorPhase1TimelineEvidenceViewModel({
    id: "evt-1",
    plant_id: "plant-1",
    grow_id: "grow-1",
    tent_id: "tent-1",
    occurred_at: "2026-06-19T12:00:00.000Z",
    details: {
      kind: AI_DOCTOR_PHASE1_TIMELINE_KIND,
      result: {
        summary: "Leaves yellowing on lower nodes.",
        likely_issue: "Possible early N deficiency",
        confidence: "low",
        risk_level: "low",
        evidence: ["lower-leaf chlorosis", "stable VPD"],
        missing_information: ["recent runoff EC"],
      },
    },
  })!;
}

function renderCard(vm = makeVm()) {
  return render(
    <MemoryRouter>
      <AiDoctorPhase1TimelineEvidenceCard viewModel={vm} />
    </MemoryRouter>,
  );
}

describe("AiDoctorPhase1TimelineEvidenceCard", () => {
  it("renders title, badges, summary, and disclaimer", () => {
    renderCard();
    expect(screen.getByText("AI Doctor Phase 1 evidence")).toBeInTheDocument();
    expect(screen.getByText("AI Doctor Phase 1")).toBeInTheDocument();
    expect(screen.getByText("Evidence only")).toBeInTheDocument();
    expect(
      screen.getByText("Leaves yellowing on lower nodes."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Saved as evidence only\./i),
    ).toBeInTheDocument();
  });

  it("renders confidence, risk, likely issue, and counts", () => {
    renderCard();
    expect(screen.getByText("Possible early N deficiency")).toBeInTheDocument();
    expect(screen.getByText("low")).toBeInTheDocument(); // confidence
    expect(
      screen.getByTestId("ai-doctor-phase1-timeline-evidence-card-evidence-count"),
    ).toHaveTextContent("Evidence items: 2");
    expect(
      screen.getByTestId("ai-doctor-phase1-timeline-evidence-card-missing-count"),
    ).toHaveTextContent("Missing context: 1");
  });

  it("review CTA links to the Operator Phase 1 page with all ids", () => {
    renderCard();
    const link = screen.getByTestId(
      "ai-doctor-phase1-timeline-evidence-card-review-link",
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain("/operator/ai-doctor-phase1");
    expect(link.getAttribute("href")).toContain("plantId=plant-1");
    expect(link.getAttribute("href")).toContain("growId=grow-1");
    expect(link.getAttribute("href")).toContain("tentId=tent-1");
  });

  it("renders safely for a minimal/degraded view-model", () => {
    const vm = buildAiDoctorPhase1TimelineEvidenceViewModel({
      details: { kind: AI_DOCTOR_PHASE1_TIMELINE_KIND, result: null },
    })!;
    renderCard(vm);
    expect(
      screen.getByText("Saved evidence (no summary available)."),
    ).toBeInTheDocument();
  });

  it("does not render approve/send/execute/Action Queue/device-control copy", () => {
    const { container } = renderCard();
    const txt = container.textContent?.toLowerCase() ?? "";
    expect(txt).not.toContain("approve");
    expect(txt).not.toContain("execute");
    expect(txt).not.toContain("send to action");
    expect(txt).not.toContain("action queue");
    expect(txt).not.toContain("device");
    expect(txt).not.toContain("equipment");
    expect(txt).not.toContain("save to timeline");
    expect(container.querySelector("button")).toBeNull();
  });

  it("(static) card source contains no mutation handlers or write APIs", () => {
    const src = readFileSync(
      resolve(
        process.cwd(),
        "src/components/AiDoctorPhase1TimelineEvidenceCard.tsx",
      ),
      "utf8",
    );
    const forbidden = [
      "onSave",
      "onApprove",
      "onExecute",
      "supabase.from",
      "supabase.rpc",
      "functions.invoke",
      "action_queue",
      "alerts",
      "service_role",
      "bridge_token",
      ".insert(",
      ".update(",
      ".upsert(",
      ".delete(",
    ];
    for (const term of forbidden) {
      expect(src).not.toContain(term);
    }
  });
});
