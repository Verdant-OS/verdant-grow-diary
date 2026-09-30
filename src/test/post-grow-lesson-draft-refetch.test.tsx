import { beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

const io = vi.hoisted(() => ({
  growId: "grow-a",
  owner: "owner-a",
  status: "ready" as "ready" | "loading" | "unavailable",
  report: null as null | {
    eligible: boolean;
    header: {
      growId: string;
      growName: string;
      stageLabel: string;
      archived: boolean;
      yieldGrams: null;
    };
    lesson: { entryId: string | null; text: string };
    sensorReadingSources: [];
    environment: [];
  },
  gate: vi.fn(),
  save: vi.fn(),
  reload: vi.fn(),
}));
vi.mock("@/lib/react-router-compat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/react-router-compat")>()),
  useParams: () => ({ growId: io.growId }),
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: io.owner } }) }));
vi.mock("@/hooks/usePostGrowLearningReportData", () => ({
  usePostGrowLearningReportData: () => ({
    status: io.status,
    report: io.status === "ready" ? io.report : null,
    yieldEfficiency: null,
    error: "Unable to load post-grow report.",
    reload: io.reload,
    saveLesson: io.save,
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
vi.mock("@/components/PostGrowLearningReportCards", () => ({
  ActionEffectivenessCard: () => null,
  DataCompletenessBadge: () => null,
  EnvironmentStabilityCard: () => null,
  ExportSummaryButtons: () => null,
  LessonsCard: ({
    lesson,
    onLessonChange,
    onSave,
  }: {
    lesson: string;
    onLessonChange: (value: string) => void;
    onSave: () => void;
  }) => (
    <>
      <textarea
        data-testid="post-grow-lesson-textarea"
        value={lesson}
        onChange={(event) => onLessonChange(event.target.value)}
      />
      <button onClick={onSave}>Save lesson</button>
    </>
  ),
  PhotoGridCard: () => null,
  PostGrowExecutiveSummaryCard: () => null,
  PostGrowReportActionSafetyNote: () => null,
  PostGrowReportHeaderHelper: () => null,
  PostGrowReportTopSummaryPanel: () => null,
  PostHarvestPerformanceCard: () => null,
}));
import PostGrowLearningReport from "@/pages/PostGrowLearningReport";

function savedLesson(text: string, entryId: string | null = "lesson-a") {
  return {
    eligible: true,
    header: {
      growId: io.growId,
      growName: io.growId,
      stageLabel: "Harvest",
      archived: true,
      yieldGrams: null,
    },
    lesson: { entryId, text },
    sensorReadingSources: [] as [],
    environment: [] as [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  io.growId = "grow-a";
  io.owner = "owner-a";
  io.status = "ready";
  io.report = savedLesson("Saved lesson");
  io.gate.mockResolvedValue({ ok: true });
  io.save.mockResolvedValue({ ok: true });
});

function mount() {
  return render(
    <MemoryRouter>
      <PostGrowLearningReport />
    </MemoryRouter>,
  );
}

async function lessonBox() {
  return (await screen.findByTestId("post-grow-lesson-textarea")) as HTMLTextAreaElement;
}

it("keeps an unsaved draft through focus refetch, failure, retry, and unchanged evidence", async () => {
  const view = mount();
  const input = await lessonBox();
  await waitFor(() => expect(input.value).toBe("Saved lesson"));
  fireEvent.change(input, { target: { value: "Grower's unsaved lesson" } });

  window.addEventListener(
    "focus",
    () => {
      io.status = "loading";
    },
    { once: true },
  );
  fireEvent.focus(window);
  view.rerender(
    <MemoryRouter>
      <PostGrowLearningReport />
    </MemoryRouter>,
  );
  expect(screen.getByTestId("post-grow-report-loading")).toBeInTheDocument();
  io.status = "unavailable";
  view.rerender(
    <MemoryRouter>
      <PostGrowLearningReport />
    </MemoryRouter>,
  );
  expect(screen.getByTestId("post-grow-report-error")).toBeInTheDocument();
  io.report = savedLesson("");
  io.status = "ready";
  view.rerender(
    <MemoryRouter>
      <PostGrowLearningReport />
    </MemoryRouter>,
  );
  expect((await lessonBox()).value).toBe("Grower's unsaved lesson");
  io.report = savedLesson("Saved lesson");
  view.rerender(
    <MemoryRouter>
      <PostGrowLearningReport />
    </MemoryRouter>,
  );
  expect((await lessonBox()).value).toBe("Grower's unsaved lesson");
  expect(io.save).not.toHaveBeenCalled();
});

it("accepts changed saved text when pristine but protects edits on the same record", async () => {
  const view = mount();
  const input = await lessonBox();
  await waitFor(() => expect(input.value).toBe("Saved lesson"));
  io.report = savedLesson("Updated elsewhere");
  view.rerender(
    <MemoryRouter>
      <PostGrowLearningReport />
    </MemoryRouter>,
  );
  await waitFor(() => expect(input.value).toBe("Updated elsewhere"));
  fireEvent.change(input, { target: { value: "My pending edit" } });
  io.report = savedLesson("Another external update");
  view.rerender(
    <MemoryRouter>
      <PostGrowLearningReport />
    </MemoryRouter>,
  );
  expect(input.value).toBe("My pending edit");
});

it("resets for a different lesson record, grow, or owner", async () => {
  const view = mount();
  const input = await lessonBox();
  await waitFor(() => expect(input.value).toBe("Saved lesson"));
  fireEvent.change(input, { target: { value: "Pending A" } });
  io.report = savedLesson("New record", "lesson-b");
  view.rerender(
    <MemoryRouter>
      <PostGrowLearningReport />
    </MemoryRouter>,
  );
  await waitFor(() => expect(input.value).toBe("New record"));

  fireEvent.change(input, { target: { value: "Pending B" } });
  io.growId = "grow-b";
  io.status = "loading";
  view.rerender(
    <MemoryRouter>
      <PostGrowLearningReport />
    </MemoryRouter>,
  );
  io.report = savedLesson("Grow B lesson", "lesson-b");
  io.status = "ready";
  view.rerender(
    <MemoryRouter>
      <PostGrowLearningReport />
    </MemoryRouter>,
  );
  const growBInput = await lessonBox();
  await waitFor(() => expect(growBInput.value).toBe("Grow B lesson"));

  fireEvent.change(growBInput, { target: { value: "Pending C" } });
  io.owner = "owner-b";
  io.status = "loading";
  view.rerender(
    <MemoryRouter>
      <PostGrowLearningReport />
    </MemoryRouter>,
  );
  io.report = savedLesson("Owner B lesson", "lesson-b");
  io.status = "ready";
  view.rerender(
    <MemoryRouter>
      <PostGrowLearningReport />
    </MemoryRouter>,
  );
  const ownerBInput = await lessonBox();
  await waitFor(() => expect(ownerBInput.value).toBe("Owner B lesson"));
});

it("saves the current draft and accepts its refreshed saved text", async () => {
  const view = mount();
  const input = await lessonBox();
  await waitFor(() => expect(input.value).toBe("Saved lesson"));
  fireEvent.change(input, { target: { value: "  Newly saved lesson  " } });
  fireEvent.click(screen.getByRole("button", { name: "Save lesson" }));
  await waitFor(() => expect(io.save).toHaveBeenCalledWith("  Newly saved lesson  "));
  io.report = savedLesson("Newly saved lesson");
  view.rerender(
    <MemoryRouter>
      <PostGrowLearningReport />
    </MemoryRouter>,
  );
  await waitFor(() => expect(input.value).toBe("Newly saved lesson"));
});

it.each(["First saved and more", ""])(
  "keeps a %j draft typed while a first lesson save creates its record",
  async (laterDraft) => {
    let finishSave!: (value: { ok: true }) => void;
    io.save.mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    io.report = savedLesson("", null);
    const view = mount();
    const input = await lessonBox();
    fireEvent.change(input, { target: { value: "First saved" } });
    fireEvent.click(screen.getByRole("button", { name: "Save lesson" }));
    expect(io.save).toHaveBeenCalledWith("First saved");
    fireEvent.change(input, { target: { value: laterDraft } });
    io.report = savedLesson("First saved", "new-lesson-id");
    view.rerender(
      <MemoryRouter>
        <PostGrowLearningReport />
      </MemoryRouter>,
    );
    expect(input.value).toBe(laterDraft);
    await act(async () => finishSave({ ok: true }));
    expect(input.value).toBe(laterDraft);
  },
);
