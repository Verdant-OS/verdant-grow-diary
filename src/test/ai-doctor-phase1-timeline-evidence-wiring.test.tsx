import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AI_DOCTOR_PHASE1_TIMELINE_KIND } from "@/lib/aiDoctorPhase1TimelineDraft";
import type { QuickLogTimelineEntry } from "@/lib/quickLogTimelineGroupingViewModel";

const ISO = "2026-06-19T12:00:00.000Z";

const entriesRef: { current: QuickLogTimelineEntry[] } = { current: [] };

vi.mock("@/hooks/useQuickLogGroupedTimeline", () => ({
  useQuickLogGroupedTimeline: () => ({
    entries: entriesRef.current,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
  }),
  QUICK_LOG_GROUPED_TIMELINE_DEFAULT_LIMIT: 200,
}));

vi.mock("@/components/QuickLogV2Sheet", () => ({
  default: () => null,
}));

import QuickLogGroupedTimelineSection from "@/components/QuickLogGroupedTimelineSection";

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <QuickLogGroupedTimelineSection
          scope="plant"
          plantId="plant-1"
          growId="grow-1"
          tentId="tent-1"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const aiEvidenceEntry: QuickLogTimelineEntry = {
  kind: "action",
  occurredAt: ISO,
  action: {
    id: "evt-ai",
    kind: "note",
    source: "manual",
    plantId: "plant-1",
    tentId: "tent-1",
    occurredAt: ISO,
    noteText: "AI Doctor Phase 1 evidence for Plant 1.",
    aiDoctorPhase1Evidence: {
      diaryEntryId: "diary-1",
      entryAt: ISO,
      plantId: "plant-1",
      tentId: "tent-1",
      growId: "grow-1",
      details: {
        kind: AI_DOCTOR_PHASE1_TIMELINE_KIND,
        result: {
          summary: "Leaves yellowing on lower nodes.",
          likely_issue: "Possible early N deficiency",
          confidence: "low",
          risk_level: "low",
          evidence: ["lower-leaf chlorosis"],
          missing_information: ["recent runoff EC"],
        },
      },
    },
  },
  actionSourceLabel: "Manual",
};

const normalNoteEntry: QuickLogTimelineEntry = {
  kind: "action",
  occurredAt: "2026-06-19T11:00:00.000Z",
  action: {
    id: "evt-normal",
    kind: "note",
    source: "manual",
    plantId: "plant-1",
    tentId: "tent-1",
    occurredAt: "2026-06-19T11:00:00.000Z",
    noteText: "Just a normal grower note.",
  },
  actionSourceLabel: "Manual",
};

