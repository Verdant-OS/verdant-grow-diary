from pathlib import Path


def replace(path: str, old: str, new: str, expected: int = 1) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(
            f"{path}: expected {expected} exact match(es), found {count}\n"
            f"--- expected seam ---\n{old[:1400]}"
        )
    file.write_text(text.replace(old, new))


def write(path: str, content: str) -> None:
    Path(path).write_text(content)


write(
    "src/test/quick-log-timeline-navigation-target.test.ts",
    '''/**
 * Quick Log → canonical grow-scoped Timeline navigation target.
 */
import { describe, it, expect } from "vitest";
import {
  buildQuickLogTimelineNavTarget,
  QUICK_LOG_TIMELINE_CTA_LABEL,
} from "@/lib/quickLogTimelineNavigationTarget";

describe("buildQuickLogTimelineNavTarget", () => {
  it("builds the exact grow + plant + tent + event deep link", () => {
    const target = buildQuickLogTimelineNavTarget({
      growId: "grow-1",
      targetType: "plant",
      targetId: "plant-1",
      tentId: "tent-1",
      growEventId: "event-1",
    });

    expect(target).toEqual({
      path: "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1",
      hash: "timeline-entry-event-1",
      href: "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1#timeline-entry-event-1",
    });
  });

  it("builds a grow-scoped tent target without a plant filter", () => {
    const target = buildQuickLogTimelineNavTarget({
      growId: "grow-1",
      targetType: "tent",
      targetId: "tent-9",
      growEventId: "event-9",
    });

    expect(target?.href).toBe(
      "/timeline?growId=grow-1&tentId=tent-9#timeline-entry-event-9",
    );
    expect(target?.href).not.toContain("plantId=");
  });

  it("keeps a feed-style grow target scoped even when only tent context remains", () => {
    const target = buildQuickLogTimelineNavTarget({
      growId: "grow-1",
      targetType: null,
      targetId: null,
      tentId: "tent-1",
      growEventId: "feeding-event",
    });

    expect(target?.href).toBe(
      "/timeline?growId=grow-1&tentId=tent-1#timeline-entry-feeding-event",
    );
  });

  it("does not invent a hash when the writer returns no event id", () => {
    const target = buildQuickLogTimelineNavTarget({
      growId: "grow-1",
      targetType: "plant",
      targetId: "plant-1",
      tentId: "tent-1",
      growEventId: null,
    });

    expect(target).toMatchObject({
      path: "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1",
      hash: "",
      href: "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1",
    });
    expect(target?.href).not.toContain("#timeline");
  });

  it("fails closed when the confirmed grow id is missing or blank", () => {
    for (const growId of [null, undefined, "", "   "]) {
      expect(
        buildQuickLogTimelineNavTarget({
          growId,
          targetType: "plant",
          targetId: "plant-1",
          growEventId: "event-1",
        }),
      ).toBeNull();
    }
  });

  it("emits a grow-only Timeline path when no entity filter is known", () => {
    expect(
      buildQuickLogTimelineNavTarget({
        growId: "grow-1",
        targetType: null,
        targetId: null,
      }),
    ).toEqual({
      path: "/timeline?growId=grow-1",
      hash: "",
      href: "/timeline?growId=grow-1",
    });
  });

  it("drops an unsafe event anchor instead of emitting an invalid fragment", () => {
    const target = buildQuickLogTimelineNavTarget({
      growId: "grow-1",
      targetType: "plant",
      targetId: "plant-1",
      growEventId: "not safe / event",
    });

    expect(target?.hash).toBe("");
    expect(target?.href).toBe("/timeline?growId=grow-1&plantId=plant-1");
  });

  it("URL-encodes every id deterministically", () => {
    const target = buildQuickLogTimelineNavTarget({
      growId: "grow / 1",
      targetType: "plant",
      targetId: "plant/1",
      tentId: "tent one",
    });

    expect(target?.href).toBe(
      "/timeline?growId=grow%20%2F%201&plantId=plant%2F1&tentId=tent+one",
    );
  });

  it("exposes the approved post-save CTA label", () => {
    expect(QUICK_LOG_TIMELINE_CTA_LABEL).toBe("View diary");
  });
});
''',
)

