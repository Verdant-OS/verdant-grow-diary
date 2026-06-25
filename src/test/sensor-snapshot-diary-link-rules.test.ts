import { describe, it, expect } from "vitest";
import {
  matchSnapshotDiaryLinks,
  DIARY_LINK_EMPTY_LABEL,
  type DiaryTimelineCandidate,
} from "@/lib/sensorSnapshotDiaryLinkRules";

const baseSnap = {
  snapshotId: "snap-1",
  tentId: "t1",
  plantId: "p1",
  capturedAt: "2026-06-19T12:00:00Z",
};

describe("matchSnapshotDiaryLinks", () => {
  it("returns no links when candidates is empty", () => {
    expect(matchSnapshotDiaryLinks({ snapshot: baseSnap, candidates: [] })).toEqual([]);
  });

  it("exact sensor_snapshot_id match produces a link", () => {
    const cands: DiaryTimelineCandidate[] = [
      {
        id: "tl1",
        kind: "timeline",
        href: "/timeline/tl1",
        sensorSnapshotId: "snap-1",
      },
    ];
    const out = matchSnapshotDiaryLinks({ snapshot: baseSnap, candidates: cands });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "tl1",
      kind: "timeline",
      href: "/timeline/tl1",
      label: "View timeline item",
      matchKind: "exact_id",
    });
  });

  it("deterministic key match within tolerance produces a link", () => {
    const cands: DiaryTimelineCandidate[] = [
      {
        id: "d1",
        kind: "diary",
        href: "/diary/d1",
        tentId: "t1",
        plantId: "p1",
        occurredAt: "2026-06-19T12:00:30Z",
      },
    ];
    const out = matchSnapshotDiaryLinks({ snapshot: baseSnap, candidates: cands });
    expect(out).toHaveLength(1);
    expect(out[0].matchKind).toBe("deterministic_keys");
    expect(out[0].label).toBe("View diary entry");
  });

  it("ambiguous matches (>1 candidate) produce NO link", () => {
    const cands: DiaryTimelineCandidate[] = [
      {
        id: "a",
        kind: "timeline",
        href: "/timeline/a",
        tentId: "t1",
        plantId: "p1",
        occurredAt: "2026-06-19T12:00:05Z",
      },
      {
        id: "b",
        kind: "timeline",
        href: "/timeline/b",
        tentId: "t1",
        plantId: "p1",
        occurredAt: "2026-06-19T12:00:25Z",
      },
    ];
    expect(matchSnapshotDiaryLinks({ snapshot: baseSnap, candidates: cands })).toEqual([]);
  });

  it("does not link when tent/plant differ", () => {
    const cands: DiaryTimelineCandidate[] = [
      {
        id: "d1",
        kind: "diary",
        href: "/diary/d1",
        tentId: "other",
        plantId: "p1",
        occurredAt: "2026-06-19T12:00:00Z",
      },
    ];
    expect(matchSnapshotDiaryLinks({ snapshot: baseSnap, candidates: cands })).toEqual([]);
  });

  it("does not link when captured_at is outside tolerance", () => {
    const cands: DiaryTimelineCandidate[] = [
      {
        id: "d1",
        kind: "diary",
        href: "/diary/d1",
        tentId: "t1",
        plantId: "p1",
        occurredAt: "2026-06-19T13:00:00Z",
      },
    ];
    expect(matchSnapshotDiaryLinks({ snapshot: baseSnap, candidates: cands })).toEqual([]);
  });

  it("exposes a calm empty-state label constant", () => {
    expect(DIARY_LINK_EMPTY_LABEL).toMatch(/No matching/);
  });
});