describe("QuickLog timeline → AI Doctor Phase 1 evidence wiring", () => {
  it("renders the styled evidence card for an AI Doctor Phase 1 entry", () => {
    entriesRef.current = [aiEvidenceEntry];
    renderSection();
    const card = screen.getByTestId(
      "ai-doctor-phase1-timeline-evidence-card",
    );
    expect(within(card).getByText("AI Doctor Phase 1 evidence")).toBeInTheDocument();
    expect(within(card).getByText("Evidence only")).toBeInTheDocument();
    expect(
      within(card).getByText("Leaves yellowing on lower nodes."),
    ).toBeInTheDocument();
    expect(
      within(card).getByTestId("ai-doctor-phase1-timeline-evidence-card-metadata"),
    ).toHaveTextContent("Saved date:");
    const link = within(card).getByTestId(
      "ai-doctor-phase1-timeline-evidence-card-review-link",
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain("plantId=plant-1");
    expect(link.getAttribute("href")).toContain("growId=grow-1");
    expect(link.getAttribute("href")).toContain("tentId=tent-1");
  });

  it("renders a normal note entry with the existing generic UI (no evidence card)", () => {
    entriesRef.current = [normalNoteEntry];
    renderSection();
    expect(
      screen.queryByTestId("ai-doctor-phase1-timeline-evidence-card"),
    ).toBeNull();
    expect(
      screen.getByTestId("quick-log-grouped-action-note"),
    ).toHaveTextContent("Just a normal grower note.");
  });

  it("filters the timeline to saved AI Doctor evidence entries", () => {
    entriesRef.current = [normalNoteEntry, aiEvidenceEntry];
    renderSection();
    fireEvent.click(
      screen.getByTestId("quick-log-grouped-timeline-filter-ai-doctor-evidence"),
    );
    expect(screen.getByTestId("ai-doctor-phase1-timeline-evidence-card")).toBeInTheDocument();
    expect(screen.queryByText("Just a normal grower note.")).toBeNull();
  });

  it("shows an AI Doctor evidence empty state with a results link", () => {
    entriesRef.current = [normalNoteEntry];
    renderSection();
    fireEvent.click(
      screen.getByTestId("quick-log-grouped-timeline-filter-ai-doctor-evidence"),
    );
    expect(
      screen.getByTestId("quick-log-grouped-timeline-ai-evidence-empty"),
    ).toBeInTheDocument();
    const link = screen.getByTestId(
      "quick-log-grouped-timeline-ai-evidence-results-link",
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain("/operator/ai-doctor-phase1");
    expect(link.getAttribute("href")).toContain("plantId=plant-1");
    expect(link.getAttribute("href")).toContain("growId=grow-1");
    expect(link.getAttribute("href")).toContain("tentId=tent-1");
  });

  it("preserves ordering and produces one row per saved evidence (no duplicates)", () => {
    entriesRef.current = [aiEvidenceEntry, normalNoteEntry];
    renderSection();
    const list = screen.getByTestId("quick-log-grouped-timeline-list");
    const items = Array.from(
      list.querySelectorAll<HTMLLIElement>(":scope > li"),
    );
    expect(items).toHaveLength(2);
    expect(
      within(items[0]).getByTestId("ai-doctor-phase1-timeline-evidence-card"),
    ).toBeInTheDocument();
    expect(
      within(items[1]).queryByTestId(
        "ai-doctor-phase1-timeline-evidence-card",
      ),
    ).toBeNull();
    expect(
      screen.getAllByTestId("ai-doctor-phase1-timeline-evidence-card"),
    ).toHaveLength(1);
  });

  it("falls back to normal note rendering when details are malformed", () => {
    entriesRef.current = [
      {
        ...aiEvidenceEntry,
        action: {
          ...aiEvidenceEntry.action,
          aiDoctorPhase1Evidence: {
            ...aiEvidenceEntry.action.aiDoctorPhase1Evidence!,
            details: "not-an-object",
          },
        },
      },
    ];
    renderSection();
    expect(
      screen.queryByTestId("ai-doctor-phase1-timeline-evidence-card"),
    ).toBeNull();
    expect(screen.getByTestId("quick-log-grouped-action-note")).toBeInTheDocument();
  });

  it("(static) hook contains read-only selects only — no mutations or AI calls", () => {
    const raw = readFileSync(
      resolve(process.cwd(), "src/hooks/useQuickLogGroupedTimeline.ts"),
      "utf8",
    );
    const src = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/[^\n]*/g, "");
    const forbidden = [
      ".insert(",
      ".update(",
      ".upsert(",
      ".delete(",
      ".rpc(",
      "functions.invoke",
      'from("action_queue"',
      "from('action_queue'",
      'from("alerts"',
      "from('alerts'",
      "service_role",
      "bridge_token",
      "openai",
      "anthropic",
      "lovable-api",
    ];
    for (const term of forbidden) {
      expect(src, `hook must not contain ${term}`).not.toContain(term);
    }
  });

  it("(static) merge helper is pure — no Supabase / AI / device imports", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/quickLogTimelineDiaryDetailsMerge.ts"),
      "utf8",
    );
    const forbidden = [
      "supabase",
      "fetch(",
      "functions.invoke",
      ".rpc(",
      ".insert(",
      ".update(",
      ".upsert(",
      ".delete(",
      "action_queue",
      "service_role",
      "bridge_token",
      "openai",
      "anthropic",
    ];
    for (const term of forbidden) {
      expect(src, `merge helper must not contain ${term}`).not.toContain(term);
    }
  });
});