write(
    "src/test/quick-log-timeline-cta-integration.test.tsx",
    '''/**
 * QuickLogV2Sheet — canonical grow-scoped Timeline CTA integration.
 *
 * Every confirmed save uses the same global Timeline route, keeps the
 * server-verified grow in the URL, preserves target filters, and never
 * re-runs a writer when the grower opens the saved diary entry.
 */
import { beforeEach, describe, expect, fireEvent, render, screen, waitFor, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent as rtlFireEvent, render as rtlRender, screen as rtlScreen, waitFor as rtlWaitFor } from "@testing-library/react";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { QUICK_LOG_TIMELINE_CTA_LABEL } from "@/lib/quickLogTimelineNavigationTarget";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  storageUpload: vi.fn(),
  storageRemove: vi.fn(),
  insert: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastMessage: vi.fn(),
  navigate: vi.fn(),
  wateringWriter: vi.fn(),
  feedingWriter: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mocks.rpc(...args),
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => mocks.storageUpload(...args),
        remove: (...args: unknown[]) => mocks.storageRemove(...args),
      }),
    },
    from: () => ({ insert: (...args: unknown[]) => mocks.insert(...args) }),
  },
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Grow 1", stage: "veg" }],
  }),
}));
vi.mock("@/lib/writeQuickLogWateringTypedEvent", () => ({
  writeQuickLogWateringTypedEvent: (...args: unknown[]) => mocks.wateringWriter(...args),
}));
vi.mock("@/lib/writeFeedingTypedEvent", () => ({
  writeFeedingTypedEvent: (...args: unknown[]) => mocks.feedingWriter(...args),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
    message: (...args: unknown[]) => mocks.toastMessage(...args),
  },
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useInRouterContext: () => true,
    useNavigate: () => mocks.navigate,
  };
});

function renderSheet(defaultTargetKey: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const onOpenChange = vi.fn();
  rtlRender(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet
        open={true}
        onOpenChange={onOpenChange}
        defaultTargetKey={defaultTargetKey}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

function latestToastAction(): { message: string; label: string; onClick: () => void } {
  const [message, options] = mocks.toastSuccess.mock.calls.at(-1) ?? [];
  const action = (options as { action?: { label: string; onClick: () => void } })?.action;
  if (!action) throw new Error("Expected toast.success to expose a Timeline action");
  return { message: String(message), label: action.label, onClick: action.onClick };
}

function save() {
  rtlFireEvent.click(rtlScreen.getByTestId("qlv2-save"));
}

async function clickPostSaveView() {
  rtlFireEvent.click(await rtlScreen.findByTestId("quick-log-post-save-view"));
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.storageRemove.mockResolvedValue({ data: null, error: null });
  mocks.insert.mockResolvedValue({ data: null, error: null });
  mocks.wateringWriter.mockResolvedValue({ ok: true, eventId: "water-event", reused: false });
  mocks.feedingWriter.mockResolvedValue({ ok: true, eventId: "feed-event", reused: false });
  document.body.innerHTML = "";
  (URL as unknown as { createObjectURL: (file: unknown) => string }).createObjectURL = () =>
    "blob:mock";
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { pathname: "/elsewhere", search: "", hash: "", assign: vi.fn() },
  });
});

describe("Quick Log V2 → canonical Timeline", () => {
  it("opens the exact saved plant in the verified grow and does not write again", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, grow_event_id: "note-event", environment_event_id: null },
      error: null,
    });
    renderSheet("plant:plant-1");
    save();

    await rtlWaitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    const toastAction = latestToastAction();
    expect(toastAction.label).toBe(QUICK_LOG_TIMELINE_CTA_LABEL);
    expect(toastAction.message).toBe("Log saved");
    expect(await rtlScreen.findByTestId("quick-log-post-save-description")).toHaveTextContent(
      "Added to Grow 1.",
    );

    const writesBefore = mocks.rpc.mock.calls.length;
    await clickPostSaveView();
    expect(mocks.navigate).toHaveBeenCalledWith(
      "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1#timeline-entry-note-event",
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(writesBefore);
  });

  it("opens a tent save in the grow Timeline without inventing a hash", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, grow_event_id: null, environment_event_id: null },
      error: null,
    });
    renderSheet("tent:tent-1");
    save();
    await rtlWaitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());

    await clickPostSaveView();
    expect(mocks.navigate).toHaveBeenCalledWith("/timeline?growId=grow-1&tentId=tent-1");
    expect(mocks.navigate.mock.calls[0][0]).not.toContain("#timeline");
  });

  it("same-page navigation scrolls to the saved entry instead of pushing again", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, grow_event_id: "same-page-event", environment_event_id: null },
      error: null,
    });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        pathname: "/timeline",
        search: "?growId=grow-1&plantId=plant-1&tentId=tent-1",
        hash: "",
        assign: vi.fn(),
      },
    });
    const entry = document.createElement("div");
    entry.id = "timeline-entry-same-page-event";
    const scroll = vi.fn();
    entry.scrollIntoView = scroll;
    document.body.appendChild(entry);

    renderSheet("plant:plant-1");
    save();
    await rtlWaitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    await clickPostSaveView();

    expect(scroll).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("keeps structured watering on the same canonical route contract", async () => {
    renderSheet("plant:plant-1");
    rtlFireEvent.click(rtlScreen.getByRole("button", { name: "Water" }));
    rtlFireEvent.change(rtlScreen.getByLabelText("Volume (ml)"), {
      target: { value: "500" },
    });
    save();
    await rtlWaitFor(() => expect(mocks.wateringWriter).toHaveBeenCalledTimes(1));

    await clickPostSaveView();
    expect(mocks.navigate).toHaveBeenCalledWith(
      "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1#timeline-entry-water-event",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps structured feeding grow-scoped instead of dropping to bare Timeline", async () => {
    renderSheet("plant:plant-1");
    rtlFireEvent.click(rtlScreen.getByRole("button", { name: "Feed" }));
    rtlFireEvent.change(rtlScreen.getByLabelText("Nutrient line"), {
      target: { value: "veg-line" },
    });
    rtlFireEvent.change(rtlScreen.getByLabelText("Product 1 name"), {
      target: { value: "Base A" },
    });
    rtlFireEvent.change(rtlScreen.getByLabelText("Product 1 amount"), {
      target: { value: "2" },
    });
    rtlFireEvent.change(rtlScreen.getByLabelText("Applied volume (ml)"), {
      target: { value: "750" },
    });
    save();
    await rtlWaitFor(() => expect(mocks.feedingWriter).toHaveBeenCalledTimes(1));

    const toastAction = latestToastAction();
    expect(toastAction.label).toBe("View diary");
    await clickPostSaveView();
    expect(mocks.navigate).toHaveBeenCalledWith(
      "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1#timeline-entry-feed-event",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps photo partial-success navigation on the saved core event", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, grow_event_id: "photo-event", environment_event_id: null },
      error: null,
    });
    mocks.storageUpload.mockResolvedValue({ data: { path: "photo.jpg" }, error: null });
    renderSheet("plant:plant-1");

    const input = rtlScreen.getByTestId("qlv2-photo-library-input") as HTMLInputElement;
    const file = new File(["image"], "plant.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", { value: [file] });
    rtlFireEvent.change(input);
    save();
    await rtlWaitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Log and photo saved", expect.anything()),
    );

    const writesBefore = mocks.rpc.mock.calls.length;
    latestToastAction().onClick();
    expect(mocks.navigate).toHaveBeenCalledWith(
      "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1#timeline-entry-photo-event",
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(writesBefore);
  });
});
'''.replace(
        'import { beforeEach, describe, expect, fireEvent, render, screen, waitFor, vi } from "vitest";\n',
        'import { beforeEach, describe, expect, vi } from "vitest";\n',
    ),
)

