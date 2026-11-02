/**
 * Issue #2691 — timeline entry times use the same local clock as Recent
 * Quick Logs. A raw ISO string must not render on the entry.
 *
 * Auth, storage, and network stay mocked. The history hook is a fixture,
 * so this file never reads Supabase.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { formatTimelineEntryTimestamp } from "@/lib/timelineEntryTimestampFormat";
import {
  formatRelativeTimelineEntryDetail,
  type RelativeTimelineItem,
} from "@/lib/relativeTimelineProjectionRules";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from() {
      throw new Error("network is mocked");
    },
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
    },
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: null, session: null, loading: false }),
}));

vi.mock("@/lib/react-router-compat", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("a", { href: to, ...rest }, children),
}));

vi.mock("@/hooks/useDiaryPhotoDisplayRows", () => ({
  useDiaryPhotoDisplayRows: (rows: ReadonlyArray<Record<string, unknown>> | undefined) => ({
    rows: (rows ?? []).map((row) => ({ ...row, photo_url: null })),
    isResolvingPrivatePhotos: false,
    isPrivatePhotoReadPaused: false,
    hasPrivatePhotoError: false,
    hasPhotoReference: false,
    refetchPrivatePhotos: async () => {},
  }),
}));

const history = vi.hoisted(() => ({ read: vi.fn() }));

vi.mock("@/hooks/usePlantRelativeTimelineHistory", () => ({
  usePlantRelativeTimelineHistory: () => {
    const read = history.read();
    return { ...read, totalCount: read?.data?.length ?? null };
  },
}));

import PlantRelativeTimelineSection from "@/components/PlantRelativeTimelineSection";

const ENTRY_AT = "2026-11-01T15:22:36.222Z";
const FRIENDLY = "Nov 1, 2026, 09:22 AM";
const RAW_ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const NOTE = "QA-SYNTH M1 observation of the canopy";
const PLANT = "plant-2691";
const ORIGINAL_TZ = process.env.TZ;

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.has(key) ? (values.get(key) as string) : null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
  };
}

function timelineItem(occurredAtLabel: string): RelativeTimelineItem {
  return {
    id: "entry-2691",
    eventType: "note",
    title: NOTE,
    occurredAt: ENTRY_AT,
    occurredAtLabel,
    plantDay: 12,
    stageDay: null,
    source: "note",
    stagePreset: null,
    plantId: PLANT,
    tentId: null,
  };
}

beforeEach(() => {
  process.env.TZ = "America/Chicago";
  const storage = memoryStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", memoryStorage());
  history.read.mockReturnValue({
    data: [
      {
        id: "entry-2691",
        plant_id: PLANT,
        entry_at: ENTRY_AT,
        entry_type: "note",
        note: NOTE,
        photo_url: null,
        details: null,
      },
    ],
    isLoading: false,
    isError: false,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("formatTimelineEntryTimestamp", () => {
  it("pins the Recent Quick Logs local clock for the reported instant", () => {
    expect(new Date(2026, 10, 1, 9, 22).toISOString()).toBe("2026-11-01T15:22:00.000Z");
    expect(formatTimelineEntryTimestamp(ENTRY_AT)).toBe(FRIENDLY);
    expect(formatTimelineEntryTimestamp(ENTRY_AT)).not.toMatch(RAW_ISO);
  });

  it("is null-safe and never returns a raw ISO string", () => {
    expect(formatTimelineEntryTimestamp(null)).toBe("Unknown time");
    expect(formatTimelineEntryTimestamp(undefined)).toBe("Unknown time");
    expect(formatTimelineEntryTimestamp("")).toBe("Unknown time");
    expect(formatTimelineEntryTimestamp("   ")).toBe("Unknown time");
    expect(formatTimelineEntryTimestamp("not-a-date")).toBe("Unknown time");
    expect(formatTimelineEntryTimestamp("2026-11-01T99:99:99.222Z")).toBe("Unknown time");
    expect(formatTimelineEntryTimestamp("2026-11-01T99:99:99.222Z")).not.toMatch(RAW_ISO);
  });
});

describe("timeline entry timestamp", () => {
  it("formats an ISO label through the shared clock", () => {
    const view = formatRelativeTimelineEntryDetail(timelineItem(ENTRY_AT));
    expect(view?.timestampLabel).toBe(FRIENDLY);
    expect(view?.timestampLabel).not.toMatch(RAW_ISO);
    expect(view?.timestampIsFallback).toBe(false);
  });

  it("leaves a non-ISO label untouched and still falls back when blank", () => {
    expect(formatRelativeTimelineEntryDetail(timelineItem("May 12"))?.timestampLabel).toBe(
      "May 12",
    );
    const blank = formatRelativeTimelineEntryDetail(timelineItem(""));
    expect(blank?.timestampIsFallback).toBe(true);
    expect(blank?.timestampLabel).toMatch(/no timestamp recorded/i);
  });

  it("renders the local clock and no raw ISO on the timeline entry", () => {
    render(<PlantRelativeTimelineSection plantId={PLANT} plantStartedAt="2026-10-20T00:00:00Z" />);
    const timestamp = screen.getByTestId("relative-timeline-timestamp");
    expect(timestamp).toHaveTextContent(FRIENDLY);
    expect(timestamp.textContent ?? "").not.toMatch(RAW_ISO);
    const card = screen.getByTestId("relative-timeline-item");
    expect(card.textContent ?? "").toContain("QA-SYNTH M1 observation");
    expect(card.textContent ?? "").not.toMatch(RAW_ISO);
  });
});
