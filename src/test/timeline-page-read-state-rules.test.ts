import { describe, expect, it } from "vitest";
import {
  buildTimelinePageReadKey,
  buildTimelinePageReadView,
  hasTimelineRequiredReadError,
  mergeTimelinePartialSources,
  TIMELINE_CORE_READ_SOURCES,
  TIMELINE_SUPPLEMENTAL_READ_SOURCES,
  type BuildTimelinePageReadViewInput,
  type TimelineCoreReadState,
} from "@/lib/timelinePageReadStateRules";

const ACTIVE_KEY = buildTimelinePageReadKey({
  ownerId: "owner-1",
  growId: "grow-1",
  startDate: null,
  endDate: null,
}) as string;

function viewInput(
  overrides: Partial<BuildTimelinePageReadViewInput> = {},
): BuildTimelinePageReadViewInput {
  return {
    growsLoading: false,
    growsError: null,
    growCount: 1,
    activeReadKey: ACTIVE_KEY,
    coreRead: { status: "success", readKey: ACTIVE_KEY },
    evidenceCount: 1,
    partialSources: [],
    ...overrides,
  };
}

describe("buildTimelinePageReadKey", () => {
  it("includes owner, grow, and both applied date bounds", () => {
    const key = buildTimelinePageReadKey({
      ownerId: "owner-1",
      growId: "grow-1",
      startDate: "2026-07-01",
      endDate: "2026-07-20",
    });
    expect(key).toBe('timeline:["owner-1","grow-1","2026-07-01","2026-07-20"]');
  });

  it("normalizes omitted, undefined, null, and blank bounds to one unbounded key", () => {
    const omitted = buildTimelinePageReadKey({ ownerId: "owner", growId: "grow" });
    const undefinedBounds = buildTimelinePageReadKey({
      ownerId: "owner",
      growId: "grow",
      startDate: undefined,
      endDate: undefined,
    });
    const nullBounds = buildTimelinePageReadKey({
      ownerId: "owner",
      growId: "grow",
      startDate: null,
      endDate: null,
    });
    const blankBounds = buildTimelinePageReadKey({
      ownerId: "owner",
      growId: "grow",
      startDate: "  ",
      endDate: "",
    });
    expect(omitted).toBe('timeline:["owner","grow",null,null]');
    expect([undefinedBounds, nullBounds, blankBounds]).toEqual([omitted, omitted, omitted]);
  });

  it.each([
    { ownerId: null, growId: "grow" },
    { ownerId: undefined, growId: "grow" },
    { ownerId: "", growId: "grow" },
    { ownerId: "  ", growId: "grow" },
    { ownerId: "owner", growId: null },
    { ownerId: "owner", growId: undefined },
    { ownerId: "owner", growId: "" },
    { ownerId: "owner", growId: "  " },
  ])("returns null when owner or grow is absent: %o", (input) => {
    expect(buildTimelinePageReadKey(input)).toBeNull();
  });

  it("uses collision-safe tuple encoding", () => {
    const a = buildTimelinePageReadKey({
      ownerId: "owner|grow",
      growId: "x",
      startDate: "y",
    });
    const b = buildTimelinePageReadKey({
      ownerId: "owner",
      growId: "grow|x",
      startDate: "y",
    });
    expect(a).not.toBe(b);
  });

  it("is deterministic and does not mutate its input", () => {
    const input = {
      ownerId: " owner ",
      growId: " grow ",
      startDate: " 2026-07-01 ",
      endDate: null,
    } as const;
    const before = { ...input };
    expect(buildTimelinePageReadKey(input)).toBe(buildTimelinePageReadKey(input));
    expect(input).toEqual(before);
  });
});