replace(
    "src/test/one-tent-loop-navigation-rules.test.ts",
    '''  it("routes quick-log → timeline and preserves a valid Timeline tent as a Sensors intent", () => {
    expect(resolveOneTentLoopNextStep("quick-log").href).toBe("/timeline");
    expect(resolveOneTentLoopNextStep("timeline").href).toBe("/sensors");
''',
    '''  it("routes quick-log → the exact grow Timeline and fails closed without a setup", () => {
    expect(resolveOneTentLoopNextStep("quick-log")).toMatchObject({
      href: null,
      disabled: true,
      disabledReason: ONE_TENT_LOOP_DISABLED_COPY,
    });
    expect(resolveOneTentLoopNextStep("quick-log", { growId: "grow-1" })).toMatchObject({
      href: "/timeline?growId=grow-1",
      disabled: false,
      disabledReason: null,
    });
    expect(resolveOneTentLoopNextStep("timeline").href).toBe("/sensors");
''',
)

replace(
    "src/test/quicklog-post-save-target-plant.test.tsx",
    '''  rpcMock: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
''',
    '''  rpcMock: vi.fn().mockResolvedValue({
    data: { ok: true, grow_event_id: "legacy-event" },
    error: null,
  }),
''',
)
replace(
    "src/test/quicklog-post-save-target-plant.test.tsx",
    '''  rpcMock.mockResolvedValue({ data: { ok: true }, error: null });
''',
    '''  rpcMock.mockResolvedValue({
    data: { ok: true, grow_event_id: "legacy-event" },
    error: null,
  });
''',
)
replace(
    "src/test/quicklog-post-save-target-plant.test.tsx",
    '''  it("reveals a 'View {target plant}' action with the saved plant id after save", async () => {
''',
    '''  it("reveals a canonical grow-scoped View diary action after save", async () => {
''',
)
replace(
    "src/test/quicklog-post-save-target-plant.test.tsx",
    '''    expect(link.getAttribute("href")).toBe("/plants/p2");
    expect(link.getAttribute("data-target-plant-id")).toBe("p2");
    expect(link.textContent ?? "").toMatch(/View timeline/);
''',
    '''    expect(link.getAttribute("href")).toBe(
      "/timeline?growId=g1&plantId=p2&tentId=t1#timeline-entry-legacy-event",
    );
    expect(link.getAttribute("data-target-grow-id")).toBe("g1");
    expect(link.getAttribute("data-target-plant-id")).toBe("p2");
    expect(link.textContent ?? "").toMatch(/View diary/);
    expect(screen.getByTestId("quick-log-post-save-title")).toHaveTextContent(
      "Saved to your diary",
    );
    expect(screen.getByTestId("quick-log-post-save-description")).toHaveTextContent(
      "Added to Grow #1.",
    );
''',
)
replace(
    "src/test/quicklog-post-save-target-plant.test.tsx",
    '''  it("View target plant button is keyboard reachable and focusable", async () => {
''',
    '''  it("View diary action is keyboard reachable and focusable", async () => {
''',
)

