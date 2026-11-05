/**
 * Rendered error announcements for the post-grow report and the ingest inspector
 * (#2856 follow-up). Each page's failure sentence sits in a role="alert" element,
 * and the heading and Retry button stay outside it, so a screen reader announces
 * only the sentence.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

const io = vi.hoisted(() => ({
  gate: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@/lib/react-router-compat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/react-router-compat")>()),
  useParams: () => ({ growId: "grow-a" }),
}));
vi.mock("@/hooks/usePostGrowLearningReportData", () => ({
  usePostGrowLearningReportData: () => ({
    status: "unavailable",
    report: null,
    yieldEfficiency: null,
    error: null,
    reload: vi.fn(),
    saveLesson: vi.fn(),
    applyLessonToNextGrow: vi.fn(),
  }),
}));
vi.mock("@/hooks/usePlantMemoryEpisodes", () => ({
  usePlantMemoryEpisodes: () => ({ state: { status: "loading" } }),
}));
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({ entitlement: null, loading: true, lookupFailed: false }),
}));
vi.mock("@/hooks/usePremiumExportServerGate", () => ({
  checkPremiumExportEntitlement: io.gate,
}));
vi.mock("@/hooks/useIngestInspectorReadings", () => ({
  useIngestInspectorReadings: () => ({
    data: undefined,
    isLoading: false,
    error: new Error("boom"),
    refetch: io.refetch,
  }),
}));

import PostGrowLearningReport from "@/pages/PostGrowLearningReport";
import IngestInspector from "@/pages/IngestInspector";

beforeEach(() => {
  vi.clearAllMocks();
  io.gate.mockResolvedValue({ ok: true });
});

describe("post-grow report load failure", () => {
  it("announces only the failure sentence, not the heading or Retry button", async () => {
    render(
      <MemoryRouter>
        <PostGrowLearningReport />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId("post-grow-report-error")).toBeInTheDocument());

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This grow report could not be loaded.");

    const retry = screen.getByRole("button", { name: "Retry report" });
    expect(alert).not.toContainElement(retry);
    expect(within(alert).queryByRole("button")).toBeNull();

    const heading = screen.getByText("Report unavailable");
    expect(alert).not.toContainElement(heading);
    expect(alert).not.toHaveTextContent("Report unavailable");
  });
});

describe("ingest inspector load failure", () => {
  it("announces the failure sentence without the Retry button", () => {
    render(
      <MemoryRouter initialEntries={["/ingest-inspector"]}>
        <IngestInspector />
      </MemoryRouter>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn’t load recent sensor observations.");

    const retry = screen.getByTestId("ingest-inspector-retry");
    expect(screen.getByTestId("ingest-inspector-error")).toContainElement(retry);
    expect(alert).not.toContainElement(retry);
    expect(within(alert).queryByRole("button")).toBeNull();
  });
});