describe("buildTimelinePageReadView", () => {
  it("shows current-scope Timeline content and Sensors step only after success with evidence", () => {
    expect(buildTimelinePageReadView(viewInput())).toEqual({
      kind: "ready",
      showTimelineContent: true,
      showSensorsNextStep: true,
      showSupplementalLoading: false,
      retryTarget: null,
      partialSources: [],
    });
  });

  it("treats exact zero evidence as a confirmed ready empty state", () => {
    expect(buildTimelinePageReadView(viewInput({ evidenceCount: 0 }))).toEqual({
      kind: "ready_empty",
      showTimelineContent: true,
      showSensorsNextStep: false,
      showSupplementalLoading: false,
      retryTarget: null,
      partialSources: [],
    });
  });

  it.each([null, undefined, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1"])(
    "fails closed for invalid evidence count %o",
    (evidenceCount) => {
      expect(buildTimelinePageReadView(viewInput({ evidenceCount }))).toEqual({
        kind: "timeline_error",
        showTimelineContent: false,
        showSensorsNextStep: false,
        showSupplementalLoading: false,
        retryTarget: "timeline",
        partialSources: [],
      });
    },
  );

  it("gives an explicit grow read error precedence over loading and stale counts", () => {
    expect(
      buildTimelinePageReadView(
        viewInput({ growsError: new Error("RLS read failed"), growsLoading: true, growCount: 0 }),
      ),
    ).toMatchObject({
      kind: "grows_error",
      showTimelineContent: false,
      showSensorsNextStep: false,
      retryTarget: "grows",
    });
  });

  it("shows loading while the grow list is unsettled", () => {
    expect(buildTimelinePageReadView(viewInput({ growsLoading: true }))).toMatchObject({
      kind: "loading",
      showTimelineContent: false,
      showSensorsNextStep: false,
      retryTarget: null,
    });
  });

  it("shows no grows only for an error-free, settled, exact zero count", () => {
    expect(buildTimelinePageReadView(viewInput({ growCount: 0 }))).toEqual({
      kind: "no_grows",
      showTimelineContent: false,
      showSensorsNextStep: false,
      showSupplementalLoading: false,
      retryTarget: null,
      partialSources: [],
    });
  });

  it("rejects an unavailable URL grow scope after the grow list settles", () => {
    expect(buildTimelinePageReadView(viewInput({ hasInvalidScope: true }))).toEqual({
      kind: "scope_error",
      showTimelineContent: false,
      showSensorsNextStep: false,
      showSupplementalLoading: false,
      retryTarget: null,
      partialSources: [],
    });
  });

  it("does not call a URL scope invalid before the grow list settles", () => {
    expect(
      buildTimelinePageReadView(
        viewInput({ hasInvalidScope: true, growsLoading: true, growCount: 0 }),
      ).kind,
    ).toBe("loading");
    expect(
      buildTimelinePageReadView(
        viewInput({ hasInvalidScope: true, growsError: true, growCount: 0 }),
      ).kind,
    ).toBe("grows_error");
  });

  it.each([null, undefined, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, "0"])(
    "never turns invalid grow count %o into a confirmed empty state",
    (growCount) => {
      expect(buildTimelinePageReadView(viewInput({ growCount })).kind).toBe("grows_error");
    },
  );

  it.each([null, undefined, "", "  "])(
    "keeps the page loading while active-grow scope selection is pending: %o",
    (activeReadKey) => {
      expect(buildTimelinePageReadView(viewInput({ activeReadKey })).kind).toBe("loading");
    },
  );

  it("keeps an idle or absent core read loading", () => {
    expect(buildTimelinePageReadView(viewInput({ coreRead: { status: "idle" } })).kind).toBe(
      "loading",
    );
    expect(buildTimelinePageReadView(viewInput({ coreRead: null })).kind).toBe("loading");
  });

  it("keeps a current-scope core read loading without exposing stale content", () => {
    expect(
      buildTimelinePageReadView(
        viewInput({ coreRead: { status: "loading", readKey: ACTIVE_KEY } }),
      ),
    ).toMatchObject({
      kind: "loading",
      showTimelineContent: false,
      showSensorsNextStep: false,
    });
  });

  it("surfaces a current-scope core error with the Timeline retry target", () => {
    expect(
      buildTimelinePageReadView(viewInput({ coreRead: { status: "error", readKey: ACTIVE_KEY } })),
    ).toEqual({
      kind: "timeline_error",
      showTimelineContent: false,
      showSensorsNextStep: false,
      showSupplementalLoading: false,
      retryTarget: "timeline",
      partialSources: [],
    });
  });

  it.each(["loading", "error", "success"] as const)(
    "treats a %s result for another read scope as pending, never current",
    (status) => {
      const staleKey = buildTimelinePageReadKey({
        ownerId: "owner-1",
        growId: "grow-2",
      }) as string;
      expect(
        buildTimelinePageReadView(
          viewInput({ coreRead: { status, readKey: staleKey }, evidenceCount: 99 }),
        ),
      ).toMatchObject({
        kind: "loading",
        showTimelineContent: false,
        showSensorsNextStep: false,
      });
    },
  );

  it("treats a changed date bound as a different scope even for the same owner and grow", () => {
    const priorDateKey = buildTimelinePageReadKey({
      ownerId: "owner-1",
      growId: "grow-1",
      startDate: "2026-07-01",
      endDate: "2026-07-10",
    }) as string;
    const nextDateKey = buildTimelinePageReadKey({
      ownerId: "owner-1",
      growId: "grow-1",
      startDate: "2026-07-11",
      endDate: "2026-07-20",
    }) as string;
    expect(
      buildTimelinePageReadView(
        viewInput({
          activeReadKey: nextDateKey,
          coreRead: { status: "success", readKey: priorDateKey },
          evidenceCount: 8,
        }),
      ).kind,
    ).toBe("loading");
  });

  it("treats a changed owner as a different scope even for the same grow id", () => {
    const staleOwnerKey = buildTimelinePageReadKey({
      ownerId: "owner-old",
      growId: "grow-1",
    }) as string;
    expect(
      buildTimelinePageReadView(
        viewInput({ coreRead: { status: "success", readKey: staleOwnerKey } }),
      ).kind,
    ).toBe("loading");
  });

  it("retains stable partial-source labels only after current-scope core success", () => {
    expect(
      buildTimelinePageReadView(
        viewInput({
          partialSources: ["alert_events", "diary_photos", "alert_events"],
        }),
      ),
    ).toMatchObject({
      kind: "ready",
      partialSources: ["diary_photos", "alert_events"],
    });

    expect(
      buildTimelinePageReadView(
        viewInput({
          coreRead: { status: "loading", readKey: ACTIVE_KEY },
          partialSources: ["alert_events"],
        }),
      ).partialSources,
    ).toEqual([]);
  });

  it("shows linked-context loading only beside confirmed current-scope core content", () => {
    expect(buildTimelinePageReadView(viewInput({ supplementalLoading: true }))).toMatchObject({
      kind: "ready",
      showSupplementalLoading: true,
    });
    expect(
      buildTimelinePageReadView(
        viewInput({
          supplementalLoading: true,
          coreRead: { status: "loading", readKey: ACTIVE_KEY },
        }),
      ).showSupplementalLoading,
    ).toBe(false);
  });

  it("is deterministic and returns fresh arrays without mutating input", () => {
    const partialSources = ["alert_events", "diary_photos"] as const;
    const input = viewInput({ partialSources });
    const first = buildTimelinePageReadView(input);
    const second = buildTimelinePageReadView(input);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.partialSources).not.toBe(second.partialSources);
    expect(partialSources).toEqual(["alert_events", "diary_photos"]);
  });

  it("enforces the Sensors safety fence across every non-ready page kind", () => {
    const states: BuildTimelinePageReadViewInput[] = [
      viewInput({ growsError: true }),
      viewInput({ growsLoading: true }),
      viewInput({ growCount: 0 }),
      viewInput({ activeReadKey: null }),
      viewInput({ coreRead: { status: "idle" } }),
      viewInput({ coreRead: { status: "loading", readKey: ACTIVE_KEY } }),
      viewInput({ coreRead: { status: "error", readKey: ACTIVE_KEY } }),
      viewInput({ evidenceCount: 0 }),
    ];
    const views = states.map(buildTimelinePageReadView);
    expect(views.every((view) => view.showSensorsNextStep === false)).toBe(true);
    expect(views.map((view) => view.kind)).toEqual([
      "grows_error",
      "loading",
      "no_grows",
      "loading",
      "loading",
      "loading",
      "timeline_error",
      "ready_empty",
    ]);
  });
});