write(
    "src/test/quick-log-save-hardening-rules.test.ts",
    '''import { describe, expect, it } from "vitest";
import {
  QUICK_LOG_CLOSE_BLOCKED_HINT,
  QUICK_LOG_POST_SAVE_ANOTHER_LABEL,
  QUICK_LOG_POST_SAVE_CLOSE_LABEL,
  QUICK_LOG_POST_SAVE_TITLE,
  QUICK_LOG_POST_SAVE_VIEW_LABEL,
  QUICK_LOG_SAVE_FAILED_MESSAGE,
  buildQuickLogPostSaveDescription,
  shouldBlockQuickLogClose,
} from "@/lib/quickLogSaveGuardRules";

describe("Quick Log successful-save language", () => {
  it("uses the approved diary copy on both Quick Log presenters", () => {
    expect(QUICK_LOG_POST_SAVE_TITLE).toBe("Saved to your diary");
    expect(QUICK_LOG_POST_SAVE_VIEW_LABEL).toBe("View diary");
    expect(QUICK_LOG_POST_SAVE_ANOTHER_LABEL).toBe("Log another");
    expect(QUICK_LOG_POST_SAVE_CLOSE_LABEL).toBe("Dismiss");
    expect(QUICK_LOG_SAVE_FAILED_MESSAGE).toBe(
      "Save failed. Your draft is still here. Check your connection and try again.",
    );
    expect(QUICK_LOG_CLOSE_BLOCKED_HINT).toContain("Save in progress");
  });
});

describe("buildQuickLogPostSaveDescription", () => {
  it("names the human-readable setup and no opaque ids", () => {
    const description = buildQuickLogPostSaveDescription({
      targetName: "Skywalker #2",
      tentName: "Tent A",
      growName: "Fall 2026",
      action: "note",
      photoAttached: false,
    });
    expect(description).toBe("Added to Fall 2026.");
    expect(description).not.toMatch(/grow[_-]?id|plant[_-]?id|tent[_-]?id/i);
  });

  it("falls back conservatively when the setup name is unavailable", () => {
    expect(
      buildQuickLogPostSaveDescription({
        targetName: "Plant 1",
        growName: null,
        action: "watering",
        photoAttached: true,
      }),
    ).toBe("Saved to your diary.");
  });

  it("is deterministic and never claims yield, quality, or diagnosis", () => {
    const input = {
      targetName: "P1",
      tentName: "T1",
      growName: "G1",
      action: "harvest",
      photoAttached: true,
    } as const;
    expect(buildQuickLogPostSaveDescription(input)).toBe(
      buildQuickLogPostSaveDescription(input),
    );
    expect(buildQuickLogPostSaveDescription(input)).not.toMatch(
      /yield|quality|diagnos|grade|certain/i,
    );
  });
});

describe("shouldBlockQuickLogClose", () => {
  it("blocks close while saving or synchronously in flight", () => {
    expect(shouldBlockQuickLogClose({ saving: true, inFlight: false })).toBe(true);
    expect(shouldBlockQuickLogClose({ saving: false, inFlight: true })).toBe(true);
    expect(shouldBlockQuickLogClose({ saving: true, inFlight: true })).toBe(true);
  });

  it("allows close when idle", () => {
    expect(shouldBlockQuickLogClose({ saving: false, inFlight: false })).toBe(false);
  });
});
''',
)

