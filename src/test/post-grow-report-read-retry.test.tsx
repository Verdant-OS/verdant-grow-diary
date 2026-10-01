import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
const io = vi.hoisted(() => ({
  reload: vi.fn(),
  gate: vi.fn(),
  status: "unavailable",
  save: vi.fn(),
  apply: vi.fn(),
}));
vi.mock("@/lib/react-router-compat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/react-router-compat")>()),
  useParams: () => ({ growId: "grow-a" }),
}));
vi.mock("@/hooks/usePostGrowLearningReportData", () => ({
  usePostGrowLearningReportData: () => ({
    status: io.status,
    report: null,
    yieldEfficiency: null,
    error: "Unable to load post-grow report.",
    reload: io.reload,
    saveLesson: io.save,
    applyLessonToNextGrow: io.apply,
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
import PostGrowLearningReport from "@/pages/PostGrowLearningReport";
beforeEach(() => {
  vi.clearAllMocks();
  io.status = "unavailable";
  io.gate.mockResolvedValue({ ok: true });
});
it("retries unavailable report reads without writes or repeating entitlement verification", async () => {
  render(
    <MemoryRouter>
      <PostGrowLearningReport />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByTestId("post-grow-report-error")).toBeInTheDocument());
  const gateCalls = io.gate.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Retry report" }));
  expect(io.reload).toHaveBeenCalledTimes(1);
  expect(io.gate).toHaveBeenCalledTimes(gateCalls);
  expect(io.save).not.toHaveBeenCalled();
  expect(io.apply).not.toHaveBeenCalled();
  expect(screen.queryByTestId("post-grow-export-print")).not.toBeInTheDocument();
});
it("withholds retry and export while the report read is pending", async () => {
  io.status = "loading";
  render(
    <MemoryRouter>
      <PostGrowLearningReport />
    </MemoryRouter>,
  );
  await waitFor(() => expect(io.gate).toHaveBeenCalled());
  expect(screen.getByTestId("post-grow-report-loading")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry report" })).not.toBeInTheDocument();
  expect(screen.queryByTestId("post-grow-export-print")).not.toBeInTheDocument();
});