describe("Timeline read-source helpers", () => {
  it("exposes typed identifiers for both required and supplemental sources", () => {
    expect(TIMELINE_CORE_READ_SOURCES).toEqual(["diary_entries", "grow_events"]);
    expect(TIMELINE_SUPPLEMENTAL_READ_SOURCES).toEqual([
      "diary_photos",
      "action_queue_events",
      "alert_events",
    ]);
  });

  it("detects an error in either required result", () => {
    expect(
      hasTimelineRequiredReadError(
        { data: [], error: null },
        { data: null, error: new Error("grow_events unavailable") },
      ),
    ).toBe(true);
    expect(
      hasTimelineRequiredReadError(
        { data: null, error: new Error("diary_entries unavailable") },
        { data: [], error: null },
      ),
    ).toBe(true);
  });

  it("accepts only explicit error-null required results", () => {
    expect(
      hasTimelineRequiredReadError(
        { data: [], error: null },
        { data: [{ id: "g1" }], error: null },
      ),
    ).toBe(false);
    expect(hasTimelineRequiredReadError()).toBe(true);
    expect(hasTimelineRequiredReadError(null)).toBe(true);
    expect(hasTimelineRequiredReadError({ data: [] })).toBe(true);
    expect(hasTimelineRequiredReadError({ data: [], error: undefined })).toBe(true);
    expect(hasTimelineRequiredReadError({ data: null, error: null })).toBe(true);
  });

  it("deduplicates supplemental sources in canonical order", () => {
    expect(
      mergeTimelinePartialSources(["alert_events", "diary_photos"], "action_queue_events", [
        "diary_photos",
        "alert_events",
      ]),
    ).toEqual(["diary_photos", "action_queue_events", "alert_events"]);
  });

  it("is null-safe and ignores invalid labels defensively", () => {
    expect(
      mergeTimelinePartialSources(null, undefined, [
        null,
        undefined,
        "not_a_source" as never,
        "alert_events",
      ]),
    ).toEqual(["alert_events"]);
  });

  it("is deterministic across input order and returns a fresh array", () => {
    const a = mergeTimelinePartialSources(["alert_events", "diary_photos"]);
    const b = mergeTimelinePartialSources(["diary_photos", "alert_events"]);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it("does not accept required sources as supplemental partial labels", () => {
    expect(
      mergeTimelinePartialSources([
        "diary_entries" as never,
        "grow_events" as never,
        "action_queue_events",
      ]),
    ).toEqual(["action_queue_events"]);
  });
});
