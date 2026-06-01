/**
 * Plant Detail Recent Activity recap — pure helper + render coverage +
 * static safety. Read-only and presentation-only. No writes,
 * schema/RLS/migrations, edge functions, storage, auth, automation,
 * device control, calendar/notification/email/reminder scheduling,
 * service_role, functions.invoke, or fake-live sensor data.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

const useRecentMock = vi.fn();
vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: (id: string | null | undefined) => useRecentMock(id),
}));

import {
  buildPlantRecentActivityRecap,
  PLANT_RECENT_ACTIVITY_RECAP_DEFAULT_LIMIT,
  PLANT_RECENT_ACTIVITY_RECAP_MAX_LIMIT,
} from "@/lib/plantRecentActivityRecap";
import type { PlantRecentActivityRow } from "@/lib/plantRecentActivityRules";
import PlantDetailRecentActivityRecap from "@/components/PlantDetailRecentActivityRecap";
import { PLANT_RELATIVE_TIMELINE_ANCHOR_ID } from "@/lib/plantDetailQuickActions";

const ROOT = resolve(__dirname, "../..");
const HELPER = readFileSync(
  resolve(ROOT, "src/lib/plantRecentActivityRecap.ts"),
  "utf8",
);
const COMPONENT = readFileSync(
  resolve(ROOT, "src/components/PlantDetailRecentActivityRecap.tsx"),
  "utf8",
);
const PAGE = readFileSync(resolve(ROOT, "src/pages/PlantDetail.tsx"), "utf8");

const FORBIDDEN = [
  /service_role/,
  /supabase\.from\(/,
  /functions\.invoke\(/,
  /\.rpc\(/,
  /\.insert\(/,
  /\.update\(/,
  /\.delete\(/,
  /\.upsert\(/,
  /calendar_events/,
  /\bnotifications\b/i,
  /\bemail\b/i,
  /\bsendgrid\b/i,
  /\bmailgun\b/i,
  /\bresend\b/i,
  /\bautopilot\b/i,
  /\bauto[-\s]?(execute|run|control)\b/i,
];

function row(p: Partial<PlantRecentActivityRow>): PlantRecentActivityRow {
  return {
    id: "row-1",
    eventType: "note",
    occurredAt: "2026-05-30T10:00:00.000Z",
    occurredAtLabel: "May 30",
    notePreview: "Looking healthy",
    plantId: "p1",
    tentId: null,
    hasPhoto: false,
    hasSnapshot: false,
    snapshotAt: null,
    snapshotStale: false,
    snapshotSourceLabel: null,
    isManualEntry: false,
    warnings: [],
    hasHardwareReadings: false,
    hardwareReadingLines: [],
    ...p,
  };
}

describe("buildPlantRecentActivityRecap", () => {
  it("returns empty for empty input", () => {
    expect(buildPlantRecentActivityRecap({ rows: [] })).toEqual([]);
    expect(buildPlantRecentActivityRecap({ rows: null })).toEqual([]);
  });

  it("keeps newest-first input order and respects default limit of 3", () => {
    const items = buildPlantRecentActivityRecap({
      rows: [
        row({ id: "a", eventType: "watering" }),
        row({ id: "b", eventType: "feeding" }),
        row({ id: "c", eventType: "photo" }),
        row({ id: "d", eventType: "training" }),
      ],
    });
    expect(items).toHaveLength(PLANT_RECENT_ACTIVITY_RECAP_DEFAULT_LIMIT);
    expect(items.map((i) => i.category)).toEqual([
      "watering",
      "feeding",
      "photos",
    ]);
  });

  it("clamps limit to [1, max]", () => {
    const rows = Array.from({ length: 10 }).map((_, i) =>
      row({ id: `r${i}` }),
    );
    expect(
      buildPlantRecentActivityRecap({ rows, limit: 0 }),
    ).toHaveLength(1);
    expect(
      buildPlantRecentActivityRecap({ rows, limit: 999 }),
    ).toHaveLength(PLANT_RECENT_ACTIVITY_RECAP_MAX_LIMIT);
  });

  it("derives category labels from classifyTimelineEntry buckets", () => {
    const items = buildPlantRecentActivityRecap({
      rows: [
        row({ id: "a", eventType: "watering" }),
        row({ id: "b", eventType: "pest_disease" }),
        row({ id: "c", eventType: "manual_snapshot" }),
      ],
    });
    expect(items[0].categoryLabel).toBe("Watering");
    expect(items[1].categoryLabel).toBe("Symptoms");
    expect(items[2].categoryLabel).toBe("Measurement");
  });

  it("uses note preview as summary when present, otherwise deterministic fallback", () => {
    const [a] = buildPlantRecentActivityRecap({
      rows: [row({ notePreview: "Watered 1L" })],
    });
    expect(a.summary).toBe("Watered 1L");

    const [b] = buildPlantRecentActivityRecap({
      rows: [row({ notePreview: "", hasPhoto: true })],
    });
    expect(b.summary).toBe("Photo logged.");

    const [c] = buildPlantRecentActivityRecap({
      rows: [row({ notePreview: "", hasSnapshot: true })],
    });
    expect(c.summary).toBe("Sensor snapshot logged.");

    const [d] = buildPlantRecentActivityRecap({
      rows: [row({ notePreview: "" })],
    });
    expect(d.summary).toBe("No details recorded.");
  });

  it("formats timestamp with fallback when ISO missing or invalid", () => {
    const [bad] = buildPlantRecentActivityRecap({
      rows: [
        row({
          occurredAt: null,
          occurredAtLabel: "",
        }),
      ],
    });
    expect(bad.timestampLabel).toBe("Unknown time");

    const [fb] = buildPlantRecentActivityRecap({
      rows: [
        row({
          occurredAt: "not-a-date",
          occurredAtLabel: "May 30",
        }),
      ],
    });
    expect(fb.timestampLabel).toBe("May 30");
  });

  it("photo rows resolve to the photos bucket regardless of eventType", () => {
    const items = buildPlantRecentActivityRecap({
      rows: [
        row({ id: "a", eventType: "note", hasPhoto: true }),
        row({ id: "b", eventType: "photo" }),
      ],
    });
    expect(items[0].category).toBe("photos");
    expect(items[1].category).toBe("photos");
  });

  it("does not expose internal ids, tentId, or snapshot source markers", () => {
    const items = buildPlantRecentActivityRecap({
      rows: [
        row({
          id: "secret-id",
          tentId: "secret-tent",
          snapshotSourceLabel: "secret-source",
        }),
      ],
    });
    const text = JSON.stringify(items);
    expect(text).not.toContain("secret-id");
    expect(text).not.toContain("secret-tent");
    expect(text).not.toContain("secret-source");
  });
});

describe("PlantDetailRecentActivityRecap render", () => {
  beforeEach(() => {
    useRecentMock.mockReset();
  });

  it("renders heading", () => {
    useRecentMock.mockReturnValue({ data: [], isLoading: false });
    render(<PlantDetailRecentActivityRecap plantId="p1" />);
    expect(screen.getByText(/Recent activity/i)).toBeInTheDocument();
  });

  it("renders loading state", () => {
    useRecentMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<PlantDetailRecentActivityRecap plantId="p1" />);
    expect(
      screen.getByTestId("plant-detail-recent-activity-recap-loading"),
    ).toBeInTheDocument();
  });

  it("renders empty state with helper copy", () => {
    useRecentMock.mockReturnValue({ data: [], isLoading: false });
    render(<PlantDetailRecentActivityRecap plantId="p1" />);
    expect(
      screen.getByText(/No recent activity yet\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Use Quick Log, manual sensor snapshots, or photos to start building plant memory\./,
      ),
    ).toBeInTheDocument();
  });

  it("shows latest 3 items in newest-first order", () => {
    const raw = [
      {
        id: "x",
        plant_id: "p1",
        entry_type: "photo",
        photo_url: "https://example.com/3.jpg",
        entry_at: "2026-06-03T10:00:00.000Z",
        note: "",
      },
      {
        id: "y",
        plant_id: "p1",
        entry_type: "feeding",
        entry_at: "2026-06-02T10:00:00.000Z",
        note: "Feed A",
      },
      {
        id: "z",
        plant_id: "p1",
        entry_type: "watering",
        entry_at: "2026-06-01T10:00:00.000Z",
        note: "Watered 1L",
      },
      {
        id: "w",
        plant_id: "p1",
        entry_type: "note",
        entry_at: "2026-05-30T10:00:00.000Z",
        note: "Older note",
      },
    ];
    useRecentMock.mockReturnValue({ data: raw, isLoading: false });
    render(<PlantDetailRecentActivityRecap plantId="p1" />);
    const items = screen.getAllByTestId(
      "plant-detail-recent-activity-recap-item",
    );
    expect(items).toHaveLength(3);
    expect(items.map((el) => el.getAttribute("data-category"))).toEqual([
      "photos",
      "feeding",
      "watering",
    ]);
  });

  it("View full timeline scrolls and focuses the timeline anchor", () => {
    useRecentMock.mockReturnValue({ data: [], isLoading: false });
    const anchor = document.createElement("div");
    anchor.id = PLANT_RELATIVE_TIMELINE_ANCHOR_ID;
    anchor.tabIndex = -1;
    document.body.appendChild(anchor);
    const scrollSpy = vi.fn();
    const focusSpy = vi.fn();
    (anchor as HTMLElement).scrollIntoView = scrollSpy as never;
    (anchor as HTMLElement).focus = focusSpy as never;
    render(<PlantDetailRecentActivityRecap plantId="p1" />);
    fireEvent.click(
      screen.getByTestId("plant-detail-recent-activity-recap-view-timeline"),
    );
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledTimes(1);
    document.body.removeChild(anchor);
  });

  it("does not leak internal ids or storage paths in visible UI", () => {
    const raw = [
      {
        id: "diary-uuid-1234",
        user_id: "user-uuid-5678",
        plant_id: "p1",
        entry_type: "watering",
        entry_at: "2026-06-01T10:00:00.000Z",
        note: "Watered 1L",
        details: {
          storage_path: "private/buckets/secret.jpg",
          token: "tok_secret",
        },
      },
    ];
    useRecentMock.mockReturnValue({ data: raw, isLoading: false });
    const { container } = render(
      <PlantDetailRecentActivityRecap plantId="p1" />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("diary-uuid-1234");
    expect(text).not.toContain("user-uuid-5678");
    expect(text).not.toContain("private/buckets/secret.jpg");
    expect(text).not.toContain("tok_secret");
  });
});

describe("Plant Detail recent activity recap — static safety", () => {
  it("helper has no React, fetch, or unsafe paths", () => {
    expect(HELPER).not.toMatch(/from\s+["']react["']/);
    expect(HELPER).not.toMatch(/\bfetch\(/);
    expect(HELPER).not.toMatch(/supabase/i);
    for (const re of FORBIDDEN) expect(HELPER).not.toMatch(re);
  });

  it("component avoids writes/RPC/unsafe paths", () => {
    for (const re of FORBIDDEN) expect(COMPONENT).not.toMatch(re);
  });

  it("page wires the recap in", () => {
    expect(PAGE).toMatch(/PlantDetailRecentActivityRecap/);
  });
});