replace(
    "src/test/quick-log-save-guard-rules.test.ts",
    '''    expect(QUICK_LOG_POST_SAVE_VIEW_LABEL).toBe("View timeline");
    expect(QUICK_LOG_POST_SAVE_ANOTHER_LABEL).toBe("Log another");
    expect(QUICK_LOG_POST_SAVE_CLOSE_LABEL).toBe("Close");
''',
    '''    expect(QUICK_LOG_POST_SAVE_VIEW_LABEL).toBe("View diary");
    expect(QUICK_LOG_POST_SAVE_ANOTHER_LABEL).toBe("Log another");
    expect(QUICK_LOG_POST_SAVE_CLOSE_LABEL).toBe("Dismiss");
''',
)

replace(
    "src/test/quick-log-v2-sheet-feeding.test.tsx",
    '''  it("routes feed confirmations to the real global typed-history anchor", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/QuickLogV2Sheet.tsx"),
      "utf8",
    );
    expect(source).toMatch(
      /showTimelineConfirmation\\(FEEDING_SAVE_SUCCESS_MESSAGE,[\\s\\S]*?targetType:\\s*null,[\\s\\S]*?targetId:\\s*null,[\\s\\S]*?growEventId/,
    );
    expect(source).toMatch(/postSave\\.action === "feed" \\? null : postSave\\.targetType/);
    const feedingPanel = readFileSync(
      resolve(process.cwd(), "src/components/FeedingHistoryPanel.tsx"),
      "utf8",
    );
    expect(feedingPanel).toContain("id={row.timelineAnchorId ?? undefined}");
  });
''',
    '''  it("keeps feed confirmations on the same verified grow/target route contract", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/QuickLogV2Sheet.tsx"),
      "utf8",
    );
    expect(source).toMatch(
      /showTimelineConfirmation\\(FEEDING_SAVE_SUCCESS_MESSAGE,[\\s\\S]*?growId:\\s*resolved\\.growId,[\\s\\S]*?targetType:\\s*resolved\\.targetType,[\\s\\S]*?targetId:\\s*resolved\\.targetId,[\\s\\S]*?growEventId/,
    );
    expect(source).not.toMatch(/postSave\\.action === "feed" \\? null/);
    const feedingPanel = readFileSync(
      resolve(process.cwd(), "src/components/FeedingHistoryPanel.tsx"),
      "utf8",
    );
    expect(feedingPanel).toContain("id={row.timelineAnchorId ?? undefined}");
  });
''',
)

replace(
    "e2e/quick-log-activation-handoff.spec.ts",
    '''    // Close the dialog and verify the REAL Timeline surface shows the entry.
    await page.getByTestId("quick-log-post-save-close").click();
    await page.goto(`/timeline?growId=${GROW_ID}`);
    await acceptReconsentGateIfShown(page);
    await expect(
      page.getByTestId("timeline-entry").filter({ hasText: NOTE_TEXT }).first(),
    ).toBeVisible();

    expect(world.rpcCalls, "still exactly one write after navigation").toBe(1);
''',
    '''    // Click the REAL post-save CTA. It must carry the confirmed setup,
    // target filters, and exact saved grow-event anchor — no manual test-only
    // navigation and no dependence on whichever setup was previously active.
    const expectedHref =
      `/timeline?growId=${GROW_ID}&plantId=${PLANT_ID}&tentId=${TENT_ID}` +
      `#timeline-entry-${GROW_EVENT_ID}`;
    await page.getByTestId("quick-log-view-target-plant").click();
    await expect(page).toHaveURL(expectedHref);
    await acceptReconsentGateIfShown(page);
    await expect(
      page.getByTestId("timeline-entry").filter({ hasText: NOTE_TEXT }).first(),
    ).toBeVisible();

    // The same deep link must remain durable after reload/new-tab style entry.
    await page.reload();
    await acceptReconsentGateIfShown(page);
    await expect(page).toHaveURL(expectedHref);
    await expect(
      page.getByTestId("timeline-entry").filter({ hasText: NOTE_TEXT }).first(),
    ).toBeVisible();

    expect(world.rpcCalls, "still exactly one write after navigation and reload").toBe(1);
''',
)

print("Issue 675 test migration applied.")
